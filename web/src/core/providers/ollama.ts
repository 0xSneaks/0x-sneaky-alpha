// Ollama native /api/chat adapter (NDJSON stream). Mirrors Android OllamaProvider. Licensed under GPL-3.0.
import type { ChatRequest, ProviderAdapter, StreamEvent, ToolCall, WireMessage } from '../types';
import { binaryParts, textWithFiles } from '../attachments';
import { getJson, newId, postJson, safeParseArgs, trimBase } from './http';
import { readNdjson } from './sse';

export function toOllamaMessages(system: string | undefined, messages: WireMessage[]): unknown[] {
  const out: unknown[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'user') {
      const images = binaryParts(m.attachments).filter((a) => a.kind === 'image').map((a) => a.data);
      out.push({ role: 'user', content: textWithFiles(m.text, m.attachments), ...(images.length ? { images } : {}) });
    }
    else if (m.role === 'tool') out.push({ role: 'tool', content: m.result, tool_name: m.name });
    else {
      const msg: Record<string, unknown> = { role: 'assistant', content: m.text };
      if (m.toolCalls?.length) msg.tool_calls = m.toolCalls.map((c) => ({ function: { name: c.name, arguments: safeParseArgs(c.arguments) } }));
      out.push(msg);
    }
  }
  return out;
}

export const ollamaAdapter: ProviderAdapter = {
  async *stream(req: ChatRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const body: Record<string, unknown> = { model: req.model, messages: toOllamaMessages(req.system, req.messages), stream: true };
    if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const options: Record<string, unknown> = {};
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
    if (Object.keys(options).length) body.options = options;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(req.extraHeaders ?? {}) };
    if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;
    const res = await postJson([`${trimBase(req.baseUrl)}/api/chat`], headers, body, { label: req.providerLabel, apiKey: req.apiKey, signal });
    const calls: ToolCall[] = [];
    for await (const raw of readNdjson(res.body!, signal)) {
      const d = raw as any;
      if (d.error) throw new Error(`${req.providerLabel}: ${d.error}`);
      const m = d.message ?? {};
      if (typeof m.thinking === 'string' && m.thinking) yield { type: 'thought', text: m.thinking };
      if (typeof m.content === 'string' && m.content) yield { type: 'text', text: m.content };
      for (const tc of m.tool_calls ?? []) {
        if (tc.function?.name) calls.push({ id: tc.id || newId('call_'), name: tc.function.name, arguments: JSON.stringify(tc.function.arguments ?? {}) });
      }
      if (d.done) yield { type: 'usage', input: d.prompt_eval_count, output: d.eval_count };
    }
    if (calls.length) yield { type: 'tool_calls', calls };
  },

  async listModels(baseUrl, apiKey, signal) {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const j = await getJson(`${trimBase(baseUrl)}/api/tags`, headers, 'Ollama', apiKey, signal);
    return (j?.models ?? []).map((m: any) => m?.name ?? m?.model).filter((x: unknown): x is string => typeof x === 'string');
  },
};
