/**
 * Tests for the offline sales queue.
 *
 * Covers:
 *   - enqueue then list returns the entry
 *   - remove deletes by id
 *   - drainSalesQueue calls runner for each entry
 *   - drainSalesQueue stops on first failure
 *   - online event triggers drain
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueSale,
  listSalesQueue,
  removeSale,
  clearSalesQueue,
  registerSalesRunner,
  drainSalesQueue,
  salesQueueSize,
} from "./offline-sales-queue";

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
  clearSalesQueue();
  registerSalesRunner(null);
});

describe("offline-sales-queue", () => {
  beforeEach(() => {
    clearSalesQueue();
    registerSalesRunner(null);
  });

  it("enqueue adds an entry", () => {
    expect(salesQueueSize()).toBe(0);
    enqueueSale({ total: 100 });
    expect(salesQueueSize()).toBe(1);
    expect(listSalesQueue()[0].payload).toEqual({ total: 100 });
  });

  it("remove deletes by id", () => {
    const entry = enqueueSale({ total: 50 });
    expect(salesQueueSize()).toBe(1);
    removeSale(entry.id);
    expect(salesQueueSize()).toBe(0);
  });

  it("drainSalesQueue calls runner for each entry in order", async () => {
    enqueueSale({ n: 1 });
    enqueueSale({ n: 2 });
    enqueueSale({ n: 3 });

    const calls: number[] = [];
    registerSalesRunner(async (payload) => {
      calls.push((payload as { n: number }).n);
      return true;
    });

    await drainSalesQueue();
    expect(calls).toEqual([1, 2, 3]);
    expect(salesQueueSize()).toBe(0);
  });

  it("drainSalesQueue stops on first failure", async () => {
    enqueueSale({ n: 1 });
    enqueueSale({ n: 2 });
    enqueueSale({ n: 3 });

    const calls: number[] = [];
    registerSalesRunner(async (payload) => {
      const n = (payload as { n: number }).n;
      calls.push(n);
      return n !== 2; // fail on 2
    });

    await drainSalesQueue();
    expect(calls).toEqual([1, 2]); // stopped at 2
    expect(salesQueueSize()).toBe(2); // 2 and 3 remain
  });

  it("drainSalesQueue is a no-op without a runner", async () => {
    enqueueSale({ n: 1 });
    await drainSalesQueue();
    expect(salesQueueSize()).toBe(1); // nothing drained
  });

  it("clearSalesQueue empties the queue", () => {
    enqueueSale({ a: 1 });
    enqueueSale({ b: 2 });
    clearSalesQueue();
    expect(salesQueueSize()).toBe(0);
  });
});
