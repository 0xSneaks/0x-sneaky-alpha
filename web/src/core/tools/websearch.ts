// Generic web search tool. Licensed under GPL-3.0.
// DuckDuckGo and Kagi from the Android list need a server (no browser API), so they are not offered.
import { getJson, ProviderError } from '../providers/http';
import { redact } from '../redact';
import type { SearchProvider } from '../settings';
import type { ToolDef } from '../types';

export const WEB_SEARCH_TOOL: ToolDef = {
  name: 'web_search',
  description: 'Search the web and return the top results (title, URL, snippet).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'The search query.' } }, required: ['query'] },
};

export const SEARCH_LABEL: Record<SearchProvider, string> = {
  off: 'Off', tavily: 'Tavily', brave: 'Brave', serper: 'Serper', searxng: 'SearXNG',
};

interface Result { title: string; url: string; snippet: string }

async function post(url: string, headers: Record<string, string>, body: unknown, key: string, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ProviderError('Search service unreachable (offline or it blocks browser apps via CORS).', 0, true);
  }
  if (!res.ok) throw new ProviderError(`Search ${res.status}: ${redact((await res.text()).slice(0, 200), key)}`, res.status);
  return res.json();
}

export async function webSearch(provider: SearchProvider, query: string, key: string, searxngUrl: string, signal?: AbortSignal): Promise<Result[]> {
  const q = query.trim();
  if (!q) throw new Error('query is required');
  switch (provider) {
    case 'tavily': {
      const j = await post('https://api.tavily.com/search', { Authorization: `Bearer ${key}` }, { query: q, max_results: 6 }, key, signal);
      return (j.results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
    }
    case 'serper': {
      const j = await post('https://google.serper.dev/search', { 'X-API-KEY': key }, { q, num: 6 }, key, signal);
      return (j.organic ?? []).map((r: any) => ({ title: r.title, url: r.link, snippet: r.snippet }));
    }
    case 'brave': {
      const j = await getJson(`https://api.search.brave.com/res/v1/web/search?count=6&q=${encodeURIComponent(q)}`, { Accept: 'application/json', 'X-Subscription-Token': key }, 'Brave', key, signal);
      return (j.web?.results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.description }));
    }
    case 'searxng': {
      if (!searxngUrl) throw new Error('Set your SearXNG URL in Settings.');
      const j = await getJson(`${searxngUrl.replace(/\/+$/, '')}/search?format=json&q=${encodeURIComponent(q)}`, {}, 'SearXNG', undefined, signal);
      return (j.results ?? []).slice(0, 6).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
    }
    default:
      throw new Error('Web search is off.');
  }
}

export function formatResults(results: Result[]): string {
  if (!results.length) return 'No results.';
  return results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${(r.snippet ?? '').replace(/<[^>]+>/g, '')}`).join('\n\n');
}
