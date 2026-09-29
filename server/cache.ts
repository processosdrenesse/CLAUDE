interface Entry { at: number; value: unknown }
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let epoch = Date.now();

/** Memoriza com TTL e deduplica chamadas simultâneas. `force` ignora o cache. */
export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>, force = false): Promise<T> {
  const hit = store.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn()
    .then((v) => { store.set(key, { at: Date.now(), value: v }); return v; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function clearCache(prefix?: string) {
  for (const k of store.keys()) if (!prefix || k.startsWith(prefix)) store.delete(k);
  epoch = Date.now();
}
export const cacheEpoch = () => epoch;
