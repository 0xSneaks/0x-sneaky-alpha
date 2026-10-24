// @vitest-environment node
// Runs the OpenCode Go proxy against a real local HTTP server with the runtime's real fetch
// (no mocks), so request-body and streaming problems show up in tests, not on the phone.
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proxyOpenCode } from '../api/_opencode-proxy';

let server: Server;
let base = '';
let seen: { method?: string; url?: string; headers: IncomingHttpHeaders; body: string } | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen = { method: req.method, url: req.url, headers: req.headers, body };
      if (req.url?.endsWith('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{"data":[{"id":"m1"}]}');
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n');
      setTimeout(() => res.end('data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n'), 30);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/zen/go/v1`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('OpenCode Go proxy over a real network connection', () => {
  it('forwards a chat request body and streams the reply back', async () => {
    const payload = JSON.stringify({ model: 'm1', messages: [{ role: 'user', content: 'hi' }], stream: true });
    const req = new Request('https://app.example/api/proxy/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-key-123', 'Content-Type': 'application/json', Accept: 'text/event-stream', Cookie: 'session=secret' },
      body: payload,
    });
    const res = await proxyOpenCode(req, 'chat/completions', base);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await res.text()).toContain('"content":"lo"');
    expect(seen?.method).toBe('POST');
    expect(seen?.url).toBe('/zen/go/v1/chat/completions');
    expect(seen?.body).toBe(payload);
    expect(seen?.headers.authorization).toBe('Bearer test-key-123');
    expect(seen?.headers.cookie).toBeUndefined();
  });

  it('relays the models list', async () => {
    const res = await proxyOpenCode(new Request('https://app.example/api/proxy/models', { headers: { Authorization: 'Bearer k' } }), 'models', base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: 'm1' }] });
    expect(seen?.method).toBe('GET');
  });
});
