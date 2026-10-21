// Shared HTTP helpers for provider adapters. Licensed under GPL-3.0.
import { redact } from '../redact';

export class ProviderError extends Error {
  constructor(message: string, readonly status = 0, readonly network = false) {
    super(message);
    this.name = 'ProviderError';
  }
}

const RETRYABLE = new Set([429, 502, 503, 504]);
export const MAX_ATTEMPTS = 3;

export function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

const VERSION_SEGMENT = /\/v\d/;
/** Same rule as Android BaseUrlResolver.withV1: append /v1 unless a version segment is present. */
export function withV1(url: string): string {
  const t = trimBase(url);
  return !t || VERSION_SEGMENT.test(t) ? t : `${t}/v1`;
}

async function errorText(res: Response): Promise<string> {
  let text = '';
  try {
    text = (await res.text()).slice(0, 2000);
  } catch {
    /* ignore */
  }
  try {
    const j = JSON.parse(text);
    const msg = j?.error?.message ?? j?.error ?? j?.message ?? j?.detail;
    if (typeof msg === 'string') return msg;
  } catch {
    /* not JSON */
  }
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || res.statusText;
}

function networkHint(label: string): string {
  return `Couldn't reach ${label}. Either you're offline, or ${label} blocks requests from browser apps (CORS). Use Settings → Providers → Test connection to check.`;
}

export interface PostOptions {
  label: string;
  apiKey?: string;
  signal?: AbortSignal;
  /** Called before each retry wait so the UI can show "retrying". */
  onRetry?: (attempt: number, status: number) => void;
}

/** POSTs JSON with bounded retries for 429/5xx before any output, like Android ProviderRetryPolicy. */
export async function postJson(
  urls: string[], headers: Record<string, string>, body: unknown, opts: PostOptions,
): Promise<Response> {
  const payload = JSON.stringify(body);
  let lastError: ProviderError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    for (let i = 0; i < urls.length; i++) {
      let res: Response;
      try {
        res = await fetch(urls[i], { method: 'POST', headers, body: payload, signal: opts.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        throw new ProviderError(networkHint(opts.label), 0, true);
      }
      if (res.ok) return res;
      const msg = redact(await errorText(res), opts.apiKey);
      lastError = new ProviderError(`${opts.label} ${res.status}: ${msg}`, res.status);
      if (res.status === 404 && i < urls.length - 1) continue; // try the next endpoint candidate
      if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) throw lastError;
      opts.onRetry?.(attempt, res.status);
      await sleep(600 * 2 ** (attempt - 1), opts.signal);
      break;
    }
  }
  throw lastError ?? new ProviderError(`${opts.label}: request failed`);
}

export async function getJson(url: string, headers: Record<string, string>, label: string, apiKey?: string, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ProviderError(networkHint(label), 0, true);
  }
  if (!res.ok) throw new ProviderError(`${label} ${res.status}: ${redact(await errorText(res), apiKey)}`, res.status);
  return res.json();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export function newId(prefix = ''): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function safeParseArgs(args: string): Record<string, unknown> {
  if (!args.trim()) return {};
  try {
    const v = JSON.parse(args);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { value: v };
  } catch {
    return { _raw: args };
  }
}
