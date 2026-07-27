import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * E2E test for POS audit-log side effects.
 *
 * Verifies that the fire-and-forget `logPosEvent` helper inserts a row into
 * `audit_logs` with the exact action code + metadata shape that ops/support
 * rely on when tracing payment or stock incidents. Covers:
 *   - quick_sale_success on happy path
 *   - quick_sale_failed on RPC failure (with incidentId / normalized code)
 *   - barcode_rejected when client-side validation blocks the RPC
 */

interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}
const inserts: InsertCall[] = [];
let failWrites = false;

vi.mock("./local-auth", () => ({
  getLocalSession: () => ({ user: { id: "user-abc" } }),
}));

vi.mock("./local-sqlite", () => ({
  getLocalSqlite: async () => ({
    execute: async (_sql: string, params: unknown[]) => {
      if (failWrites) throw new Error("boom");
      const [, user_id, action, entity, entity_id, metadata] = params;
      inserts.push({
        table: "audit_logs",
        row: {
          user_id,
          action,
          entity,
          entity_id,
          metadata: JSON.parse(String(metadata)),
        },
      });
    },
  }),
}));

beforeEach(() => {
  inserts.length = 0;
  failWrites = false;
});

describe("POS audit-log events", () => {
  it("writes a quick_sale_success row with entity_id + itemCount + total metadata", async () => {
    const { logPosEvent } = await import("./pos-audit");
    await logPosEvent({
      action: "quick_sale_success",
      entityId: "sale-1",
      metadata: { itemCount: 3, total: 240, paymentMethod: "cash", quickMode: true },
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("audit_logs");
    expect(inserts[0].row).toMatchObject({
      user_id: "user-abc",
      action: "quick_sale_success",
      entity: "pos",
      entity_id: "sale-1",
      metadata: { itemCount: 3, total: 240, paymentMethod: "cash", quickMode: true },
    });
  });

  it("writes a quick_sale_failed row that carries the incidentId + normalized code", async () => {
    const { logPosEvent } = await import("./pos-audit");
    await logPosEvent({
      action: "quick_sale_failed",
      metadata: {
        incidentId: "inc-42",
        code: "P0001",
        message: "insufficient_stock:شکر|3|5",
        itemCount: 1,
        total: 400,
        paymentMethod: "cash",
      },
    });

    expect(inserts).toHaveLength(1);
    const row = inserts[0].row as Record<string, unknown>;
    expect(row.action).toBe("quick_sale_failed");
    expect(row.entity_id).toBeNull();
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.incidentId).toBe("inc-42");
    expect(meta.code).toBe("P0001");
    expect(String(meta.message)).toMatch(/^insufficient_stock:/);
  });

  it("writes a barcode_rejected row when client-side validation blocks the scan", async () => {
    const { logPosEvent } = await import("./pos-audit");
    await logPosEvent({
      action: "barcode_rejected",
      metadata: { code: "!!!", reason: "invalid_chars", incidentId: "inc-9" },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row).toMatchObject({
      action: "barcode_rejected",
      entity: "pos",
      metadata: { reason: "invalid_chars", incidentId: "inc-9" },
    });
  });

  it("never throws even if the audit_logs insert fails (fire-and-forget)", async () => {
    failWrites = true;
    const { logPosEvent } = await import("./pos-audit");
    await expect(logPosEvent({ action: "sale_success", entityId: "s", metadata: {} })).resolves.toBeUndefined();
  });
});
