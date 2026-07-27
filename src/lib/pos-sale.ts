import type { CartLine } from "@/components/pos-cart";

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_money" | "credit";

export interface BuildSaleInput {
  cart: CartLine[];
  clientRequestId: string;
  quickMode: boolean;
  paymentMethod: PaymentMethod;
  customerId: string; // "walk-in" or an id
  invoiceDiscount: number;
  qsPrefs: { forceCash: boolean; allowDiscounts: boolean };
}

export interface CreateSaleArgs {
  p_client_request_id: string;
  p_customer_id: string | null;
  p_items: Array<{ product_id: string; quantity: number; price: number; discount: number }>;
  p_payments: Array<{ method: PaymentMethod; amount: number }>;
  p_discount: number;
  p_tax: number;
  p_notes: string | null;
  p_is_quick_sale: boolean;
}

export function computeSubtotal(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + l.price * l.quantity - l.discount, 0);
}

/** Pure builder for the create_sale RPC payload; used by POS and covered by tests. */
export function buildCreateSaleArgs(input: BuildSaleInput): CreateSaleArgs {
  const { cart, clientRequestId, quickMode, paymentMethod, customerId, invoiceDiscount, qsPrefs } =
    input;
  const subtotal = computeSubtotal(cart);
  const effMethod: PaymentMethod = quickMode && qsPrefs.forceCash ? "cash" : paymentMethod;
  const effDiscount = quickMode && !qsPrefs.allowDiscounts ? 0 : invoiceDiscount;
  const effTotal = subtotal - effDiscount;
  return {
    p_client_request_id: clientRequestId,
    p_customer_id: quickMode ? null : customerId === "walk-in" ? null : customerId,
    p_items: cart.map((l) => ({
      product_id: l.product_id,
      quantity: l.quantity,
      price: l.price,
      discount: l.discount,
    })),
    p_payments: [{ method: effMethod, amount: effTotal }],
    p_discount: effDiscount,
    p_tax: 0,
    p_notes: null,
    p_is_quick_sale: quickMode,
  };
}
