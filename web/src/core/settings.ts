// App settings, persisted in IndexedDB. Licensed under GPL-3.0.
import { kv } from './db';
import { createStore } from './store';
import { BUILT_IN_PROVIDERS, OPENCODE_PROXY_BASE, customToInfo, type CustomProvider, type ProviderInfo } from './providers/catalog';

export interface Settings {
  /** Base URL overrides per provider id. */
  providerUrls: Record<string, string>;
  customProviders: CustomProvider[];
  /** Known model ids per provider (fetched or typed). */
  models: Record<string, string[]>;
  defaultProviderId?: string;
  defaultModel?: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Memory tools + active memory in the system prompt (Android: Memory settings). */
  memoryEnabled: boolean;
  /** Generic web search tool provider. */
  searchProvider: SearchProvider;
  searxngUrl: string;
  /** Provider-hosted search: Gemini grounding, Anthropic web_search, Open Router web plugin. */
  nativeSearch: boolean;
  mcpServers: McpServer[];
}

export type SearchProvider = 'off' | 'tavily' | 'brave' | 'serper' | 'searxng';

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: 'http' | 'sse';
  enabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  providerUrls: {},
  customProviders: [],
  models: {},
  systemPrompt: '',
  memoryEnabled: true,
  searchProvider: 'off',
  searxngUrl: '',
  nativeSearch: false,
  mcpServers: [],
};

export const settingsStore = createStore<Settings>(DEFAULT_SETTINGS);

export async function loadSettings(): Promise<Settings> {
  const saved = await kv.get<Partial<Settings>>('settings');
  const merged = { ...DEFAULT_SETTINGS, ...(saved ?? {}) } as Settings;
  settingsStore.set(merged);
  return merged;
}

export async function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): Promise<Settings> {
  const prev = settingsStore.get();
  const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
  settingsStore.set(next);
  await kv.set('settings', next);
  return next;
}

export function allProviders(s: Settings = settingsStore.get()): ProviderInfo[] {
  return [...BUILT_IN_PROVIDERS, ...s.customProviders.map(customToInfo)];
}

export function providerById(id: string | undefined, s: Settings = settingsStore.get()): ProviderInfo | undefined {
  return id ? allProviders(s).find((p) => p.id === id) : undefined;
}

export function baseUrlFor(p: ProviderInfo, s: Settings = settingsStore.get()): string {
  const resolved = (s.providerUrls[p.id] ?? '').trim() || p.defaultBaseUrl;
  // OpenCode Go blocks direct browser calls, so its own upstream URL is
  // always reached through this deployment's same-origin proxy instead
  // (see web/api/_opencode-proxy.ts). A different URL typed for this
  // provider is respected as-is and called directly.
  if (p.id === 'opencode-go' && resolved.replace(/\/+$/, '') === p.defaultBaseUrl.replace(/\/+$/, '')) {
    return OPENCODE_PROXY_BASE;
  }
  return resolved;
}

export function addModel(providerId: string, model: string): Promise<Settings> {
  return updateSettings((s) => {
    const list = new Set(s.models[providerId] ?? []);
    list.add(model);
    return { models: { ...s.models, [providerId]: [...list].sort() } };
  });
}
