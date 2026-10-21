// One assistant turn: stream from the provider, run requested tools, continue until the model
// answers without tools. Licensed under GPL-3.0.
import type { ChatRequest, Message, Part, ProviderAdapter, ToolCall, WireMessage } from './types';

export const MAX_TOOL_ROUNDS = 8;

/** Converts an assistant message's parts back into provider-neutral transcript turns. */
export function partsToWire(parts: Part[]): WireMessage[] {
  const out: WireMessage[] = [];
  let text = '';
  let calls: ToolCall[] = [];
  let results: WireMessage[] = [];
  const flush = () => {
    if (calls.length) {
      out.push({ role: 'assistant', text, toolCalls: calls }, ...results);
      calls = [];
      results = [];
      text = '';
    }
  };
  for (const p of parts) {
    if (p.type === 'text') {
      flush();
      text += p.text;
    } else if (p.type === 'tool') {
      calls.push(p.call);
      results.push({ role: 'tool', callId: p.call.id, name: p.call.name, result: p.result ?? '(no result: interrupted)' });
    }
  }
  flush();
  if (text.trim()) out.push({ role: 'assistant', text });
  return out;
}

/** Builds the transcript for the messages before the turn being generated. */
export function historyToWire(path: Message[]): WireMessage[] {
  const out: WireMessage[] = [];
  for (const m of path) {
    if (m.role === 'user') out.push({ role: 'user', text: m.text, ...(m.attachments?.length ? { attachments: m.attachments } : {}) });
    else out.push(...partsToWire(m.parts));
  }
  return out;
}

function append(parts: Part[], type: 'text' | 'thought', text: string) {
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += text;
  else parts.push({ type, text });
}

export interface TurnOptions {
  adapter: ProviderAdapter;
  request: Omit<ChatRequest, 'messages'>;
  history: WireMessage[];
  message: Message;
  executeTool: (call: ToolCall, signal: AbortSignal) => Promise<string>;
  onChange: () => void;
  onCheckpoint?: () => void;
  signal: AbortSignal;
}

/** Mutates `message` in place and resolves when the turn ends. Never throws for provider errors. */
export async function runTurn(o: TurnOptions): Promise<void> {
  const msg = o.message;
  msg.status = 'streaming';
  msg.error = undefined;
  try {
    for (let round = 0; ; round++) {
      const req: ChatRequest = { ...o.request, messages: [...o.history, ...partsToWire(msg.parts)] };
      let calls: ToolCall[] = [];
      for await (const ev of o.adapter.stream(req, o.signal)) {
        if (ev.type === 'text' || ev.type === 'thought') {
          append(msg.parts, ev.type, ev.text);
          o.onChange();
        } else if (ev.type === 'tool_calls') calls = ev.calls;
      }
      if (!calls.length) break;
      if (round >= MAX_TOOL_ROUNDS) {
        append(msg.parts, 'text', `\n\n_(Stopped after ${MAX_TOOL_ROUNDS} tool rounds.)_`);
        break;
      }
      const toolParts = calls.map((call) => ({ type: 'tool' as const, call, status: 'running' as const } as Extract<Part, { type: 'tool' }>));
      msg.parts.push(...toolParts);
      o.onChange();
      for (const part of toolParts) {
        try {
          part.result = await o.executeTool(part.call, o.signal);
          part.status = 'done';
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') throw e;
          part.result = `Error: ${(e as Error)?.message ?? String(e)}`;
          part.status = 'error';
        }
        o.onChange();
      }
      o.onCheckpoint?.();
    }
    msg.status = 'done';
  } catch (e) {
    for (const p of msg.parts) {
      if (p.type === 'tool' && p.status === 'running') {
        p.status = 'error';
        p.result = '(stopped)';
      }
    }
    if ((e as Error)?.name === 'AbortError' || o.signal.aborted) msg.status = 'stopped';
    else {
      msg.status = 'error';
      msg.error = (e as Error)?.message ?? String(e);
    }
  }
  o.onChange();
}
