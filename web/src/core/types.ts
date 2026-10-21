// Shared data types. Licensed under GPL-3.0.

export type Protocol = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments, exactly as the model produced them. */
  arguments: string;
  /** Opaque provider state (e.g. Gemini thought signature). Only replayed to the same protocol. */
  sig?: string;
  sigProtocol?: Protocol;
}

export type Part =
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool'; call: ToolCall; status: 'running' | 'done' | 'error'; result?: string };

/** A file attached to a user message. Images and PDFs keep base64 data; text files keep their text. */
export interface Attachment {
  id: string;
  kind: 'image' | 'pdf' | 'text';
  name: string;
  mime: string;
  size: number;
  /** Base64 (no data: prefix) for images and PDFs. */
  data?: string;
  /** Contents of a text file. */
  text?: string;
  width?: number;
  height?: number;
}

export type MessageStatus = 'streaming' | 'done' | 'stopped' | 'error';

export interface Message {
  id: string;
  convId: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  /** User text. Assistant output lives in `parts`. */
  text: string;
  attachments?: Attachment[];
  parts: Part[];
  createdAt: number;
  status: MessageStatus;
  error?: string;
  providerId?: string;
  model?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Selected child per parent ('root' for top level). Missing entries fall back to the newest child. */
  selected: Record<string, string>;
  providerId?: string;
  model?: string;
}

/** Provider-neutral transcript passed to adapters. */
export type WireMessage =
  | { role: 'user'; text: string; attachments?: Attachment[] }
  | { role: 'assistant'; text: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; callId: string; name: string; result: string };

export interface ChatRequest {
  providerId: string;
  providerLabel: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  messages: WireMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  /** Provider-hosted web search (Gemini grounding, Anthropic web_search, OpenRouter web plugin). */
  nativeSearch?: boolean;
  extraHeaders?: Record<string, string>;
  /** Custom endpoints: retry with /v1 appended when the bare URL 404s (Android retryMissingV1BaseUrl). */
  retryMissingV1?: boolean;
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string }
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'usage'; input?: number; output?: number }
  | { type: 'retry'; attempt: number; status: number };

export interface ProviderAdapter {
  stream(req: ChatRequest, signal: AbortSignal): AsyncGenerator<StreamEvent>;
  listModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<string[]>;
}
