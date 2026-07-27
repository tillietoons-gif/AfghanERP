import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/lovable-error-reporting", () => ({ reportLovableError: vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  t: {
    insufficientStock: "STOCK_LOW",
    stock: "STOCK",
    insufficientPayment: "PAY_LOW",
    creditRequiresCustomer: "CREDIT_NEEDS_CUSTOMER",
    emptyCartError: "CART_EMPTY",
    creditNotAllowedQuick: "NO_CREDIT_QUICK",
  },
}));
vi.mock("@/lib/format", () => ({ num: (v: number) => String(v) }));

import { classifySaleError, applyPosSaleError, SALE_FIELD_KEYS } from "./pos-errors";
import { SaleFieldError } from "@/components/sale-field-error";

describe("classifySaleError", () => {
  it("routes insufficient_stock to the cart field with product + qty", () => {
    const r = classifySaleError({ message: "insufficient_stock:Rice|3" });
    expect(r.fieldErrors?.cart).toBe("STOCK_LOW: Rice (STOCK: 3)");
  });

  it("routes product_not_found and invalid_quantity to cart", () => {
    expect(classifySaleError({ message: "product_not_found" }).fieldErrors?.cart).toBeTruthy();
    expect(classifySaleError({ message: "invalid_quantity" }).fieldErrors?.cart).toBeTruthy();
  });

  it("routes empty_cart to cart", () => {
    expect(classifySaleError({ message: "empty_cart" }).fieldErrors?.cart).toBe("CART_EMPTY");
  });

  it("routes no_payment to amountPaid", () => {
    expect(classifySaleError({ message: "no_payment" }).fieldErrors?.amountPaid).toBe("PAY_LOW");
  });

  it("routes credit_requires_customer to customer", () => {
    expect(classifySaleError({ message: "credit_requires_customer" }).fieldErrors?.customer).toBe(
      "CREDIT_NEEDS_CUSTOMER",
    );
  });

  it("routes credit_not_allowed_in_quick_sale to payment", () => {
    expect(
      classifySaleError({ message: "credit_not_allowed_in_quick_sale" }).fieldErrors?.payment,
    ).toBe("NO_CREDIT_QUICK");
  });

  it("returns empty for unknown errors", () => {
    expect(classifySaleError({ message: "boom" })).toEqual({});
    expect(classifySaleError(null)).toEqual({});
  });
});

describe("applyPosSaleError", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps known RPC errors to the correct POS field and produces an incident id", () => {
    const mapped = applyPosSaleError({ message: "insufficient_stock:Oil|2" }, "پلور");
    expect(mapped.fields.cart).toContain("STOCK_LOW");
    expect(mapped.normalized.incidentId).toMatch(/^ERR-/);
    expect(mapped.formMessage).toBeUndefined();
  });

  it("routes scan errors carrying a scan fieldError to the scan field", () => {
    const mapped = applyPosSaleError(
      { message: "db down", fieldErrors: { scan: "scanner failed" } },
      "سکین",
    );
    expect(mapped.fields.scan).toBe("scanner failed");
  });

  it("falls back to formMessage + incident id for unmapped errors", () => {
    const mapped = applyPosSaleError({ message: "totally unknown" }, "پلور");
    expect(Object.keys(mapped.fields)).toHaveLength(0);
    expect(mapped.formMessage).toBe("totally unknown");
    expect(mapped.normalized.incidentId).toMatch(/^ERR-/);
  });

  it("keeps only whitelisted POS fields", () => {
    // random api field name that is not in SALE_FIELD_KEYS must not become a field error
    const mapped = applyPosSaleError(
      { message: "bad", fieldErrors: { random_key: "nope" } },
      "پلور",
    );
    expect(mapped.fields.random_key).toBeUndefined();
    for (const key of Object.keys(mapped.fields)) {
      expect(SALE_FIELD_KEYS).toContain(key as (typeof SALE_FIELD_KEYS)[number]);
    }
  });
});

describe("SaleFieldError inline rendering", () => {
  it("renders nothing when message is empty", () => {
    expect(renderToStaticMarkup(<SaleFieldError field="cart" message={undefined} />)).toBe("");
  });

  it("renders an alert with the message under the field", () => {
    const html = renderToStaticMarkup(<SaleFieldError field="cart" message="STOCK_LOW: Rice" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="sale-error-cart"');
    expect(html).toContain("STOCK_LOW: Rice");
    expect(html).toContain("text-destructive");
  });

  it("renders per-field test ids so each control can host its own error", () => {
    for (const field of ["cart", "customer", "payment", "amountPaid", "scan"] as const) {
      const html = renderToStaticMarkup(<SaleFieldError field={field} message="x" />);
      expect(html).toContain(`data-testid="sale-error-${field}"`);
    }
  });
});
