/**
 * Tests for the offline read cache.
 *
 * Covers:
 *   - write then read returns the same data
 *   - expired entries return null
 *   - cachedFetch falls back to cache when fetcher throws
 *   - cachedFetch returns fresh data and updates cache on success
 *   - clearCache removes entries
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readCache, writeCache, clearCache, cachedFetch } from "./offline-cache";

// Node's vitest environment is `node` (no jsdom), so provide a minimal
// localStorage shim that mirrors the Storage interface.
class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

beforeEach(() => {
  const store = new MemStorage();
  (globalThis as { localStorage?: Storage }).localStorage = store;
  (globalThis as { window?: unknown }).window = { localStorage: store };
  clearCache();
});

describe("offline-cache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("round-trips data through write/read", () => {
    writeCache("test", { id: 1 }, { hello: "world" });
    expect(readCache<{ hello: string }>("test", { id: 1 })).toEqual({ hello: "world" });
  });

  it("returns null for missing keys", () => {
    expect(readCache("nope", null)).toBeNull();
  });

  it("returns null for expired entries", () => {
    writeCache("test", null, { x: 1 }, 10); // 10ms TTL
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(readCache("test", null)).toBeNull();
        resolve();
      }, 30);
    });
  });

  it("cachedFetch returns fresh data on success", async () => {
    const result = await cachedFetch("test", { k: 1 }, async () => ({ v: 42 }));
    expect(result.fromCache).toBe(false);
    expect(result.data).toEqual({ v: 42 });
    // Subsequent read should hit cache
    expect(readCache("test", { k: 1 })).toEqual({ v: 42 });
  });

  it("cachedFetch falls back to cache when fetcher throws", async () => {
    writeCache("test", { k: 2 }, { cached: true });
    const result = await cachedFetch("test", { k: 2 }, async () => {
      throw new Error("network down");
    });
    expect(result.fromCache).toBe(true);
    expect(result.data).toEqual({ cached: true });
  });

  it("cachedFetch rethrows when fetcher fails and no cache exists", async () => {
    await expect(
      cachedFetch("test", { k: 3 }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("clearCache removes all entries when no name given", () => {
    writeCache("a", null, { x: 1 });
    writeCache("b", null, { y: 2 });
    clearCache();
    expect(readCache("a", null)).toBeNull();
    expect(readCache("b", null)).toBeNull();
  });

  it("clearCache removes only matching entries when name given", () => {
    writeCache("keep", null, { x: 1 });
    writeCache("drop", null, { y: 2 });
    clearCache("drop");
    expect(readCache("keep", null)).toEqual({ x: 1 });
    expect(readCache("drop", null)).toBeNull();
  });
});
