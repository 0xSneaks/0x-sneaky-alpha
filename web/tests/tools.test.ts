import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, resetDbConnection } from '../src/core/db';
import { executeMemoryTool, getActiveMemory } from '../src/core/tools/memory';
import { McpClient, mcpToolName, parseHeaders } from '../src/core/tools/mcp';
import { formatResults, webSearch } from '../src/core/tools/websearch';
import type { McpServer } from '../src/core/settings';
import { mockFetch, streamOf } from './helpers';

beforeEach(async () => {
  resetDbConnection();
  await new Promise((r) => { const d = indexedDB.deleteDatabase(DB_NAME); d.onsuccess = d.onerror = r; });
});

describe('memory tools (Android-compatible)', () => {
  it('creates, edits, renames, lists and deletes files', async () => {
    await executeMemoryTool('create_memory_file', { name: 'a.md', content: 'hello world', description: 'd' });
    await expect(executeMemoryTool('create_memory_file', { name: 'a.md', content: 'x' })).rejects.toThrow(/exists/);
    await executeMemoryTool('edit_memory_file', { name: 'a.md', operation: 'patch', old_string: 'world', new_string: 'there' });
    expect(await executeMemoryTool('read_memory_file', { name: 'a.md' })).toBe('hello there');
    await executeMemoryTool('edit_memory_file', { name: 'a.md', operation: 'rename', new_name: 'b.md' });
    expect(JSON.parse(await executeMemoryTool('list_memory_files', {}))).toEqual([{ name: 'b.md', description: 'd' }]);
    await executeMemoryTool('delete_memory_file', { name: 'b.md' });
    expect(await executeMemoryTool('list_memory_files', {})).toBe('[]');
  });
  it('updates active memory with every mode', async () => {
    await executeMemoryTool('update_active_memory', { content: 'b' });
    await executeMemoryTool('update_active_memory', { content: 'c', mode: 'append' });
    await executeMemoryTool('update_active_memory', { content: 'a', mode: 'prepend' });
    await executeMemoryTool('update_active_memory', { content: '', mode: 'patch', old_string: 'b', new_string: 'B' });
    expect(await getActiveMemory()).toBe('a\nB\nc');
  });
});

const server = (transport: 'http' | 'sse'): McpServer => ({ id: 's', name: 'Demo', url: 'https://mcp.example/mcp', transport, enabled: true });

describe('MCP client', () => {
  it('Streamable HTTP: initialize, session id, JSON and SSE replies, tool calls', async () => {
    const calls = mockFetch((_url, init) => {
      const msg = JSON.parse(String(init.body));
      if (!('id' in msg)) return new Response(null, { status: 202 });
      if (msg.method === 'initialize') return new Response(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18' } }), { headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'sess-1' } });
      if (msg.method === 'tools/list') {
        return new Response(streamOf([`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] } })}\n\n`]), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `echo:${msg.params.arguments.x}` }] } }), { headers: { 'Content-Type': 'application/json' } });
    });
    const c = new McpClient(server('http'), { Authorization: 'Bearer secret-token-123' });
    expect((await c.listTools()).map((t) => t.name)).toEqual(['echo']);
    expect(await c.callTool('echo', { x: 7 })).toBe('echo:7');
    const last = calls.at(-1)!.init.headers as Record<string, string>;
    expect(last['Mcp-Session-Id']).toBe('sess-1');
    expect(last['MCP-Protocol-Version']).toBe('2025-06-18');
    expect(last.Authorization).toBe('Bearer secret-token-123');
  });

  it('legacy SSE: posts to the advertised endpoint and reads replies from the stream', async () => {
    let push: (s: string) => void = () => {};
    const stream = new ReadableStream<Uint8Array>({ start(c) { push = (s) => c.enqueue(new TextEncoder().encode(s)); push('event: endpoint\ndata: /messages?sid=9\n\n'); } });
    const posted: string[] = [];
    mockFetch((url, init) => {
      if (!init.method) return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      posted.push(url);
      const msg = JSON.parse(String(init.body));
      if ('id' in msg) {
        const result = msg.method === 'tools/list' ? { tools: [{ name: 't' }] } : {};
        setTimeout(() => push(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n\n`), 5);
      }
      return new Response(null, { status: 202 });
    });
    const c = new McpClient(server('sse'), {});
    expect((await c.listTools()).map((t) => t.name)).toEqual(['t']);
    expect(posted[0]).toBe('https://mcp.example/messages?sid=9');
    c.close();
  });

  it('builds safe tool names and parses headers', () => {
    expect(mcpToolName({ ...server('http'), name: 'My Server!' }, 'get.weather')).toBe('mcp_My_Server__get_weather');
    expect(parseHeaders('Authorization: Bearer x\nbad line\nX-Key: y:z')).toEqual({ Authorization: 'Bearer x', 'X-Key': 'y:z' });
  });
});

describe('web search', () => {
  it('calls Tavily with the key in a header and formats results', async () => {
    const calls = mockFetch(() => new Response(JSON.stringify({ results: [{ title: 'T', url: 'https://t', content: 'S' }] })));
    const r = await webSearch('tavily', 'q', 'tvly-key', '');
    expect(formatResults(r)).toBe('1. T\nhttps://t\nS');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tvly-key');
  });
  it('reads SearXNG JSON', async () => {
    const calls = mockFetch(() => new Response(JSON.stringify({ results: [{ title: 'A', url: 'https://a', content: 'c' }] })));
    expect((await webSearch('searxng', 'hello world', '', 'https://sx.example/')).length).toBe(1);
    expect(calls[0].url).toBe('https://sx.example/search?format=json&q=hello%20world');
  });
});
