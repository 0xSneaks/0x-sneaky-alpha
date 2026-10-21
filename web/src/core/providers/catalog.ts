// Provider catalog. Same built-in list and order as the Android onboarding (WelcomeScreen.kt),
// default base URLs from the Android provider classes. Licensed under GPL-3.0.
import type { Protocol, ProviderAdapter } from '../types';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { ollamaAdapter } from './ollama';
import { openAiAdapter } from './openai';

/**
 * Browser (CORS) status, checked 2026-10-21:
 * - verified: live preflight from a browser origin returned Access-Control-Allow-Origin.
 * - likely: public reports of direct browser use; not re-checked (sandbox network blocked the host).
 * - unverified: no reliable evidence either way; use "Test connection" on the device.
 * - blocked: documented to fail browser preflight.
 * - local: your own server; it must allow this site's origin and be served over HTTPS.
 */
export type CorsStatus = 'verified' | 'likely' | 'unverified' | 'blocked' | 'local' | 'custom' | 'proxy';

/** Same-origin base the app uses for OpenCode Go; the deployment's proxy function relays it. */
export const OPENCODE_PROXY_BASE = '/api/proxy';

export interface ProviderInfo {
  id: string;
  label: string;
  protocol: Protocol;
  defaultBaseUrl: string;
  keyRequired: boolean;
  builtIn: boolean;
  cors: CorsStatus;
  note?: string;
  extraHeaders?: Record<string, string>;
  retryMissingV1?: boolean;
}

export const BUILT_IN_PROVIDERS: ProviderInfo[] = [
  { id: 'google', label: 'Google', protocol: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyRequired: true, builtIn: true, cors: 'verified', note: 'Gemini' },
  { id: 'openai', label: 'OpenAI', protocol: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', keyRequired: true, builtIn: true, cors: 'likely' },
  { id: 'anthropic', label: 'Anthropic', protocol: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1', keyRequired: true, builtIn: true, cors: 'verified' },
  { id: 'deepseek', label: 'DeepSeek', protocol: 'openai', defaultBaseUrl: 'https://api.deepseek.com', keyRequired: true, builtIn: true, cors: 'unverified' },
  { id: 'qwen', label: 'Qwen', protocol: 'openai', defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', keyRequired: true, builtIn: true, cors: 'unverified', note: 'DashScope' },
  { id: 'groq', label: 'Groq', protocol: 'openai', defaultBaseUrl: 'https://api.groq.com/openai/v1', keyRequired: true, builtIn: true, cors: 'unverified' },
  { id: 'ollama', label: 'Ollama', protocol: 'ollama', defaultBaseUrl: 'http://localhost:11434', keyRequired: false, builtIn: true, cors: 'local', note: 'Your server must allow this site (OLLAMA_ORIGINS) and use HTTPS' },
  {
    id: 'openrouter', label: 'Open Router', protocol: 'openai', defaultBaseUrl: 'https://openrouter.ai/api/v1', keyRequired: true, builtIn: true, cors: 'likely',
    extraHeaders: { 'HTTP-Referer': 'https://github.com/0xSneaks/0x-sneaky-alpha', 'X-Title': '0x Sneaky Alpha' },
  },
  { id: 'opencode-go', label: 'OpenCode Go', protocol: 'openai', defaultBaseUrl: 'https://opencode.ai/zen/go/v1', keyRequired: true, builtIn: true, cors: 'proxy', note: 'Goes through this site’s own proxy (api/proxy), because OpenCode Go blocks direct browser calls' },
];

export interface CustomProvider {
  id: string;
  label: string;
  protocol: Exclude<Protocol, 'ollama'>;
  baseUrl: string;
}

export function customToInfo(c: CustomProvider): ProviderInfo {
  return {
    id: c.id, label: c.label, protocol: c.protocol, defaultBaseUrl: c.baseUrl, keyRequired: false, builtIn: false, cors: 'custom',
    retryMissingV1: c.protocol === 'openai',
  };
}

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  openai: 'OpenAI-compatible', anthropic: 'Anthropic-compatible', gemini: 'Google-compatible', ollama: 'Ollama',
};

export const CORS_LABEL: Record<CorsStatus, string> = {
  verified: 'Browser OK', likely: 'Browser likely OK', unverified: 'Browser untested', blocked: 'Blocked in browsers', local: 'Your server', custom: 'Custom', proxy: 'Via this site’s proxy',
};

export function adapterFor(protocol: Protocol): ProviderAdapter {
  switch (protocol) {
    case 'openai': return openAiAdapter;
    case 'anthropic': return anthropicAdapter;
    case 'gemini': return geminiAdapter;
    case 'ollama': return ollamaAdapter;
  }
}
