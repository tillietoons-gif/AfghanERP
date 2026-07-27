/**
 * Integration test for the offline sale flow.
 *
 * Simulates a sale being queued, then processed by a registered local runner.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueSale,
  listSalesQueue,
  registerSalesRunner,
  drainSalesQueue,
  salesQueueSize,
} from "./offline-sales-queue";

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
  registerSalesRunner(null);
});

describe("offline sale flow", () => {
  it("enqueues a sale, then drains it through the registered runner", async () => {
    const salePayload = {
      rpcArgs: {
        p_cart: [{ product_id: "p1", quantity: 2 }],
        p_total: 500,
        p_client_request_id: "0c4b8e1d-89ef-4b48-9cd6-eeabf8689150",
      },
      total: 500,
      paymentMethod: "cash",
      enqueuedAt: Date.now(),
    };

    enqueueSale(salePayload);
    expect(salesQueueSize()).toBe(1);
    expect(listSalesQueue()[0].payload).toEqual(salePayload);

    const runnerSpy = vi.fn(async (_payload: unknown) => true);
    registerSalesRunner(runnerSpy);

    await drainSalesQueue();

    expect(runnerSpy).toHaveBeenCalledTimes(1);
    expect(runnerSpy).toHaveBeenCalledWith(salePayload);
    expect(salesQueueSize()).toBe(0);
  });

  it("keeps the sale queued if the runner fails", async () => {
    enqueueSale({ rpcArgs: { p_total: 100 }, total: 100 });

    registerSalesRunner(async () => {
      // Simulate server still down
      return false;
    });

    await drainSalesQueue();
    expect(salesQueueSize()).toBe(1); // still queued
  });

  it("preserves the full payload across enqueue/drain", async () => {
    const payload = {
      rpcArgs: { p_cart: [], p_total: 0 },
      cart: [{ product_id: "x", quantity: 1, unit_price: 100, discount: 0 }],
      total: 100,
      paymentMethod: "credit",
      customerId: "c1",
      invoiceDiscount: 0,
      quickMode: false,
      enqueuedAt: 1234567890,
    };
    enqueueSale(payload);

    let received: unknown = null;
    registerSalesRunner(async (p) => {
      received = p;
      return true;
    });

    await drainSalesQueue();
    expect(received).toEqual(payload);
  });
});
