/**
 * Offline read cache for POS-critical data (products, customers).
 *
 * Strategy:
 *   - On every successful fetch, mirror the result into localStorage.
 *   - When offline (or fetch fails), serve the cached snapshot.
 *   - Cache is keyed by query name + serialized params.
 *   - TTL defaults to 24h — stale data is better than no data at the till.
 *
 * This is intentionally simple (no IndexedDB, no Dexie) because:
 *   - The data we cache is small (a few hundred products max).
 *   - localStorage is synchronous, so reads work even when the network is down.
 *   - No new dependency to ship.
 */

const PREFIX = "offline.cache.v1.";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function key(name: string, params: unknown): string {
  const paramStr = params == null ? "" : JSON.stringify(params);
  return `${PREFIX}${name}::${paramStr}`;
}

export function readCache<T>(name: string, params: unknown): T | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key(name, params));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.cachedAt !== "number") return null;
    if (Date.now() - entry.cachedAt > entry.ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(
  name: string,
  params: unknown,
  data: T,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const s = storage();
  if (!s) return;
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now(), ttlMs };
    s.setItem(key(name, params), JSON.stringify(entry));
  } catch {
    /* quota — drop silently */
  }
}

export function clearCache(name?: string): void {
  const s = storage();
  if (!s) return;
  if (!name) {
    const toRemove: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => s.removeItem(k));
    return;
  }
  const toRemove: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(PREFIX + name + "::")) toRemove.push(k);
  }
  toRemove.forEach((k) => s.removeItem(k));
}

/**
 * Wrap a fetcher so it transparently uses the offline cache as a fallback.
 * Returns `{ data, fromCache }` so callers can show a "served from cache" hint.
 */
export async function cachedFetch<T>(
  name: string,
  params: unknown,
  fetcher: () => Promise<T>,
): Promise<{ data: T; fromCache: boolean }> {
  try {
    const data = await fetcher();
    writeCache(name, params, data);
    return { data, fromCache: false };
  } catch (err) {
    const cached = readCache<T>(name, params);
    if (cached !== null) return { data: cached, fromCache: true };
    throw err;
  }
}
