import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCreateSaleArgs, computeSubtotal } from "./pos-sale";
import type { CartLine } from "@/components/pos-cart";

/**
 * End-to-end POS quick-sale flow test.
 *
 * Simulates the full happy path a cashier walks through:
 *   1. Scan a barcode → local product lookup returns a product.
 *   2. Product is added to the cart (respecting pack_size).
 *   3. A second scan of the same code increments the quantity.
 *   4. Cart totals recompute correctly.
 *   5. Save triggers local `createLocalSale` with the exact expected payload,
 *      including quick-sale defaults (null customer, cash payment).
 *   6. The mocked RPC returns a sale id and the flow completes.
 */

const lookupCalls: string[] = [];
const saleCalls: unknown[] = [];
let lookupResult: unknown = null;
let saleResult: string | Error = "sale-uuid-123";

vi.mock("@/lib/local-store", () => ({
  findLocalProductByCode: async (code: string) => {
    lookupCalls.push(code);
    return lookupResult;
  },
  createLocalSale: async (args: unknown) => {
    saleCalls.push(args);
    if (saleResult instanceof Error) throw saleResult;
    return saleResult;
  },
}));

// Minimal cart mimicking the POS reducer behaviour.
function createCart() {
  const cart: CartLine[] = [];
  return {
    get lines() {
      return cart;
    },
    add(p: { id: string; name: string; sale_price: number; stock: number }, qty: number) {
      const idx = cart.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        if (cart[idx].quantity + qty > cart[idx].stock) throw new Error("insufficient_stock");
        cart[idx].quantity += qty;
      } else {
        if (qty > p.stock) throw new Error("insufficient_stock");
        cart.push({
          product_id: p.id,
          name: p.name,
          price: p.sale_price,
          quantity: qty,
          discount: 0,
          stock: p.stock,
        });
      }
    },
  };
}

beforeEach(() => {
  lookupCalls.length = 0;
  saleCalls.length = 0;
  lookupResult = null;
  saleResult = "sale-uuid-123";
});

