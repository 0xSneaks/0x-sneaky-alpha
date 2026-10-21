// Small promise wrapper over IndexedDB. Licensed under GPL-3.0.

export const DB_NAME = '0x-sneaky-alpha';
const DB_VERSION = 1;

export type StoreName = 'kv' | 'secrets' | 'conversations' | 'messages' | 'memory';

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('secrets')) db.createObjectStore('secrets');
      if (!db.objectStoreNames.contains('conversations')) {
        db.createObjectStore('conversations', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' }).createIndex('convId', 'convId');
      }
      if (!db.objectStoreNames.contains('memory')) db.createObjectStore('memory', { keyPath: 'name' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}

/** Test hook: forget the cached connection (used after deleting the database). */
export function resetDbConnection(): void {
  dbPromise?.then((db) => db.close()).catch(() => undefined);
  dbPromise = null;
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function get<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return req((await store(name, 'readonly')).get(key)) as Promise<T | undefined>;
}

export async function getAll<T>(name: StoreName): Promise<T[]> {
  return req((await store(name, 'readonly')).getAll()) as Promise<T[]>;
}

export async function getAllKeys(name: StoreName): Promise<IDBValidKey[]> {
  return req((await store(name, 'readonly')).getAllKeys());
}

export async function getByIndex<T>(name: StoreName, index: string, value: IDBValidKey): Promise<T[]> {
  return req((await store(name, 'readonly')).index(index).getAll(value)) as Promise<T[]>;
}

export async function put(name: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  const s = await store(name, 'readwrite');
  await req(key === undefined ? s.put(value) : s.put(value, key));
}

export async function del(name: StoreName, key: IDBValidKey): Promise<void> {
  await req((await store(name, 'readwrite')).delete(key));
}

export async function clear(name: StoreName): Promise<void> {
  await req((await store(name, 'readwrite')).clear());
}

/** Writes many records across stores in one transaction, so a partial write cannot persist. */
export async function putMany(items: { store: StoreName; value: unknown; key?: IDBValidKey }[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDb();
  const names = [...new Set(items.map((i) => i.store))];
  const tx = db.transaction(names, 'readwrite');
  for (const item of items) {
    const s = tx.objectStore(item.store);
    if (item.key === undefined) s.put(item.value);
    else s.put(item.value, item.key);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteMany(items: { store: StoreName; key: IDBValidKey }[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openDb();
  const tx = db.transaction([...new Set(items.map((i) => i.store))], 'readwrite');
  for (const item of items) tx.objectStore(item.store).delete(item.key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kv = {
  get: <T>(key: string) => get<T>('kv', key),
  set: (key: string, value: unknown) => put('kv', value, key),
  del: (key: string) => del('kv', key),
};
