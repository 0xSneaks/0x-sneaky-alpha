// Google Gemini adapter (Gemini and custom Google-compatible). Mirrors Android GeminiProvider.
// Licensed under GPL-3.0.
import type { ChatRequest, ProviderAdapter, StreamEvent, ToolCall, WireMessage } from '../types';
import { binaryParts, textWithFiles } from '../attachments';
import { getJson, newId, postJson, safeParseArgs, trimBase } from './http';
import { readSse } from './sse';

export function toGeminiContents(messages: WireMessage[]): { role: 'user' | 'model'; parts: unknown[] }[] {
  const out: { role: 'user' | 'model'; parts: unknown[] }[] = [];
  const push = (role: 'user' | 'model', part: unknown) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(part);
    else out.push({ role, parts: [part] });
  };
  for (const m of messages) {
    if (m.role === 'user') {
      for (const a of binaryParts(m.attachments)) push('user', { inlineData: { mimeType: a.mime, data: a.data } });
      push('user', { text: textWithFiles(m.text, m.attachments) });
    }
    else if (m.role === 'tool') push('user', { functionResponse: { name: m.name, response: { result: m.result } } });
    else {
      if (m.text) push('model', { text: m.text });
      for (const c of m.toolCalls ?? []) {
        const part: Record<string, unknown> = { functionCall: { name: c.name, args: safeParseArgs(c.arguments) } };
        // Thought signatures are opaque Gemini state; never replay another protocol's signature.
        if (c.sig && c.sigProtocol === 'gemini') part.thoughtSignature = c.sig;
        push('model', part);
      }
    }
  }
  return out;
}

export function geminiModelPath(model: string): string {
  return model.replace(/^models\//, '');
}

export const geminiAdapter: ProviderAdapter = {
  async *stream(req: ChatRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
    const body: Record<string, unknown> = { contents: toGeminiContents(req.messages) };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (req.nativeSearch) body.tools = [{ googleSearch: {} }];
    else if (req.tools?.length) {
      body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
    }
    const gen: Record<string, unknown> = {};
    if (req.temperature !== undefined) gen.temperature = req.temperature;
    if (req.maxTokens !== undefined) gen.maxOutputTokens = req.maxTokens;
    if (Object.keys(gen).length) body.generationConfig = gen;
    const url = `${trimBase(req.baseUrl)}/models/${encodeURIComponent(geminiModelPath(req.model))}:streamGenerateContent?alt=sse`;
    const retries: StreamEvent[] = [];
    const res = await postJson([url], { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey, ...(req.extraHeaders ?? {}) }, body, {
      label: req.providerLabel, apiKey: req.apiKey, signal, onRetry: (attempt, status) => retries.push({ type: 'retry', attempt, status }),
    });
    yield* retries;
    const calls: ToolCall[] = [];
    for await (const ev of readSse(res.body!, signal)) {
      let d: any;
      try { d = JSON.parse(ev.data); } catch { continue; }
      if (d.error) throw new Error(`${req.providerLabel}: ${d.error.message ?? 'stream error'}`);
      if (d.usageMetadata) yield { type: 'usage', input: d.usageMetadata.promptTokenCount, output: d.usageMetadata.candidatesTokenCount };
      for (const part of d.candidates?.[0]?.content?.parts ?? []) {
        if (part.functionCall) {
          calls.push({
            id: part.functionCall.id || newId('call_'),
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
            sig: part.thoughtSignature,
            sigProtocol: part.thoughtSignature ? 'gemini' : undefined,
          });
        } else if (typeof part.text === 'string' && part.text) {
          yield part.thought ? { type: 'thought', text: part.text } : { type: 'text', text: part.text };
        }
      }
      const block = d.promptFeedback?.blockReason;
      if (block) throw new Error(`${req.providerLabel}: prompt blocked (${block})`);
    }
    if (calls.length) yield { type: 'tool_calls', calls };
  },

  async listModels(baseUrl, apiKey, signal) {
    const out: string[] = [];
    let token = '';
    for (let page = 0; page < 10; page++) {
      const j = await getJson(`${trimBase(baseUrl)}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { 'x-goog-api-key': apiKey }, 'Models', apiKey, signal);
      for (const m of j?.models ?? []) {
        const methods: string[] = m?.supportedGenerationMethods ?? ['generateContent'];
        if (typeof m?.name === 'string' && methods.includes('generateContent')) out.push(geminiModelPath(m.name));
      }
      token = j?.nextPageToken ?? '';
      if (!token) break;
    }
    return out;
  },
};
