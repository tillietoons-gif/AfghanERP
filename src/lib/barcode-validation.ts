/**
 * Client-side barcode format validation used by the POS quick-sale flow.
 *
 * The `find_product_by_code` RPC accepts anything, but we want to reject
 * obvious garbage BEFORE hitting the network so cashiers get an immediate
 * actionable message (and we don't spam audit logs with impossible codes).
 *
 * Rules:
 *  - Trim + non-empty.
 *  - Length 4..48 (covers EAN-8/EAN-13/UPC/Code128/QR short codes; anything
 *    longer is almost certainly a scanner mis-read of a URL/serial).
 *  - Whitelist: digits, letters, `-`, `_`, `.` and `/`. This intentionally
 *    excludes whitespace, quotes, `%`, `\`, and control chars — those are
 *    the signatures of a mis-configured scanner keyboard layout.
 *  - Reject a code that is a single repeating character (e.g. "0000000") —
 *    typically a scanner buffer-flush artefact rather than a real barcode.
 */

export type BarcodeValidation =
  | { ok: true; code: string }
  | {
      ok: false;
      reason: "empty" | "too_short" | "too_long" | "invalid_chars" | "repeating";
      message: string;
    };

const MIN_LEN = 4;
const MAX_LEN = 48;
const ALLOWED = /^[A-Za-z0-9._\-/]+$/;

export function validateBarcode(raw: string): BarcodeValidation {
  const code = (raw ?? "").trim();
  if (!code) {
    return { ok: false, reason: "empty", message: "بارکوډ خالي دی" };
  }
  if (code.length < MIN_LEN) {
    return {
      ok: false,
      reason: "too_short",
      message: `بارکوډ ډېر لنډ دی (لږ تر لږه ${MIN_LEN} توري)`,
    };
  }
  if (code.length > MAX_LEN) {
    return {
      ok: false,
      reason: "too_long",
      message: `بارکوډ ډېر اوږد دی (ډېر تر ډېره ${MAX_LEN} توري) — سکینر بیا تنظیم کړئ`,
    };
  }
  if (!ALLOWED.test(code)) {
    return {
      ok: false,
      reason: "invalid_chars",
      message: "په بارکوډ کې ناسم توري شته — د سکینر کیبورډ خاکه وګورئ",
    };
  }
  if (/^(.)\1+$/.test(code)) {
    return { ok: false, reason: "repeating", message: "بارکوډ اعتبار نلري (تکراري توري)" };
  }
  return { ok: true, code };
}
