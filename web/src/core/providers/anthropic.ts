// Anthropic Messages adapter (Anthropic and custom Anthropic-compatible). Mirrors Android
// AnthropicProvider. Licensed under GPL-3.0.
import type { ChatRequest, ProviderAdapter, StreamEvent, WireMessage } from '../types';
import { binaryParts, textWithFiles } from '../attachments';
import { getJson, postJson, safeParseArgs, trimBase } from './http';
import { readSse } from './sse';

export const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192;

export function toAnthropicMessages(messages: WireMessage[]): { role: 'user' | 'assistant'; content: unknown[] }[] {
  const out: { role: 'user' | 'assistant'; content: unknown[] }[] = [];
  const push = (role: 'user' | 'assistant', block: unknown) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const m of messages) {
    if (m.role === 'user') {
      for (const a of binaryParts(m.attachments)) {
        push('user', a.kind === 'image'
          ? { type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } }
          : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data }, title: a.name });
      }
      push('user', { type: 'text', text: textWithFiles(m.text, m.attachments) });
    }
    else if (m.role === 'tool') push('user', { type: 'tool_result', tool_use_id: m.callId, content: m.result });
    else {
      if (m.text) push('assistant', { type: 'text', text: m.text });
      for (const c of m.toolCalls ?? []) push('assistant', { type: 'tool_use', id: c.id, name: c.name, input: safeParseArgs(c.arguments) });
      if (!m.text && !m.toolCalls?.length) push('assistant', { type: 'text', text: '(empty)' });
    }
  }
  return out;
}

function headers(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // Required for CORS: Anthropic only answers browser origins when this is present.
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(extra ?? {}),
  };
}

export const anthropicAdapter: ProviderAdapter = {
  async *stream(req: ChatRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const tools: unknown[] = (req.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    if (req.nativeSearch) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
      messages: toAnthropicMessages(req.messages),
      stream: true,
    };
    if (req.system) body.system = req.system;
    if (tools.length) body.tools = tools;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    const retries: StreamEvent[] = [];
    const res = await postJson([`${trimBase(req.baseUrl)}/messages`], headers(req.apiKey, req.extraHeaders), body, {
      label: req.providerLabel, apiKey: req.apiKey, signal, onRetry: (attempt, status) => retries.push({ type: 'retry', attempt, status }),
    });
    yield* retries;
    const blocks = new Map<number, { type: string; id?: string; name?: string; json: string }>();
    const calls: { id: string; name: string; arguments: string }[] = [];
    for await (const ev of readSse(res.body!, signal)) {
      let d: any;
      try { d = JSON.parse(ev.data); } catch { continue; }
      switch (d.type) {
        case 'message_start':
          if (d.message?.usage) yield { type: 'usage', input: d.message.usage.input_tokens };
          break;
        case 'content_block_start':
          blocks.set(d.index, { type: d.content_block?.type, id: d.content_block?.id, name: d.content_block?.name, json: '' });
          if (d.content_block?.type === 'text' && d.content_block.text) yield { type: 'text', text: d.content_block.text };
          break;
        case 'content_block_delta': {
          const delta = d.delta ?? {};
          if (delta.type === 'text_delta') yield { type: 'text', text: delta.text };
          else if (delta.type === 'thinking_delta') yield { type: 'thought', text: delta.thinking };
          else if (delta.type === 'input_json_delta') {
            const b = blocks.get(d.index);
            if (b) b.json += delta.partial_json ?? '';
          }
          break;
        }
        case 'content_block_stop': {
          const b = blocks.get(d.index);
          if (b?.type === 'tool_use' && b.id && b.name) calls.push({ id: b.id, name: b.name, arguments: b.json || '{}' });
          break;
        }
        case 'message_delta':
          if (d.usage) yield { type: 'usage', output: d.usage.output_tokens };
          break;
        case 'error':
          throw new Error(`${req.providerLabel}: ${d.error?.message ?? 'stream error'}`);
      }
    }
    if (calls.length) yield { type: 'tool_calls', calls };
  },

  async listModels(baseUrl, apiKey, signal) {
    const out: string[] = [];
    let after = '';
    for (let page = 0; page < 10; page++) {
      const j = await getJson(`${trimBase(baseUrl)}/models?limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ''}`, headers(apiKey), 'Models', apiKey, signal);
      for (const m of j?.data ?? []) if (typeof m?.id === 'string') out.push(m.id);
      if (!j?.has_more || !j?.last_id) break;
      after = j.last_id;
    }
    return out;
  },
};
