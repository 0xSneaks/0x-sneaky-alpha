import { describe, expect, it } from 'vitest';
import { readSse } from '../src/core/providers/sse';
import { openAiAdapter, endpointCandidates } from '../src/core/providers/openai';
import { anthropicAdapter, toAnthropicMessages } from '../src/core/providers/anthropic';
import { geminiAdapter, toGeminiContents } from '../src/core/providers/gemini';
import { ollamaAdapter } from '../src/core/providers/ollama';
import { BUILT_IN_PROVIDERS } from '../src/core/providers/catalog';
import type { ChatRequest } from '../src/core/types';
import { collect, mockFetch, sse, streamOf } from './helpers';

const base: ChatRequest = { providerId: 'openai', providerLabel: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test-1234567890abcdef', model: 'm', messages: [{ role: 'user', text: 'hi' }] };
const sig = () => new AbortController().signal;

describe('SSE reader', () => {
  it('handles CRLF, comments, multi-line data and split chunks', async () => {
    const evs = await collect(readSse(streamOf([': ping\r\nevent: a\r\ndata: 1\r', '\ndata: 2\r\n\r\n', 'data: x'])));
    expect(evs).toEqual([{ event: 'a', data: '1\n2' }, { event: 'message', data: 'x' }]);
  });
});

describe('provider catalog matches Android', () => {
  it('has the same built-in providers', () => {
    expect(BUILT_IN_PROVIDERS.map((p) => p.label)).toEqual(['Google', 'OpenAI', 'Anthropic', 'DeepSeek', 'Qwen', 'Groq', 'Ollama', 'Open Router', 'OpenCode Go']);
  });
});

describe('OpenAI-compatible adapter', () => {
  it('streams text and reasoning, assembles tool-call deltas, sends key only in Authorization', async () => {
    const calls = mockFetch(() => new Response(streamOf(sse([
      { choices: [{ delta: { reasoning_content: 'hmm' } }] },
      { choices: [{ delta: { content: 'Hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_', arguments: '{"a"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'x', arguments: ':1}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 3, completion_tokens: 4 } },
    ]))));
    const evs = await collect(openAiAdapter.stream(base, sig()));
    expect(evs).toEqual([
      { type: 'thought', text: 'hmm' }, { type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' },
      { type: 'usage', input: 3, output: 4 },
      { type: 'tool_calls', calls: [{ id: 'c1', name: 'get_x', arguments: '{"a":1}' }] },
    ]);
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer sk-test-1234567890abcdef');
    expect(String(calls[0].init.body)).not.toContain('sk-test');
    expect(calls[0].init.credentials).toBe('omit');
  });

  it('keeps a complete tool call even when the stream ends without [DONE]', async () => {
    mockFetch(() => new Response(streamOf(sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 't', arguments: '{}' } }] } }] }], false))));
    const evs = await collect(openAiAdapter.stream(base, sig()));
    expect(evs.at(-1)).toEqual({ type: 'tool_calls', calls: [{ id: 'c', name: 't', arguments: '{}' }] });
  });

  it('retries 429 then succeeds, and redacts the key from errors', async () => {
    let n = 0;
    mockFetch(() => (++n === 1 ? new Response('{"error":{"message":"slow down"}}', { status: 429 }) : new Response(streamOf(sse([{ choices: [{ delta: { content: 'ok' } }] }])))));
    const evs = await collect(openAiAdapter.stream(base, sig()));
    expect(evs.map((e) => e.type)).toEqual(['retry', 'text']);
    mockFetch(() => new Response(`{"error":{"message":"bad key sk-test-1234567890abcdef"}}`, { status: 401 }));
    await expect(collect(openAiAdapter.stream(base, sig()))).rejects.toThrow(/401: bad key \[redacted\]/);
  });

  it('explains network/CORS failures', async () => {
    mockFetch(() => { throw new TypeError('Load failed'); });
    await expect(collect(openAiAdapter.stream(base, sig()))).rejects.toThrow(/CORS/);
  });

  it('custom endpoints retry with /v1 like Android', () => {
    expect(endpointCandidates('https://x.dev', 'chat/completions', true)).toEqual(['https://x.dev/chat/completions', 'https://x.dev/v1/chat/completions']);
    expect(endpointCandidates('https://x.dev/v1', 'chat/completions', true)).toEqual(['https://x.dev/v1/chat/completions']);
  });

  it('adds OpenRouter headers and web plugin', async () => {
    const calls = mockFetch(() => new Response(streamOf(sse([]))));
    await collect(openAiAdapter.stream({ ...base, providerId: 'openrouter', nativeSearch: true, extraHeaders: { 'X-Title': '0x Sneaky Alpha' } }, sig()));
    expect(JSON.parse(String(calls[0].init.body)).plugins).toEqual([{ id: 'web' }]);
    expect((calls[0].init.headers as Record<string, string>)['X-Title']).toBe('0x Sneaky Alpha');
  });
});

