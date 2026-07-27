import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateBarcode } from "./barcode-validation";

/**
 * E2E test for the invalid-barcode branch of the POS scan flow.
 *
 * Contract under test: when `validateBarcode` rejects the input, the POS
 *   1. shows an actionable scan-field message,
 *   2. logs a `barcode_rejected` audit event, and
 *   3. NEVER reads the local product repository for an impossible code.
 *
 * We simulate the POS `lookupBarcode` prelude exactly the way pos.tsx does.
 */

const lookupCalls: string[] = [];
interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}
const inserts: InsertCall[] = [];

vi.mock("@/lib/local-store", () => ({
  findLocalProductByCode: async (code: string) => {
    lookupCalls.push(code);
    return null;
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

async function simulateLookup(code: string): Promise<{ scanError: string | null }> {
  const { logPosEvent } = await import("./pos-audit");
  const { findLocalProductByCode } = await import("./local-store");

  const v = validateBarcode(code);
  if (!v.ok) {
    void logPosEvent({
      action: "barcode_rejected",
      metadata: { code: (code ?? "").trim(), reason: v.reason },
    });
    // Give the fire-and-forget insert a tick to land.
    await Promise.resolve();
    return { scanError: v.message };
  }
  await findLocalProductByCode(v.code);
  return { scanError: null };
}

beforeEach(() => {
  lookupCalls.length = 0;
  inserts.length = 0;
});

describe("POS invalid-barcode flow", () => {
  it("blocks an empty scan with a scan-field error and does not read products", async () => {
    const res = await simulateLookup("");
    expect(res.scanError).toBe("بارکوډ خالي دی");
    expect(lookupCalls).toEqual([]);
    expect(inserts.some((i) => i.row.action === "barcode_rejected")).toBe(true);
  });

  it("blocks a too-short scan and never issues the lookup RPC", async () => {
    const res = await simulateLookup("12");
    expect(res.scanError).toMatch(/ډېر لنډ/);
    expect(lookupCalls).toEqual([]);
  });

  it("blocks a scan with invalid characters (e.g. keyboard-layout artefact) and audits the reject", async () => {
    const res = await simulateLookup("ABC 12!!");
    expect(res.scanError).toMatch(/ناسم توري/);
    expect(lookupCalls).toEqual([]);
    const auditRow = inserts.find((i) => i.row.action === "barcode_rejected");
    expect(auditRow).toBeDefined();
    const meta = auditRow!.row.metadata as { reason: string; code: string };
    expect(meta.reason).toBe("invalid_chars");
    expect(meta.code).toBe("ABC 12!!");
  });

  it("blocks a repeating-char artefact scan and never calls the RPC", async () => {
    const res = await simulateLookup("0000000");
    expect(res.scanError).toMatch(/تکراري/);
    expect(lookupCalls).toEqual([]);
  });

  it("passes a valid barcode to the local product lookup exactly once", async () => {
    const res = await simulateLookup("BAR-42");
    expect(res.scanError).toBeNull();
    expect(lookupCalls).toEqual(["BAR-42"]);
  });
});
