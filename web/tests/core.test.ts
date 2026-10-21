import { beforeEach, describe, expect, it } from 'vitest';
import { activePath, selectSibling, siblingInfo } from '../src/core/tree';
import { partsToWire, runTurn } from '../src/core/generate';
import { renderMarkdown } from '../src/core/markdown';
import { redact } from '../src/core/redact';
import * as secrets from '../src/core/secrets';
import { DB_NAME, resetDbConnection } from '../src/core/db';
import type { Message, ProviderAdapter, StreamEvent } from '../src/core/types';

const m = (id: string, parentId: string | null, t: number, role: 'user' | 'assistant' = 'user'): Message =>
  ({ id, convId: 'c', parentId, role, text: id, parts: [], createdAt: t, status: 'done' });

describe('branch tree', () => {
  const msgs = [m('u1', null, 1), m('a1', 'u1', 2, 'assistant'), m('a1b', 'u1', 5, 'assistant'), m('u2', 'a1', 3), m('u2b', 'a1b', 6)];
  it('follows the newest child by default and the selected child when set', () => {
    expect(activePath({ selected: {} }, msgs).map((x) => x.id)).toEqual(['u1', 'a1b', 'u2b']);
    expect(activePath({ selected: { u1: 'a1' } }, msgs).map((x) => x.id)).toEqual(['u1', 'a1', 'u2']);
  });
  it('navigates siblings without losing branches', () => {
    expect(siblingInfo(msgs[1], msgs)).toMatchObject({ index: 0, count: 2 });
    const sel = selectSibling({ id: 'c', title: '', createdAt: 0, updatedAt: 0, selected: {} }, msgs[2], msgs, -1);
    expect(sel.u1).toBe('a1');
    expect(activePath({ selected: sel }, msgs).map((x) => x.id)).toEqual(['u1', 'a1', 'u2']);
  });
});

describe('turn loop', () => {
  it('runs tools then continues until a plain answer', async () => {
    let round = 0;
    const seen: unknown[] = [];
    const adapter: ProviderAdapter = {
      async *stream(req) {
        seen.push(req.messages);
        if (round++ === 0) {
          yield { type: 'text', text: 'Let me check. ' } as StreamEvent;
          yield { type: 'tool_calls', calls: [{ id: 't1', name: 'echo', arguments: '{"x":1}' }] };
        } else yield { type: 'text', text: 'Done.' };
      },
      listModels: async () => [],
    };
    const msg = m('a', 'u', 1, 'assistant');
    await runTurn({
      adapter, request: { providerId: 'p', providerLabel: 'P', baseUrl: '', apiKey: '', model: 'x' }, history: [{ role: 'user', text: 'q' }], message: msg,
      executeTool: async (c) => `result ${c.arguments}`, onChange: () => {}, signal: new AbortController().signal,
    });
    expect(msg.status).toBe('done');
    expect(msg.parts.map((p) => p.type)).toEqual(['text', 'tool', 'text']);
    expect(seen[1]).toEqual([
      { role: 'user', text: 'q' },
      { role: 'assistant', text: 'Let me check. ', toolCalls: [{ id: 't1', name: 'echo', arguments: '{"x":1}' }] },
      { role: 'tool', callId: 't1', name: 'echo', result: 'result {"x":1}' },
    ]);
    expect(partsToWire(msg.parts).at(-1)).toEqual({ role: 'assistant', text: 'Done.' });
  });

  it('stop keeps partial text and marks the message stopped', async () => {
    const ctrl = new AbortController();
    const adapter: ProviderAdapter = {
      async *stream(_r, signal) {
        yield { type: 'text', text: 'partial' };
        ctrl.abort();
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      },
      listModels: async () => [],
    };
    const msg = m('a', 'u', 1, 'assistant');
    await runTurn({ adapter, request: { providerId: 'p', providerLabel: 'P', baseUrl: '', apiKey: '', model: 'x' }, history: [], message: msg, executeTool: async () => '', onChange: () => {}, signal: ctrl.signal });
    expect(msg.status).toBe('stopped');
    expect(msg.parts).toEqual([{ type: 'text', text: 'partial' }]);
  });
});

describe('markdown is safe', () => {
  it('escapes HTML and script URLs', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> [x](javascript:alert(1)) **b** `<i>`');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<code>&lt;i&gt;</code>');
  });
  it('renders code fences, lists, headings, links', () => {
    const html = renderMarkdown('# T\n- a\n- b\n\n```js\nx<1\n```\n[s](https://e.com/?a=1&b=2)');
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>');
    expect(html).toContain('<pre data-lang="js"><code>x&lt;1</code></pre>');
    expect(html).toContain('href="https://e.com/?a=1&amp;b=2"');
  });
});

describe('redaction', () => {
  it('removes known key shapes and explicit secrets', () => {
    expect(redact('key sk-ant-abcdefghijklmnop and AIzaSyA12345678901234567890 and mine-secret', 'mine-secret')).toBe('key [redacted] and [redacted] and [redacted]');
  });
});

describe('passphrase lock', () => {
  beforeEach(async () => {
    resetDbConnection();
    await new Promise((r) => { const d = indexedDB.deleteDatabase(DB_NAME); d.onsuccess = d.onerror = r; });
    secrets.lockNow();
  });
  it('encrypts stored keys and needs the passphrase to read them', async () => {
    await secrets.setSecret('key:openai', 'sk-plain-value-123');
    await secrets.enableLock('correct horse');
    const raw = await new Promise<unknown>((res) => {
      const open = indexedDB.open(DB_NAME);
      open.onsuccess = () => { const g = open.result.transaction('secrets').objectStore('secrets').get('key:openai'); g.onsuccess = () => { res(g.result); open.result.close(); }; };
    });
    expect(JSON.stringify(raw)).not.toContain('sk-plain-value-123');
    expect(raw).toHaveProperty('ct');
    secrets.lockNow();
    await expect(secrets.getSecret('key:openai')).rejects.toThrow(/locked/);
    expect(await secrets.unlock('wrong pass')).toBe(false);
    expect(await secrets.unlock('correct horse')).toBe(true);
    expect(await secrets.getSecret('key:openai')).toBe('sk-plain-value-123');
    await secrets.disableLock();
    expect(await secrets.lockEnabled()).toBe(false);
    expect(await secrets.getSecret('key:openai')).toBe('sk-plain-value-123');
  }, 30_000);
});
