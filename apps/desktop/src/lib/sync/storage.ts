// The sync layer talks to storage through this interface so tests can use an
// in-memory store. Writes may throw (quota, blocked storage); callers surface it.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** Async durability barrier for hydrated stores; memory stores are immediate. */
  flush?(): Promise<void>;
  subscribeErrors?(listener: (error: unknown) => void): () => void;
}

export function memoryStore(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

/** Missing keys use the default. Corruption must never silently erase a queue. */
export function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  const raw = store.get(key);
  if (raw === null) return fallback;
  try {
    const parsed: T = JSON.parse(raw);
    if (parsed === null) throw new Error("Invalid saved planner value");
    return parsed;
  } catch {
    throw new Error(
      "Saved planner data is not valid JSON. The original data has been retained.",
    );
  }
}
