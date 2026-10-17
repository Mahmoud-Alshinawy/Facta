// The sync layer talks to storage through this interface so tests can use an
// in-memory store. Writes may throw (quota, blocked storage); callers surface it.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserStore: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing to clean up if storage is unavailable
    }
  },
};

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => { data.set(key, value); },
    remove: (key) => { data.delete(key); },
  };
}

/** Parses JSON, returning the fallback on missing or corrupt data. */
export function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  const raw = store.get(key);
  if (!raw) return fallback;
  try {
    const parsed: T = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
