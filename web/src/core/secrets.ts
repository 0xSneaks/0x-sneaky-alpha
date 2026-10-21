// On-device secret storage (API keys, search keys, MCP headers). Licensed under GPL-3.0.
//
// Without a passphrase, secrets are stored as plain values in IndexedDB (the app's own origin
// storage on this device). With a passphrase, every secret is AES-GCM encrypted with a key derived
// by PBKDF2-SHA-256; the derived key is non-extractable and kept only in memory until the app is
// closed or locked. Secrets are never logged and never included in exports.
import { del, get, getAllKeys, kv, openDb, put } from './db';

export const PBKDF2_ITERATIONS = 600_000;
const LOCK_KEY = 'lock';
const CHECK_TEXT = '0x-sneaky-alpha-lock-check';

interface LockMeta { v: 1; salt: string; iterations: number; check: Sealed }
interface Sealed { iv: string; ct: string }
type Stored = { p: string } | Sealed;

export class LockedError extends Error {
  constructor() {
    super('Keys are locked. Unlock with your passphrase.');
    this.name = 'LockedError';
  }
}

let sessionKey: CryptoKey | null = null;
const listeners = new Set<() => void>();
export function onLockChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function seal(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: b64(iv), ct: b64(ct) };
}

async function open(key: CryptoKey, s: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) as BufferSource }, key, unb64(s.ct) as BufferSource);
  return new TextDecoder().decode(pt);
}

export async function lockEnabled(): Promise<boolean> {
  return !!(await kv.get<LockMeta>(LOCK_KEY));
}

/** True when secrets can be read right now (no lock, or unlocked this session). */
export async function isUnlocked(): Promise<boolean> {
  return sessionKey !== null || !(await lockEnabled());
}

export async function getSecret(name: string): Promise<string | undefined> {
  const v = await get<Stored>('secrets', name);
  if (!v) return undefined;
  if ('p' in v) return v.p;
  if (!sessionKey) throw new LockedError();
  return open(sessionKey, v);
}

export async function setSecret(name: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) return del('secrets', name);
  if (await lockEnabled()) {
    if (!sessionKey) throw new LockedError();
    await put('secrets', await seal(sessionKey, trimmed), name);
  } else {
    await put('secrets', { p: trimmed } satisfies Stored, name);
  }
}

export async function deleteSecret(name: string): Promise<void> {
  await del('secrets', name);
}

export async function hasSecret(name: string): Promise<boolean> {
  return (await get<Stored>('secrets', name)) !== undefined;
}

async function rewriteAll(transform: (v: Stored) => Promise<Stored>): Promise<void> {
  const names = await getAllKeys('secrets');
  const next: [IDBValidKey, Stored][] = [];
  for (const n of names) next.push([n, await transform((await get<Stored>('secrets', n))!)]);
  const db = await openDb();
  const tx = db.transaction(['secrets'], 'readwrite');
  for (const [n, v] of next) tx.objectStore('secrets').put(v, n);
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

export async function enableLock(pass: string): Promise<void> {
  if (pass.length < 8) throw new Error('Use at least 8 characters.');
  if (await lockEnabled()) throw new Error('A passphrase is already set.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pass, salt, PBKDF2_ITERATIONS);
  await rewriteAll(async (v) => ('p' in v ? seal(key, v.p) : v));
  await kv.set(LOCK_KEY, { v: 1, salt: b64(salt), iterations: PBKDF2_ITERATIONS, check: await seal(key, CHECK_TEXT) } satisfies LockMeta);
  sessionKey = key;
  notify();
}

export async function unlock(pass: string): Promise<boolean> {
  const meta = await kv.get<LockMeta>(LOCK_KEY);
  if (!meta) return true;
  const key = await deriveKey(pass, unb64(meta.salt), meta.iterations);
  try {
    if ((await open(key, meta.check)) !== CHECK_TEXT) return false;
  } catch {
    return false;
  }
  sessionKey = key;
  notify();
  return true;
}

export async function disableLock(): Promise<void> {
  if (!(await lockEnabled())) return;
  const key = sessionKey;
  if (!key) throw new LockedError();
  await rewriteAll(async (v) => ('p' in v ? v : { p: await open(key, v) }));
  await kv.del(LOCK_KEY);
  sessionKey = null;
  notify();
}

export function lockNow(): void {
  sessionKey = null;
  notify();
}

/** Forgotten passphrase: delete every stored secret and the lock. Chats are kept. */
export async function eraseSecrets(): Promise<void> {
  for (const n of await getAllKeys('secrets')) await del('secrets', n);
  await kv.del(LOCK_KEY);
  sessionKey = null;
  notify();
}

export const secretName = {
  provider: (id: string) => `key:${id}`,
  search: (provider: string) => `search:${provider}`,
  mcpHeaders: (id: string) => `mcp:${id}`,
};
