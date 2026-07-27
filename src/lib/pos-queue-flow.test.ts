import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueuePos, registerPosRunner, drainQueue, listQueue, clearQueue } from "./pos-queue";
import type { PosRetryDescriptor } from "./pos-retry";

/**
 * End-to-end offline queue flow test.
 *
 * Simulates the following user scenario:
 *   1. User is in POS with a cart containing items and a chosen payment method.
 *   2. Network drops. A barcode scan fails → descriptor is enqueued.
 *   3. Another scan fails while offline → also enqueued.
 *   4. Network returns and the "online" event fires → registered runner
 *      drains the queue in order.
 *   5. Throughout the drain, the caller's in-memory form state (cart,
 *      payment method) must remain untouched, and the queue must empty
 *      once every runner call succeeds.
 */

// Node's vitest environment gives us a real localStorage-shaped global via
// jsdom; ours is `node`, so provide a minimal shim.
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
  // pos-queue guards storage access with `typeof window !== "undefined"`,
  // so give it a minimal window-like object pointing at the same storage.
  (globalThis as { window?: unknown }).window = { localStorage: store };
  clearQueue();
});

describe("POS offline queue → auto-resume on reconnect", () => {
  it("enqueues failed scans while offline and drains them in order when the runner succeeds", async () => {
    // ---- form state (simulates POS component's useState) -----------------
    const formState = {
      cart: [{ product_id: "p1", quantity: 3 }],
      paymentMethod: "credit" as "cash" | "credit",
      customerId: "cust-42",
    };
    const snapshotBefore = JSON.parse(JSON.stringify(formState));

    // ---- offline: two barcode scans fail and get enqueued ----------------
    const d1: PosRetryDescriptor = { kind: "scan", code: "111", keepScannerOpen: true };
    const d2: PosRetryDescriptor = { kind: "scan", code: "222", keepScannerOpen: false };
    enqueuePos(d1);
    enqueuePos(d2);
    expect(listQueue()).toHaveLength(2);
    expect(listQueue().map((q) => (q.descriptor as { code: string }).code)).toEqual(["111", "222"]);

    // ---- reconnect: register a runner that "succeeds" ---------------------
    const runnerCalls: PosRetryDescriptor[] = [];
    const runner = vi.fn(async (d: PosRetryDescriptor) => {
      runnerCalls.push(d);
      // The runner MUST NOT mutate the caller's form state. Cross-check by
      // reading the descriptor only and returning success.
      return true;
    });
    registerPosRunner(runner);

    // Simulate the online event fired by the browser.
    await drainQueue();

    // ---- assertions -------------------------------------------------------
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runnerCalls).toEqual([d1, d2]);
    expect(listQueue()).toHaveLength(0);
    // Form state must be preserved exactly.
    expect(formState).toEqual(snapshotBefore);

    registerPosRunner(null);
  });

  it("stops draining on first failure and keeps the remaining queue intact for the next reconnect", async () => {
    enqueuePos({ kind: "scan", code: "A" });
    enqueuePos({ kind: "scan", code: "B" });
    enqueuePos({ kind: "scan", code: "C" });
    expect(listQueue()).toHaveLength(3);

    // Runner succeeds once, then fails.
    let call = 0;
    registerPosRunner(async () => {
      call += 1;
      return call === 1;
    });

    await drainQueue();

    // A drained, B failed → stop. B and C still queued.
    const remaining = listQueue().map((q) => (q.descriptor as { code: string }).code);
    expect(remaining).toEqual(["B", "C"]);

    // Reconnect again with a fully-succeeding runner.
    registerPosRunner(async () => true);
    await drainQueue();
    expect(listQueue()).toHaveLength(0);

    registerPosRunner(null);
  });

  it("skips non-scan descriptors when draining (save state cannot be replayed)", async () => {
    // enqueuePos returns a record for save but does not persist it. To
    // exercise the drain-time skip branch, we hand-write a save entry into
    // storage (mirrors what a corrupted/legacy payload might look like).
    (globalThis.localStorage as Storage).setItem(
      "pos.queue.v1",
      JSON.stringify([
        { id: "old_save", descriptor: { kind: "save" }, savedAt: Date.now() },
        { id: "ok_scan", descriptor: { kind: "scan", code: "Z" }, savedAt: Date.now() },
      ]),
    );

    const runner = vi.fn(async () => true);
    registerPosRunner(runner);
    await drainQueue();

    // Save entry dropped without being sent to the runner; scan drained.
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith({ kind: "scan", code: "Z" });
    expect(listQueue()).toHaveLength(0);
    registerPosRunner(null);
  });

  it("no-ops the drain when no runner is registered so items stay queued", async () => {
    enqueuePos({ kind: "scan", code: "X" });
    registerPosRunner(null);
    await drainQueue();
    expect(listQueue()).toHaveLength(1);
  });
});
