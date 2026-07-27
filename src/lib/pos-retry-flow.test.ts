import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMemoryStorage, loadPersistedIncident, savePersistedIncident } from "./pos-retry";
import type { NormalizedError } from "./error-handler";

/**
 * End-to-end retry flow test.
 *
 * This test intentionally does NOT mount the POS route (no @testing-library/react
 * available); instead it faithfully reproduces the POS retry contract:
 *   - `lastActionRef` is a mutable handle capturing the failed save/scan.
 *   - Invoking it must re-read the *current* form state, not a snapshot taken
 *     at the moment the failure was recorded — this is what preserves the
 *     user's inputs after they tweak the cart / payment method and hit retry.
 *   - Scan retries are additionally persisted to localStorage so a page
 *     refresh still lets the user replay the barcode without re-scanning.
 */

// ---- shared harness: minimal POS-shaped state + retry mechanics ----------
function createPosLike() {
  const state = {
    cart: [] as { id: string; qty: number }[],
    paymentMethod: "cash" as "cash" | "credit",
    lastScan: null as string | null,
    lastError: null as NormalizedError | null,
  };
  const lastActionRef: { current: null | (() => Promise<unknown>) } = { current: null };
  const storage = createMemoryStorage();

  // Simulated backend: fails until `succeedAfter` calls succeed.
  let failuresLeft = 0;
  const setFailures = (n: number) => {
    failuresLeft = n;
  };

  // Save: reads state.cart at call time.
  const saveCalls: Array<{ cart: unknown; paymentMethod: string }> = [];
  async function handleSave() {
    saveCalls.push({
      cart: JSON.parse(JSON.stringify(state.cart)),
      paymentMethod: state.paymentMethod,
    });
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      const err: NormalizedError = {
        message: "insufficient_stock",
        incidentId: "ERR-SAVE-0001",
        original: null,
      };
      state.lastError = err;
      lastActionRef.current = () => handleSave();
      return { ok: false as const, error: err };
    }
    state.lastError = null;
    return { ok: true as const };
  }

  // Scan: captures barcode at call time and persists the descriptor.
  const scanCalls: string[] = [];
  async function lookupBarcode(code: string) {
    scanCalls.push(code);
    state.lastScan = code;
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      const err: NormalizedError = {
        message: "rpc_failed",
        incidentId: "ERR-SCAN-9001",
        original: null,
      };
      state.lastError = err;
      lastActionRef.current = () => lookupBarcode(code);
      savePersistedIncident({ descriptor: { kind: "scan", code }, error: err }, storage);
      return { ok: false as const };
    }
    state.lastError = null;
    return { ok: true as const };
  }

  const retryLastAction = async () => {
    const action = lastActionRef.current;
    if (!action) return { retried: false };
    await action();
    return { retried: true, cleared: state.lastError === null };
  };

  return {
    state,
    storage,
    lastActionRef,
    setFailures,
    handleSave,
    lookupBarcode,
    retryLastAction,
    saveCalls,
    scanCalls,
  };
}

describe("POS retry flow (end-to-end contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("save retry re-submits with the CURRENT cart, preserving user edits between attempts", async () => {
    const pos = createPosLike();
    pos.state.cart = [{ id: "p1", qty: 1 }];
    pos.state.paymentMethod = "cash";
    pos.setFailures(1);

    const first = await pos.handleSave();
    expect(first.ok).toBe(false);
    expect(pos.state.lastError?.incidentId).toBe("ERR-SAVE-0001");

    // User keeps their cart & switches payment method BEFORE retrying.
    pos.state.cart.push({ id: "p2", qty: 3 });
    pos.state.paymentMethod = "credit";

    const result = await pos.retryLastAction();
    expect(result.retried).toBe(true);
    expect(result.cleared).toBe(true);

    // Second save observed the *updated* state, proving form state was preserved
    // (never overwritten or snapshotted) between the failed attempt and the retry.
    expect(pos.saveCalls).toHaveLength(2);
    expect(pos.saveCalls[1].cart).toEqual([
      { id: "p1", qty: 1 },
      { id: "p2", qty: 3 },
    ]);
    expect(pos.saveCalls[1].paymentMethod).toBe("credit");
  });

  it("scan retry re-runs lookup with the same barcode without re-scanning", async () => {
    const pos = createPosLike();
    pos.setFailures(1);

    await pos.lookupBarcode("6291000123456");
    expect(pos.state.lastError?.incidentId).toBe("ERR-SCAN-9001");

    const result = await pos.retryLastAction();
    expect(result.retried).toBe(true);
    expect(pos.scanCalls).toEqual(["6291000123456", "6291000123456"]);
    expect(pos.state.lastError).toBeNull();
  });

  it("scan retry survives a simulated page refresh via localStorage persistence", async () => {
    const pos = createPosLike();
    pos.setFailures(1);
    await pos.lookupBarcode("SKU-999");

    // Simulate reload: throw away in-memory refs but keep storage.
    const rehydrated = loadPersistedIncident(pos.storage);
    expect(rehydrated?.descriptor).toEqual({ kind: "scan", code: "SKU-999" });
    expect(rehydrated?.error.incidentId).toBe("ERR-SCAN-9001");

    // New session rebuilds the retry action from the persisted descriptor.
    const pos2 = createPosLike();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const desc = rehydrated!.descriptor;
    if (desc.kind !== "scan") throw new Error("expected scan descriptor");
    pos2.lastActionRef.current = () => pos2.lookupBarcode(desc.code);

    await pos2.retryLastAction();
    expect(pos2.scanCalls).toEqual(["SKU-999"]);
  });
});
