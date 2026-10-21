import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, getAll, kv, put, resetDbConnection } from '../src/core/db';
import { exportAll, importAll } from '../src/core/backup';
import { setSecret } from '../src/core/secrets';
import { activePath } from '../src/core/tree';
import type { Conversation, Message } from '../src/core/types';

beforeEach(async () => {
  resetDbConnection();
  await new Promise((r) => { const d = indexedDB.deleteDatabase(DB_NAME); d.onsuccess = d.onerror = r; });
});

const msg = (id: string, parentId: string | null, t: number, role: 'user' | 'assistant'): Message =>
  ({ id, convId: 'c1', parentId, role, text: role === 'user' ? id : '', parts: role === 'assistant' ? [{ type: 'text', text: id }] : [], createdAt: t, status: 'done' });

describe('export / import', () => {
  it('round-trips chats and branches with fresh ids and never includes keys', async () => {
    const conv: Conversation = { id: 'c1', title: 'Chat', createdAt: 1, updatedAt: 2, selected: { root: 'u1', u1: 'a1' } };
    await put('conversations', conv);
    for (const m of [msg('u1', null, 1, 'user'), msg('a1', 'u1', 2, 'assistant'), msg('a2', 'u1', 3, 'assistant')]) await put('messages', m);
    await kv.set('memory.active', 'likes neon');
    await setSecret('key:openai', 'sk-should-not-export-123456');

    const json = JSON.stringify(await exportAll());
    expect(json).not.toContain('sk-should-not-export');

    const r = await importAll(json);
    expect(r).toEqual({ conversations: 1, messages: 3 });
    const convs = await getAll<Conversation>('conversations');
    expect(convs).toHaveLength(2);
    const copy = convs.find((c) => c.id !== 'c1')!;
    const msgs = (await getAll<Message>('messages')).filter((m) => m.convId === copy.id);
    expect(msgs).toHaveLength(3);
    // The selected branch (a1, not the newer a2) is preserved through id remapping.
    expect(activePath(copy, msgs).map((m) => m.role === 'user' ? m.text : (m.parts[0] as { text: string }).text)).toEqual(['u1', 'a1']);
  });

  it('rejects other files', async () => {
    await expect(importAll('{"hello":1}')).rejects.toThrow(/not a 0x Sneaky Alpha/);
    await expect(importAll('nope')).rejects.toThrow(/JSON/);
  });
});
