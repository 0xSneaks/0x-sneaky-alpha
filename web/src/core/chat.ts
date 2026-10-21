// Chat engine: conversations, branching operations, generation and stop. Licensed under GPL-3.0.
import { deleteConversation, listConversations, loadMessages, saveConversation, saveMessage, saveTurn } from './conversations';
import { runTurn, historyToWire } from './generate';
import { newId } from './providers/http';
import { adapterFor } from './providers/catalog';
import { redact } from './redact';
import { getSecret, secretName } from './secrets';
import { baseUrlFor, providerById, settingsStore } from './settings';
import { createStore } from './store';
import { activePath, keyOf, selectSibling } from './tree';
import type { Attachment, Conversation, Message, ToolCall, ToolDef } from './types';
import { readsPdf } from './attachments';

export interface ToolHost {
  /** Tools offered for this request and the system-prompt additions they need. */
  prepare(conv: Conversation): Promise<{ tools: ToolDef[]; system: string[]; nativeSearch: boolean }>;
  execute(call: ToolCall, signal: AbortSignal): Promise<string>;
}

let toolHost: ToolHost = {
  prepare: async () => ({ tools: [], system: [], nativeSearch: false }),
  execute: async (call) => `Unknown tool: ${call.name}`,
};
export function setToolHost(host: ToolHost) {
  toolHost = host;
}

export interface ChatState {
  conversations: Conversation[];
  currentId: string | null;
  /** Messages of the current conversation by id. */
  messages: Map<string, Message>;
  /** Conversation ids with a running generation. */
  running: Set<string>;
  version: number;
}

export const chatStore = createStore<ChatState>({ conversations: [], currentId: null, messages: new Map(), running: new Set(), version: 0 });

const cache = new Map<string, Map<string, Message>>();
const controllers = new Map<string, AbortController>();

function bump(patch: Partial<ChatState> = {}) {
  chatStore.update((s) => ({ ...s, ...patch, version: s.version + 1 }));
}

function current(): Conversation | undefined {
  const s = chatStore.get();
  return s.conversations.find((c) => c.id === s.currentId);
}

function upsertConv(conv: Conversation) {
  const list = chatStore.get().conversations.filter((c) => c.id !== conv.id);
  list.unshift(conv);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  bump({ conversations: list });
}

export async function initChat(): Promise<void> {
  const conversations = await listConversations();
  bump({ conversations });
}

async function messagesFor(convId: string): Promise<Map<string, Message>> {
  let map = cache.get(convId);
  if (!map) {
    map = new Map((await loadMessages(convId)).map((m) => [m.id, m]));
    // A turn left streaming by a closed app is shown as stopped, never as still running.
    for (const m of map.values()) {
      if (m.status === 'streaming' && !controllers.has(convId)) {
        m.status = 'stopped';
        saveMessage(m);
      }
    }
    cache.set(convId, map);
  }
  return map;
}

export async function openChat(id: string | null): Promise<void> {
  if (id === null) {
    bump({ currentId: null, messages: new Map() });
    return;
  }
  const messages = await messagesFor(id);
  bump({ currentId: id, messages });
}

export function newChat(): void {
  bump({ currentId: null, messages: new Map() });
}

export function visiblePath(): Message[] {
  const s = chatStore.get();
  const conv = current();
  return conv ? activePath(conv, s.messages.values()) : [];
}

function defaultModel(): { providerId?: string; model?: string } {
  const s = settingsStore.get();
  return { providerId: s.defaultProviderId, model: s.defaultModel };
}

export function currentModel(): { providerId?: string; model?: string } {
  const conv = current();
  return conv?.providerId && conv.model ? { providerId: conv.providerId, model: conv.model } : defaultModel();
}

export async function setConversationModel(providerId: string, model: string): Promise<void> {
  const conv = current();
  if (!conv) return;
  const next = { ...conv, providerId, model };
  upsertConv(next);
  await saveConversation(next);
}

function makeAssistant(convId: string, parentId: string): Message {
  const { providerId, model } = currentModel();
  return { id: newId('m_'), convId, parentId, role: 'assistant', text: '', parts: [], createdAt: Date.now(), status: 'streaming', providerId, model };
}

function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > 48 ? line.slice(0, 47) + '…' : line || 'New chat';
}

export async function send(text: string, attachments: Attachment[] = []): Promise<void> {
  const body = text.trim();
  if (!body && !attachments.length) return;
  let conv = current();
  const now = Date.now();
  if (!conv) {
    const d = defaultModel();
    conv = { id: newId('c_'), title: titleFrom(body || attachments[0]?.name || ''), createdAt: now, updatedAt: now, selected: {}, providerId: d.providerId, model: d.model };
    cache.set(conv.id, new Map());
    bump({ currentId: conv.id, messages: cache.get(conv.id)! });
  }
  if (controllers.has(conv.id)) return;
  const path = visiblePath();
  const parentId = path.length ? path[path.length - 1].id : null;
  await startTurn(conv, parentId, body, attachments);
}

/** Adds a user message under `parentId`, plus an assistant reply, and generates it. */
async function startTurn(conv: Conversation, parentId: string | null, text: string, attachments: Attachment[] = []): Promise<void> {
  const map = await messagesFor(conv.id);
  const user: Message = { id: newId('m_'), convId: conv.id, parentId, role: 'user', text, parts: [], createdAt: Date.now(), status: 'done' };
  if (attachments.length) user.attachments = attachments;
  const assistant = makeAssistant(conv.id, user.id);
  assistant.createdAt = user.createdAt + 1;
  map.set(user.id, user);
  map.set(assistant.id, assistant);
  const next: Conversation = {
    ...conv,
    updatedAt: Date.now(),
    selected: { ...conv.selected, [keyOf(parentId)]: user.id, [user.id]: assistant.id },
  };
  upsertConv(next);
  await saveTurn(next, [user, assistant]);
  await generate(next, assistant);
}

