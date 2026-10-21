// OpenAI-compatible Chat Completions adapter (OpenAI, DeepSeek, Qwen, OpenRouter, OpenCode Go,
// Groq, custom OpenAI-compatible). Mirrors Android BaseOpenAiProvider. Licensed under GPL-3.0.
import type { ChatRequest, ProviderAdapter, StreamEvent, ToolCall, WireMessage } from '../types';
import { binaryParts, textWithFiles } from '../attachments';
import { getJson, newId, postJson, trimBase, withV1 } from './http';
import { readSse } from './sse';

export function toOpenAiMessages(system: string | undefined, messages: WireMessage[]): unknown[] {
  const out: unknown[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'user') {
      const text = textWithFiles(m.text, m.attachments);
      const bins = binaryParts(m.attachments);
      out.push({
        role: 'user',
        content: bins.length
          ? [
            { type: 'text', text },
            ...bins.map((a) => (a.kind === 'image'
              ? { type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.data}` } }
              : { type: 'file', file: { filename: a.name, file_data: `data:application/pdf;base64,${a.data}` } })),
          ]
          : text,
      });
    }
    else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.callId, content: m.result });
    else if (m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: m.text || null,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
      });
    } else out.push({ role: 'assistant', content: m.text });
  }
  return out;
}

export function endpointCandidates(baseUrl: string, path: string, retryMissingV1: boolean): string[] {
  const base = trimBase(baseUrl);
  const primary = `${base}/${path}`;
  const v1 = withV1(base);
  return retryMissingV1 && v1 !== base ? [primary, `${v1}/${path}`] : [primary];
}

export const openAiAdapter: ProviderAdapter = {
  async *stream(req: ChatRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAiMessages(req.system, req.messages),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    }
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body[req.providerId === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = req.maxTokens;
    if (req.nativeSearch && req.providerId === 'openrouter') body.plugins = [{ id: 'web' }];
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(req.extraHeaders ?? {}) };
    if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;
    const retries: StreamEvent[] = [];
    const res = await postJson(endpointCandidates(req.baseUrl, 'chat/completions', !!req.retryMissingV1), headers, body, {
      label: req.providerLabel, apiKey: req.apiKey, signal, onRetry: (attempt, status) => retries.push({ type: 'retry', attempt, status }),
    });
    yield* retries;
    const pending = new Map<number, { id: string; name: string; args: string }>();
    let finished = false;
    const flush = (): ToolCall[] => {
      const calls = [...pending.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => ({ id: c.id || newId('call_'), name: c.name, arguments: c.args }));
      pending.clear();
      return calls.filter((c) => c.name);
    };
    for await (const ev of readSse(res.body!, signal)) {
      if (ev.data === '[DONE]') break;
      let chunk: any;
      try { chunk = JSON.parse(ev.data); } catch { continue; }
      if (chunk.error) throw new Error(`${req.providerLabel}: ${chunk.error.message ?? JSON.stringify(chunk.error)}`);
      if (chunk.usage) yield { type: 'usage', input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens };
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      const reasoning = (typeof delta.reasoning_content === 'string' && delta.reasoning_content) || (typeof delta.reasoning === 'string' && delta.reasoning) || '';
      if (reasoning) yield { type: 'thought', text: reasoning };
      if (typeof delta.content === 'string' && delta.content) yield { type: 'text', text: delta.content };
      for (const tc of delta.tool_calls ?? []) {
        const idx = typeof tc.index === 'number' ? tc.index : pending.size;
        const cur = pending.get(idx) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        pending.set(idx, cur);
      }
      if (choice.finish_reason) finished = true;
    }
    // A completed tool call is never dropped because the stream ended with stop/[DONE]/EOF.
    const calls = flush();
    if (calls.length) yield { type: 'tool_calls', calls };
    void finished;
  },

  async listModels(baseUrl, apiKey, signal) {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const j = await getJson(`${trimBase(baseUrl)}/models`, headers, 'Models', apiKey, signal);
    const list: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    return list.map((m) => (typeof m === 'string' ? m : m?.id)).filter((x): x is string => typeof x === 'string').sort();
  },
};
