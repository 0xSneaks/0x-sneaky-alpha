import { describe, expect, it } from 'vitest';
import { proxyOpenCode } from '../api/_opencode-proxy';
import { baseUrlFor, DEFAULT_SETTINGS, providerById, type Settings } from '../src/core/settings';
import { mockFetch, streamOf } from './helpers';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('OpenCode Go proxy routing (baseUrlFor)', () => {
  it('sends OpenCode Go through the same-origin proxy by default', () => {
    const p = providerById('opencode-go', settings())!;
    expect(baseUrlFor(p, settings())).toBe('/api/proxy');
  });

  it('still proxies when the typed URL is the upstream URL with a trailing slash', () => {
    const p = providerById('opencode-go', settings())!;
    const s = settings({ providerUrls: { 'opencode-go': 'https://opencode.ai/zen/go/v1/' } });
    expect(baseUrlFor(p, s)).toBe('/api/proxy');
  });

  it('respects a different URL typed for OpenCode Go', () => {
    const p = providerById('opencode-go', settings())!;
    const s = settings({ providerUrls: { 'opencode-go': 'https://example.com/v1' } });
    expect(baseUrlFor(p, s)).toBe('https://example.com/v1');
  });

  it('leaves other providers untouched', () => {
    const p = providerById('openai', settings())!;
    expect(baseUrlFor(p, settings())).toBe('https://api.openai.com/v1');
  });
});

describe('OpenCode Go proxy handler', () => {
  it('relays chat completions: allowlisted URL, only three headers, full body forwarded', async () => {
    const calls = mockFetch(() => new Response(streamOf(['data: {}\n\n']), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    const req = new Request('https://app.example/api/proxy/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Should-Not-Forward': 'nope',
        Cookie: 'session=secret',
      },
      body: JSON.stringify({ model: 'm', messages: [] }),
    });
    const res = await proxyOpenCode(req, 'chat/completions');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await res.text()).toBe('data: {}\n\n');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://opencode.ai/zen/go/v1/chat/completions');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
      accept: 'text/event-stream',
    });
    expect(new TextDecoder().decode(calls[0].init.body as ArrayBuffer)).toBe(JSON.stringify({ model: 'm', messages: [] }));
  });

  it('relays the models list with a GET and no body', async () => {
    const calls = mockFetch(() => new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const req = new Request('https://app.example/api/proxy/models', { headers: { Authorization: 'Bearer k' } });
    const res = await proxyOpenCode(req, 'models');
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe('https://opencode.ai/zen/go/v1/models');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('passes upstream error statuses and bodies through', async () => {
    mockFetch(() => new Response('{"error":{"message":"bad key"}}', { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const req = new Request('https://app.example/api/proxy/models', { headers: { Authorization: 'Bearer bad' } });
    const res = await proxyOpenCode(req, 'models');
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('bad key');
  });

  it('refuses non-allowlisted paths without calling upstream', async () => {
    const calls = mockFetch(() => new Response('{}'));
    const req = new Request('https://app.example/api/proxy/admin', { method: 'POST', body: '{}' });
    const res = await proxyOpenCode(req, 'admin');
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('refuses the wrong method for an allowlisted path', async () => {
    const calls = mockFetch(() => new Response('{}'));
    const req = new Request('https://app.example/api/proxy/models', { method: 'DELETE' });
    const res = await proxyOpenCode(req, 'models');
    expect(res.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('answers 502 when OpenCode Go is unreachable', async () => {
    mockFetch(() => { throw new TypeError('fetch failed'); });
    const req = new Request('https://app.example/api/proxy/models');
    const res = await proxyOpenCode(req, 'models');
    expect(res.status).toBe(502);
  });
});