describe('Anthropic adapter', () => {
  it('sends the browser-access header and parses text, thinking and tool_use', async () => {
    const calls = mockFetch(() => new Response(streamOf(sse([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'think' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hi' } },
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu1', name: 'search' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"q":' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"x"}' } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', usage: { output_tokens: 9 } },
    ], false))));
    const evs = await collect(anthropicAdapter.stream({ ...base, providerId: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' }, sig()));
    expect(evs).toEqual([
      { type: 'usage', input: 5 }, { type: 'thought', text: 'think' }, { type: 'text', text: 'Hi' }, { type: 'usage', output: 9 },
      { type: 'tool_calls', calls: [{ id: 'tu1', name: 'search', arguments: '{"q":"x"}' }] },
    ]);
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(h['x-api-key']).toBe(base.apiKey);
    expect(JSON.parse(String(calls[0].init.body)).max_tokens).toBe(8192);
  });

  it('groups tool results into one user turn', () => {
    const out = toAnthropicMessages([
      { role: 'user', text: 'q' },
      { role: 'assistant', text: '', toolCalls: [{ id: 'a', name: 't', arguments: '{}' }, { id: 'b', name: 't', arguments: '{}' }] },
      { role: 'tool', callId: 'a', name: 't', result: '1' },
      { role: 'tool', callId: 'b', name: 't', result: '2' },
    ]);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[2].content).toHaveLength(2);
  });
});

describe('Gemini adapter', () => {
  it('uses x-goog-api-key, streams thoughts/text and function calls with signatures', async () => {
    const calls = mockFetch(() => new Response(streamOf(sse([
      { candidates: [{ content: { parts: [{ text: 'plan', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] },
      { candidates: [{ content: { parts: [{ functionCall: { name: 'f', args: { a: 1 } }, thoughtSignature: 'SIG' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } },
    ], false))));
    const evs = await collect(geminiAdapter.stream({ ...base, providerId: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'models/gemini-x' }, sig()));
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse');
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe(base.apiKey);
    expect(calls[0].url).not.toContain(base.apiKey);
    expect(evs.slice(0, 2)).toEqual([{ type: 'thought', text: 'plan' }, { type: 'text', text: 'Hi' }]);
    const tc = evs.at(-1) as { type: 'tool_calls'; calls: { name: string; arguments: string; sig: string }[] };
    expect(tc.calls[0]).toMatchObject({ name: 'f', arguments: '{"a":1}', sig: 'SIG' });
  });

  it('replays thought signatures only to Gemini', () => {
    const c = toGeminiContents([{ role: 'assistant', text: '', toolCalls: [{ id: '1', name: 'f', arguments: '{}', sig: 'S', sigProtocol: 'gemini' }, { id: '2', name: 'g', arguments: '{}', sig: 'X', sigProtocol: 'anthropic' }] }]);
    expect((c[0].parts[0] as Record<string, unknown>).thoughtSignature).toBe('S');
    expect((c[0].parts[1] as Record<string, unknown>).thoughtSignature).toBeUndefined();
  });
});

describe('Ollama adapter', () => {
  it('reads NDJSON from /api/chat', async () => {
    const calls = mockFetch(() => new Response(streamOf(['{"message":{"content":"He"}}\n{"message":{"content":"y"}}\n', '{"done":true,"prompt_eval_count":1,"eval_count":2}\n'])));
    const evs = await collect(ollamaAdapter.stream({ ...base, providerId: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434' }, sig()));
    expect(calls[0].url).toBe('http://localhost:11434/api/chat');
    expect(evs).toEqual([{ type: 'text', text: 'He' }, { type: 'text', text: 'y' }, { type: 'usage', input: 1, output: 2 }]);
  });
});

describe('model lists', () => {
  it('reads each protocol', async () => {
    mockFetch((url) => new Response(JSON.stringify(
      url.includes('/api/tags') ? { models: [{ name: 'llama3' }] }
        : url.includes('googleapis') ? { models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] }
          : { data: [{ id: 'b' }, { id: 'a' }] })));
    expect(await openAiAdapter.listModels('https://x/v1', 'k')).toEqual(['a', 'b']);
    expect(await anthropicAdapter.listModels('https://x/v1', 'k')).toEqual(['b', 'a']);
    expect(await geminiAdapter.listModels('https://generativelanguage.googleapis.com/v1beta', 'k')).toEqual(['gemini-a']);
    expect(await ollamaAdapter.listModels('http://localhost:11434', '')).toEqual(['llama3']);
  });
});
