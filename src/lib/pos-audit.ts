import { getLocalSession } from "./local-auth";
import { getLocalSqlite } from "./local-sqlite";

/**
 * Fire-and-forget audit trail for POS-side events that are NOT already
 * covered by the `create_sale` RPC's own INSERT into `audit_logs`.
 *
 * The `create_sale` RPC logs on SUCCESS (server-side, transactionally). This
 * helper covers:
 *   - client-side FAILURES that never reached the RPC (validation, network)
 *   - RPC failures (so we can trace payment / stock issues by incident id)
 *   - printer delivery outcomes (success/fallback), which happen entirely on
 *     the client after the sale is already committed
 *
 * The `audit_logs` INSERT policy is `is_staff(auth.uid())` so any signed-in
 * staff user can write. We swallow errors — logging must never break the POS.
 */

export type PosAuditAction =
  | "quick_sale_success"
  | "quick_sale_failed"
  | "sale_success"
  | "sale_failed"
  | "receipt_print_ok"
  | "receipt_print_failed"
  | "barcode_rejected";

export interface PosAuditPayload {
  action: PosAuditAction;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logPosEvent({ action, entityId, metadata }: PosAuditPayload): Promise<void> {
  try {
    const database = await getLocalSqlite();
    await database.execute(
      "INSERT INTO audit_logs(id, user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        getLocalSession()?.user.id ?? null,
        action,
        "pos",
        entityId ?? null,
        JSON.stringify(metadata ?? {}),
      ],
    );
  } catch (err) {
    // Never let audit logging break the POS. Surface to the console so we can
    // investigate misconfigured RLS grants during development.

    console.warn("[pos-audit] failed to log", action, err);
  }
}
