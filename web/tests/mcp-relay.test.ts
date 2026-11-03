// @vitest-environment node
// Runs the MCP relay against a real local HTTP server with the runtime's real fetch (no mocks).
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCP_RELAY_TARGETS, mcpRelayIdFor, relayMcp } from '../api/_mcp-relay';
import { CONNECTORS, mcpEndpoint } from '../src/core/tools/connectors';

let server: Server;
let targets: Record<string, string> = {};
let seen: { method?: string; headers: IncomingHttpHeaders; body: string } | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen = { method: req.method, headers: req.headers, body };
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'sess-9', 'Set-Cookie': 'x=1' });
      res.end('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  targets = { demo: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp` };
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const req = (s: string, init: RequestInit = {}) => new Request(`https://app.example/api/mcp?s=${s}`, init);

describe('MCP relay', () => {
  it('forwards body and MCP headers, drops cookies, returns the session id', async () => {
    const body = '{"jsonrpc":"2.0","id":1,"method":"initialize"}';
    const res = await relayMcp(req('demo', {
      method: 'POST',
      headers: { Authorization: 'Bearer t-1', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Mcp-Session-Id': 'old', 'MCP-Protocol-Version': '2025-06-18', Cookie: 'session=secret' },
      body,
    }), targets);
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBe('sess-9');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.text()).toContain('"result"');
    expect(seen!.body).toBe(body);
    expect(seen!.headers.authorization).toBe('Bearer t-1');
    expect(seen!.headers['mcp-session-id']).toBe('old');
    expect(seen!.headers['mcp-protocol-version']).toBe('2025-06-18');
    expect(seen!.headers.cookie).toBeUndefined();
  });

  it('refuses unknown ids, prototype keys and other methods', async () => {
    expect((await relayMcp(req('nope', { method: 'POST', body: '{}' }), targets)).status).toBe(404);
    expect((await relayMcp(req('__proto__', { method: 'POST', body: '{}' }), targets)).status).toBe(404);
    expect((await relayMcp(req('constructor', { method: 'POST', body: '{}' }), targets)).status).toBe(404);
    expect((await relayMcp(req('demo', { method: 'PUT', body: '{}' }), targets)).status).toBe(405);
  });

  it('every connector maps to a relay target, and only known URLs are relayed', () => {
    for (const c of CONNECTORS) {
      expect(MCP_RELAY_TARGETS[c.id]).toBe(c.url);
      expect(mcpEndpoint(c.url)).toBe(`/api/mcp?s=${c.id}`);
    }
    expect(mcpRelayIdFor('https://mcp.exa.ai/mcp/')).toBe('exa');
    expect(mcpRelayIdFor('https://API.githubcopilot.com/mcp')).toBe('github');
    expect(mcpEndpoint('https://other.example/mcp')).toBe('https://other.example/mcp');
  });
});

describe('Brave relay', () => {
  it('forwards only the query and the subscription token', async () => {
    const { relayBrave } = await import('../api/_brave-relay');
    const up = targets.demo.replace('/mcp', '/brave');
    const res = await relayBrave(new Request('https://app.example/api/brave?q=hello%20world', { headers: { 'X-Subscription-Token': 'bk-1', Cookie: 'a=b' } }), up);
    expect(res.status).toBe(200);
    expect(seen!.method).toBe('GET');
    expect(seen!.headers['x-subscription-token']).toBe('bk-1');
    expect(seen!.headers.cookie).toBeUndefined();
    expect((await relayBrave(new Request('https://app.example/api/brave?q=x'), up)).status).toBe(401);
    expect((await relayBrave(new Request('https://app.example/api/brave?q=x', { method: 'POST', headers: { 'X-Subscription-Token': 'k' } }), up)).status).toBe(405);
  });
});
