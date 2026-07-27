import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { logPosEvent } from "@/lib/pos-audit";

/**
 * Open a receipt in a new tab with a retry + fallback.
 *
 * `window.open` returns `null` when a popup blocker, missing user gesture, or
 * a browser extension prevents the new tab. Previously the POS assumed the
 * receipt tab would always open; the cashier silently lost the printout.
 *
 * Retry policy:
 *   1. First attempt: `window.open(url, "_blank")`.
 *   2. If it returns null, wait 150ms (some blockers hold the first pop and
 *      allow the second) and retry once.
 *   3. If it still fails, run a fallback: show an actionable toast with an
 *      "Open" action that navigates the current tab instead, and log a
 *      `receipt_print_failed` audit entry so the sale can be reconciled.
 *
 * Returns `true` when a window was successfully opened (either attempt).
 */
export async function openReceiptWithRetry(url: string, saleId: string): Promise<boolean> {
  const tryOpen = (): Window | null => {
    try {
      return window.open(url, "_blank");
    } catch {
      return null;
    }
  };

  let win = tryOpen();
  if (!win) {
    await new Promise((r) => setTimeout(r, 150));
    win = tryOpen();
  }

  if (win) {
    void logPosEvent({
      action: "receipt_print_ok",
      entityId: saleId,
      metadata: { url, attempts: win === null ? 2 : 1 },
    });
    return true;
  }

  void logPosEvent({
    action: "receipt_print_failed",
    entityId: saleId,
    metadata: { url, reason: "window_open_blocked" },
  });

  toast.error(t.receiptPrintFailed, {
    description: t.receiptPrintFailedDesc,
    duration: 15_000,
    action: {
      label: t.receiptPrintOpenHere,
      onClick: () => {
        window.location.href = url;
      },
    },
  });
  return false;
}