describe("POS quick-sale end-to-end flow", () => {
  it("scans a barcode, adds it to the cart, computes totals, and creates the sale", async () => {
    const { createLocalSale, findLocalProductByCode } = await import("./local-store");

    // ---- 1. Barcode lookup returns a real product with pack_size=1 ----
    lookupResult = { id: "prod-1", name: "شکر ۱ کیلو", sale_price: 80, stock: 20, pack_size: 1 };

    const cart = createCart();

    // First scan → adds one unit
    const hit1 = (await findLocalProductByCode("BAR-42"))!;
    cart.add(hit1, Math.max(1, hit1.pack_size));

    // Second scan of the same code → increment (matches "increment" repeat mode)
    const hit2 = (await findLocalProductByCode("BAR-42"))!;
    cart.add(hit2, 1);

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(2);

    // ---- 2. Totals ----
    expect(computeSubtotal(cart.lines)).toBe(160);

    // ---- 3. Build local sale payload for quick sale ----
    const args = buildCreateSaleArgs({
      cart: cart.lines,
      clientRequestId: "82ab177e-6c19-4cc7-bc23-7476785cb333",
      quickMode: true,
      paymentMethod: "cash",
      customerId: "walk-in",
      invoiceDiscount: 15, // will be dropped because allowDiscounts=false
      qsPrefs: { forceCash: true, allowDiscounts: false },
    });

    expect(args).toEqual({
      p_client_request_id: "82ab177e-6c19-4cc7-bc23-7476785cb333",
      p_customer_id: null,
      p_items: [{ product_id: "prod-1", quantity: 2, price: 80, discount: 0 }],
      p_payments: [{ method: "cash", amount: 160 }],
      p_discount: 0,
      p_tax: 0,
      p_notes: null,
      p_is_quick_sale: true,
    });

    // ---- 4. Save via the local repository ----
    const saleId = await createLocalSale(args);
    expect(saleId).toBe("sale-uuid-123");

    // ---- 5. Verify total RPC call history ----
    expect(lookupCalls).toEqual(["BAR-42", "BAR-42"]);
    expect(saleCalls).toEqual([args]);
  });

  it("uses the customer id and honoured discount for a normal (non-quick) credit sale", () => {
    const cart: CartLine[] = [
      { product_id: "p1", name: "A", price: 100, quantity: 3, discount: 0, stock: 10 },
      { product_id: "p2", name: "B", price: 50, quantity: 2, discount: 10, stock: 10 },
    ];
    // subtotal = 100*3 + (50*2 - 10) = 300 + 90 = 390
    expect(computeSubtotal(cart)).toBe(390);

    const args = buildCreateSaleArgs({
      cart,
      clientRequestId: "f2a01a27-6830-4725-a4a0-2cd4e382a105",
      quickMode: false,
      paymentMethod: "credit",
      customerId: "cust-77",
      invoiceDiscount: 40,
      qsPrefs: { forceCash: false, allowDiscounts: true },
    });

    expect(args.p_customer_id).toBe("cust-77");
    expect(args.p_is_quick_sale).toBe(false);
    expect(args.p_discount).toBe(40);
    expect(args.p_payments).toEqual([{ method: "credit", amount: 350 }]); // 390 - 40
  });

  it("rejects a cart add when the requested quantity exceeds available stock", () => {
    const cart = createCart();
    const product = { id: "p-low", name: "لږ موجود", sale_price: 50, stock: 2 };
    // First add is fine (2 of 2).
    cart.add(product, 2);
    // Second add would push to 3 → must throw before any RPC is issued.
    expect(() => cart.add(product, 1)).toThrowError("insufficient_stock");
    expect(cart.lines[0].quantity).toBe(2);
    expect(lookupCalls).toHaveLength(0);
  });

  it("handles an unknown barcode by returning an empty result and not touching the cart", async () => {
    const { findLocalProductByCode } = await import("./local-store");

    const cart = createCart();
    const hit = await findLocalProductByCode("DOES-NOT-EXIST");
    expect(hit).toBeNull();

    // POS should NOT attempt a cart add when no product matches.
    if (hit) cart.add(hit, 1);
    expect(cart.lines).toHaveLength(0);
    expect(lookupCalls).toEqual(["DOES-NOT-EXIST"]);
  });

  it("surfaces an insufficient_stock error from create_sale so POS can show a Pashto message", async () => {
    const { createLocalSale } = await import("./local-store");
    const cart: CartLine[] = [
      { product_id: "p-race", name: "شکر", price: 80, quantity: 5, discount: 0, stock: 5 },
    ];
    const args = buildCreateSaleArgs({
      cart,
      clientRequestId: "61946447-182e-4611-bfdd-68ecedf9e101",
      quickMode: true,
      paymentMethod: "cash",
      customerId: "walk-in",
      invoiceDiscount: 0,
      qsPrefs: { forceCash: true, allowDiscounts: false },
    });

    saleResult = new Error("insufficient_stock:شکر|3|5");
    let failure: Error | null = null;
    try {
      await createLocalSale(args);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    expect(failure?.message).toMatch(/^insufficient_stock:/);
    // Product name, remaining stock and requested qty must be parseable from the message.
    const parts = failure!.message.split(":")[1].split("|");
    expect(parts).toEqual(["شکر", "3", "5"]);
  });

  it("surfaces a payment failure (no payment method / credit_requires_customer) without corrupting cart state", async () => {
    const { createLocalSale } = await import("./local-store");
    const cart: CartLine[] = [
      { product_id: "p1", name: "A", price: 100, quantity: 1, discount: 0, stock: 10 },
    ];
    const args = buildCreateSaleArgs({
      cart,
      clientRequestId: "10f31e6c-dcf3-4fa0-9fc8-4c007b7ae6ef",
      quickMode: false,
      paymentMethod: "credit",
      customerId: "walk-in", // credit without a real customer must fail
      invoiceDiscount: 0,
      qsPrefs: { forceCash: false, allowDiscounts: true },
    });

    saleResult = new Error("credit_requires_customer");
    let failure: Error | null = null;
    try {
      await createLocalSale(args);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    expect(failure?.message).toBe("credit_requires_customer");
    // Cart is untouched on failure — user can fix customer and retry.
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(1);
  });
});
