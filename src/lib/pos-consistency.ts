import { listLocalStockMovementsFiltered } from "@/lib/local-store";
import { logPosEvent } from "@/lib/pos-audit";

/**
 * Post-sale consistency check.
 *
 * `create_sale` inserts one `stock_movements` row per cart line inside the
 * same transaction, but historical incidents (a botched RPC redeploy, a
 * disabled trigger, a manual patch) can leave the ledger out of sync with
 * the sale. This check runs AFTER a successful RPC call and verifies that:
 *   - one movement row exists per distinct product in the cart, and
 *   - each row's absolute quantity matches the cart quantity.
 *
 * On mismatch we DO NOT fail the sale (the sale is already committed and
 * money changed hands). We only log an audit incident with the full diff so
 * ops can reconcile inventory. Success is silent.
 */

export interface ExpectedLine {
  product_id: string;
  quantity: number;
}

export interface ConsistencyReport {
  ok: boolean;
  saleId: string;
  missing: string[]; // product_ids expected but not found
  mismatched: Array<{ product_id: string; expected: number; actual: number }>;
  extra: string[]; // product_ids present in ledger but not in cart
  error?: string; // network / query error, if any
}

export async function verifySaleStockMovements(
  saleId: string,
  cart: ExpectedLine[],
): Promise<ConsistencyReport> {
  // Aggregate the cart in case a product appears in multiple lines.
  const expected = new Map<string, number>();
  for (const l of cart) {
    expected.set(l.product_id, (expected.get(l.product_id) ?? 0) + Number(l.quantity));
  }

  let data: Awaited<ReturnType<typeof listLocalStockMovementsFiltered>>;
  try {
    data = await listLocalStockMovementsFiltered({ referenceId: saleId, movementType: "sale" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "local_stock_movement_query_failed";
    const report: ConsistencyReport = {
      ok: false,
      saleId,
      missing: [],
      mismatched: [],
      extra: [],
      error: message,
    };
    void logPosEvent({
      action: "sale_failed",
      entityId: saleId,
      metadata: { kind: "consistency_check_query_failed", error: message },
    });
    return report;
  }

  const actual = new Map<string, number>();
  for (const row of data) {
    // Sale movements are recorded as negative deltas — compare absolute values.
    const q = Math.abs(Number(row.quantity));
    actual.set(row.product_id, (actual.get(row.product_id) ?? 0) + q);
  }

  const missing: string[] = [];
  const mismatched: Array<{ product_id: string; expected: number; actual: number }> = [];
  for (const [pid, qty] of expected) {
    const a = actual.get(pid);
    if (a === undefined) missing.push(pid);
    else if (a !== qty) mismatched.push({ product_id: pid, expected: qty, actual: a });
  }
  const extra: string[] = [];
  for (const pid of actual.keys()) {
    if (!expected.has(pid)) extra.push(pid);
  }

  const ok = missing.length === 0 && mismatched.length === 0 && extra.length === 0;
  const report: ConsistencyReport = { ok, saleId, missing, mismatched, extra };

  if (!ok) {
    void logPosEvent({
      action: "sale_failed",
      entityId: saleId,
      metadata: {
        kind: "stock_movement_inconsistency",
        missing,
        mismatched,
        extra,
        expectedCount: expected.size,
        actualCount: actual.size,
      },
    });
  }

  return report;
}
