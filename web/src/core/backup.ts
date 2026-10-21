// Export / import chats as JSON. API keys and other secrets are never exported. Licensed under GPL-3.0.
import { getAll, kv, putMany } from './db';
import { newId } from './providers/http';
import type { MemoryFile } from './tools/memory';
import type { Conversation, Message } from './types';

export const EXPORT_FORMAT = '0x-sneaky-alpha-chats';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  conversations: Conversation[];
  messages: Message[];
  memory?: { active: string; files: MemoryFile[] };
}

export async function exportAll(): Promise<ExportFile> {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    conversations: await getAll<Conversation>('conversations'),
    messages: await getAll<Message>('messages'),
    memory: { active: (await kv.get<string>('memory.active')) ?? '', files: await getAll<MemoryFile>('memory') },
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validMessage(m: any): m is Message {
  return m && isStr(m.id) && isStr(m.convId) && (m.parentId === null || isStr(m.parentId)) && (m.role === 'user' || m.role === 'assistant')
    && isStr(m.text) && Array.isArray(m.parts) && isNum(m.createdAt);
}

function validConversation(c: any): c is Conversation {
  return c && isStr(c.id) && isStr(c.title) && isNum(c.createdAt) && isNum(c.updatedAt) && c.selected && typeof c.selected === 'object';
}

/** Imports chats as new copies (fresh ids), so importing twice never overwrites anything. */
export async function importAll(raw: string): Promise<{ conversations: number; messages: number }> {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Not a JSON file.');
  }
  if (data?.format !== EXPORT_FORMAT || !Array.isArray(data.conversations) || !Array.isArray(data.messages)) {
    throw new Error('This is not a 0x Sneaky Alpha chat export.');
  }
  if (data.version > EXPORT_VERSION) throw new Error('This export is from a newer version of the app.');
  const convs = (data.conversations as unknown[]).filter(validConversation);
  const ids = new Map<string, string>();
  for (const c of convs) ids.set(c.id, newId('c_'));
  const msgs = (data.messages as unknown[]).filter(validMessage).filter((m) => ids.has(m.convId));
  for (const m of msgs) ids.set(m.id, newId('m_'));
  const map = (id: string | null) => (id === null ? null : ids.get(id) ?? null);

  const items: Parameters<typeof putMany>[0] = [];
  for (const c of convs) {
    const selected: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.selected)) {
      const nk = k === 'root' ? 'root' : ids.get(k);
      const nv = isStr(v) ? ids.get(v) : undefined;
      if (nk && nv) selected[nk] = nv;
    }
    items.push({ store: 'conversations', value: { ...c, id: ids.get(c.id)!, selected } });
  }
  for (const m of msgs) {
    const parentId = map(m.parentId);
    if (m.parentId !== null && parentId === null) continue; // orphan
    items.push({
      store: 'messages',
      value: { ...m, id: ids.get(m.id)!, convId: ids.get(m.convId)!, parentId, status: m.status === 'streaming' ? 'stopped' : m.status },
    });
  }
  if (data.memory && Array.isArray(data.memory.files)) {
    for (const f of data.memory.files) {
      if (f && isStr(f.name) && isStr(f.content)) items.push({ store: 'memory', value: { name: f.name, description: isStr(f.description) ? f.description : '', content: f.content, updatedAt: isNum(f.updatedAt) ? f.updatedAt : Date.now() } });
    }
  }
  await putMany(items);
  if (isStr(data.memory?.active) && data.memory.active.trim() && !((await kv.get<string>('memory.active')) ?? '').trim()) {
    await kv.set('memory.active', data.memory.active);
  }
  return { conversations: convs.length, messages: items.filter((i) => i.store === 'messages').length };
}
