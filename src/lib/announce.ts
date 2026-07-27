/**
 * Global aria-live announcer for POS form validation.
 *
 * A single polite live region is mounted lazily on <body>. Sale, refund,
 * and purchase-return submits all funnel their first-error message through
 * `announceError(msg)` so screen readers hear the same wording regardless
 * of whether the failure occurred on the POS page or inside a dialog.
 */
const nodes: Record<"polite" | "assertive", HTMLDivElement | null> = {
  polite: null,
  assertive: null,
};

function ensureNode(politeness: "polite" | "assertive"): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  const existing = nodes[politeness];
  if (existing && document.body.contains(existing)) return existing;
  const el = document.createElement("div");
  el.id = `pos-live-announcer-${politeness}`;
  el.setAttribute("role", politeness === "assertive" ? "alert" : "status");
  el.setAttribute("aria-live", politeness);
  el.setAttribute("aria-atomic", "true");
  el.className = "sr-only";
  el.style.cssText =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
  document.body.appendChild(el);
  nodes[politeness] = el;
  return el;
}

/** Announce a message to assistive technology. Defaults to polite. */
export function announce(message: string, politeness: "polite" | "assertive" = "polite"): void {
  const el = ensureNode(politeness);
  if (!el || !message) return;
  el.textContent = "";
  window.setTimeout(() => {
    if (el) el.textContent = message;
  }, 30);
}

/** Announce a validation error message (assertive). */
export function announceError(message: string): void {
  announce(message, "assertive");
}
