import { t } from "@/lib/i18n";
import { num } from "@/lib/format";
import { mapApiErrorToForm, type FormErrorMapping } from "@/lib/error-handler";

/**
 * Logical form fields the POS surface renders errors for. Anything not in this
 * list falls through to the form-level banner (unmapped) so the user still
 * gets an incident id + copy/retry affordance.
 */
export const SALE_FIELD_KEYS = ["cart", "customer", "payment", "amountPaid", "scan"] as const;
export type SaleFieldKey = (typeof SALE_FIELD_KEYS)[number];

/**
 * Pre-classify RPC / business errors from `create_sale` and `find_product_by_code`
 * into logical form fields. Returns a partial shape that gets merged onto the
 * original error before being handed to mapApiErrorToForm.
 */
export function classifySaleError(err: unknown): {
  fieldErrors?: Partial<Record<SaleFieldKey, string>>;
  message?: string;
} {
  const msg = (err as { message?: string } | null)?.message ?? "";
  if (msg.startsWith("insufficient_stock:")) {
    const rest = msg.slice("insufficient_stock:".length);
    const [name, available] = rest.split("|");
    return {
      fieldErrors: {
        cart: `${t.insufficientStock}: ${name ?? ""} (${t.stock}: ${num(Number(available) || 0)})`,
      },
    };
  }
  if (msg.startsWith("product_not_found")) return { fieldErrors: { cart: "توکی ونه موندل شو" } };
  if (msg.startsWith("invalid_quantity"))
    return { fieldErrors: { cart: "د توکي شمېر باید له صفر څخه زیات وي" } };
  if (msg === "empty_cart") return { fieldErrors: { cart: t.emptyCartError } };
  if (msg === "no_payment") return { fieldErrors: { amountPaid: t.insufficientPayment } };
  if (msg === "credit_requires_customer")
    return { fieldErrors: { customer: t.creditRequiresCustomer } };
  if (msg === "credit_not_allowed_in_quick_sale")
    return { fieldErrors: { payment: t.creditNotAllowedQuick } };
  return {};
}

/**
 * Compose classifySaleError + mapApiErrorToForm so the caller gets normalized
 * field errors, a form-level fallback message, and — crucially — the shared
 * normalized error carrying an incident id for the banner's copy/retry UI.
 */
export function applyPosSaleError(err: unknown, context: string): FormErrorMapping {
  const classified = classifySaleError(err);
  const base =
    err && typeof err === "object" ? { ...(err as object) } : { message: String(err ?? "") };
  if (classified.fieldErrors)
    (base as { fieldErrors?: unknown }).fieldErrors = classified.fieldErrors;
  if (classified.message) (base as { message?: string }).message = classified.message;
  return mapApiErrorToForm(base, {
    context,
    allowedFields: SALE_FIELD_KEYS,
  });
}