/** Edit: a new user message beside the original (same parent), so the old branch stays. */
export async function editMessage(msgId: string, text: string): Promise<void> {
  const conv = current();
  const msg = chatStore.get().messages.get(msgId);
  if (!conv || !msg || msg.role !== 'user' || controllers.has(conv.id) || (!text.trim() && !msg.attachments?.length)) return;
  await startTurn(conv, msg.parentId, text.trim(), msg.attachments ?? []);
}

/** Regenerate: a new assistant reply beside the original. */
export async function regenerate(msgId: string): Promise<void> {
  const conv = current();
  const msg = chatStore.get().messages.get(msgId);
  if (!conv || !msg || msg.role !== 'assistant' || !msg.parentId || controllers.has(conv.id)) return;
  const map = await messagesFor(conv.id);
  const assistant = makeAssistant(conv.id, msg.parentId);
  map.set(assistant.id, assistant);
  const next: Conversation = { ...conv, updatedAt: Date.now(), selected: { ...conv.selected, [msg.parentId]: assistant.id } };
  upsertConv(next);
  await saveTurn(next, [assistant]);
  await generate(next, assistant);
}

export async function switchBranch(msgId: string, delta: number): Promise<void> {
  const conv = current();
  const s = chatStore.get();
  const msg = s.messages.get(msgId);
  if (!conv || !msg || controllers.has(conv.id)) return;
  const next = { ...conv, selected: selectSibling(conv, msg, s.messages.values(), delta) };
  upsertConv(next);
  await saveConversation(next);
}

export function stop(convId = chatStore.get().currentId): void {
  if (convId) controllers.get(convId)?.abort();
}

export async function deleteChat(id: string): Promise<void> {
  stop(id);
  cache.delete(id);
  await deleteConversation(id);
  const s = chatStore.get();
  bump({
    conversations: s.conversations.filter((c) => c.id !== id),
    ...(s.currentId === id ? { currentId: null, messages: new Map() } : {}),
  });
}

export async function renameChat(id: string, title: string): Promise<void> {
  const conv = chatStore.get().conversations.find((c) => c.id === id);
  if (!conv || !title.trim()) return;
  const next = { ...conv, title: title.trim().slice(0, 80) };
  upsertConv(next);
  await saveConversation(next);
}

/** Drops cached messages (after import or erase) and reloads the list. */
export async function reloadAll(): Promise<void> {
  for (const c of controllers.values()) c.abort();
  cache.clear();
  bump({ conversations: await listConversations(), currentId: null, messages: new Map() });
}

async function generate(conv: Conversation, assistant: Message): Promise<void> {
  const ctrl = new AbortController();
  controllers.set(conv.id, ctrl);
  const running = new Set(chatStore.get().running);
  running.add(conv.id);
  bump({ running });

  const map = cache.get(conv.id)!;
  let apiKey = '';
  let lastSave = Date.now();
  let uiTimer: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    if (uiTimer) return;
    uiTimer = setTimeout(() => {
      uiTimer = null;
      map.set(assistant.id, { ...assistant, parts: assistant.parts.map((p) => ({ ...p })) });
      if (chatStore.get().currentId === conv.id) bump();
      if (Date.now() - lastSave > 1000) {
        lastSave = Date.now();
        saveMessage(snapshot(assistant)).catch(() => undefined);
      }
    }, 50);
  };

  try {
    const provider = providerById(assistant.providerId);
    if (!provider || !assistant.model) throw new Error('Pick a model first (tap the model name at the top).');
    apiKey = (await getSecret(secretName.provider(provider.id))) ?? '';
    if (provider.keyRequired && !apiKey) throw new Error(`Add your ${provider.label} API key in Settings → Providers.`);
    const settings = settingsStore.get();
    const path = activePath(conv, map.values());
    const before = path.slice(0, path.findIndex((m) => m.id === assistant.id));
    if (!readsPdf(provider) && before.some((m) => m.attachments?.some((a) => a.kind === 'pdf'))) {
      throw new Error(`${provider.label} can't read PDF files here. Use Anthropic, Google, OpenAI or Open Router for PDFs.`);
    }
    const toolSetup = await toolHost.prepare(conv);
    const system = [settings.systemPrompt.trim(), ...toolSetup.system].filter(Boolean).join('\n\n') || undefined;
    await runTurn({
      adapter: adapterFor(provider.protocol),
      request: {
        providerId: provider.id,
        providerLabel: provider.label,
        baseUrl: baseUrlFor(provider, settings),
        apiKey,
        model: assistant.model,
        system,
        tools: toolSetup.tools,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        nativeSearch: toolSetup.nativeSearch,
        extraHeaders: provider.extraHeaders,
        retryMissingV1: provider.retryMissingV1,
      },
      history: historyToWire(before),
      message: assistant,
      executeTool: (call, signal) => toolHost.execute(call, signal),
      onChange: refresh,
      onCheckpoint: () => saveMessage(snapshot(assistant)).catch(() => undefined),
      signal: ctrl.signal,
    });
  } catch (e) {
    assistant.status = 'error';
    assistant.error = (e as Error)?.message ?? String(e);
  } finally {
    if (uiTimer) clearTimeout(uiTimer);
    if (assistant.error) assistant.error = redact(assistant.error, apiKey);
    controllers.delete(conv.id);
    map.set(assistant.id, snapshot(assistant));
    await saveMessage(snapshot(assistant)).catch(() => undefined);
    const r = new Set(chatStore.get().running);
    r.delete(conv.id);
    bump({ running: r });
  }
}

function snapshot(m: Message): Message {
  return JSON.parse(JSON.stringify(m));
}
