import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * E2E test for the post-sale stock-movement consistency check.
 *
 * Verifies that after a sale returns an id, the local repository reads
 * `stock_movements` for that sale and reports any missing/mismatched rows
 * as an audit incident WITHOUT failing the sale.
 */

interface Query {
  table: string;
  filters: Record<string, unknown>;
}
const queries: Query[] = [];
interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}
const inserts: InsertCall[] = [];

let stockMovementsResponse: Array<{ product_id: string; quantity: number; movement_type: string }> =
  [];

vi.mock("@/lib/local-store", () => ({
  listLocalStockMovementsFiltered: async (filters: Record<string, unknown>) => {
    queries.push({ table: "stock_movements", filters });
    return stockMovementsResponse;
  },
}));
vi.mock("./local-auth", () => ({
  getLocalSession: () => ({ user: { id: "cashier-1" } }),
}));
vi.mock("./local-sqlite", () => ({
  getLocalSqlite: async () => ({
    execute: async (_sql: string, params: unknown[]) => {
      const [, user_id, action, entity, entity_id, metadata] = params;
      inserts.push({
        table: "audit_logs",
        row: { user_id, action, entity, entity_id, metadata: JSON.parse(String(metadata)) },
      });
    },
  }),
}));

beforeEach(() => {
  queries.length = 0;
  inserts.length = 0;
  stockMovementsResponse = [];
});

describe("post-sale stock_movements consistency check", () => {
  it("returns ok and writes no audit incident when every cart line has a matching movement", async () => {
    stockMovementsResponse = [
      { product_id: "p1", quantity: -2, movement_type: "sale" },
      { product_id: "p2", quantity: -5, movement_type: "sale" },
    ];
    const { verifySaleStockMovements } = await import("./pos-consistency");
    const report = await verifySaleStockMovements("sale-1", [
      { product_id: "p1", quantity: 2 },
      { product_id: "p2", quantity: 5 },
    ]);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.mismatched).toEqual([]);
    // Give the fire-and-forget insert (if any) a tick.
    await Promise.resolve();
    expect(inserts).toEqual([]);
  });

  it("logs a sale_failed audit incident with the missing product ids", async () => {
    stockMovementsResponse = [{ product_id: "p1", quantity: -2, movement_type: "sale" }];
    const { verifySaleStockMovements } = await import("./pos-consistency");
    const report = await verifySaleStockMovements("sale-2", [
      { product_id: "p1", quantity: 2 },
      { product_id: "p2", quantity: 5 },
    ]);
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["p2"]);
    await Promise.resolve();
    const auditRow = inserts.find((i) => i.row.action === "sale_failed");
    expect(auditRow).toBeDefined();
    const meta = auditRow!.row.metadata as { kind: string; missing: string[] };
    expect(meta.kind).toBe("stock_movement_inconsistency");
    expect(meta.missing).toEqual(["p2"]);
  });

  it("flags mismatched quantities (partial ledger write)", async () => {
    stockMovementsResponse = [{ product_id: "p1", quantity: -1, movement_type: "sale" }];
    const { verifySaleStockMovements } = await import("./pos-consistency");
    const report = await verifySaleStockMovements("sale-3", [{ product_id: "p1", quantity: 3 }]);
    expect(report.ok).toBe(false);
    expect(report.mismatched).toEqual([{ product_id: "p1", expected: 3, actual: 1 }]);
    await Promise.resolve();
    expect(inserts.some((i) => i.row.action === "sale_failed")).toBe(true);
  });

  it("queries stock_movements by reference id and movement type", async () => {
    const { verifySaleStockMovements } = await import("./pos-consistency");
    await verifySaleStockMovements("sale-4", [{ product_id: "p1", quantity: 1 }]);
    expect(queries).toHaveLength(1);
    expect(queries[0].table).toBe("stock_movements");
    expect(queries[0].filters).toEqual({
      referenceId: "sale-4",
      movementType: "sale",
    });
  });
});
