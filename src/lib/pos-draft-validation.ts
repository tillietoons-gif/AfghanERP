import type { CartLine } from "@/components/pos-cart";
import { getLocalProduct } from "@/lib/local-store";

export type DraftIssue =
  | { kind: "unavailable"; product_id: string; name: string }
  | { kind: "out_of_stock"; product_id: string; name: string; stock: number; requested: number }
  | { kind: "price_changed"; product_id: string; name: string; oldPrice: number; newPrice: number };

export type ValidationResult = {
  issues: DraftIssue[];
  fresh: Map<string, { sale_price: number; stock: number; is_active: boolean; name: string }>;
};

export async function validateDraftCart(cart: CartLine[]): Promise<ValidationResult> {
  const ids = Array.from(new Set(cart.map((l) => l.product_id))).filter(Boolean);
  const fresh = new Map<
    string,
    { sale_price: number; stock: number; is_active: boolean; name: string }
  >();
  if (ids.length === 0) return { issues: [], fresh };

  const products = await Promise.all(ids.map((id) => getLocalProduct(id)));
  for (const p of products) {
    if (!p) continue;
    fresh.set(p.id as string, {
      sale_price: Number(p.sale_price),
      stock: Number(p.stock),
      is_active: Boolean(p.is_active),
      name: String(p.name),
    });
  }

  const issues: DraftIssue[] = [];
  for (const l of cart) {
    const f = fresh.get(l.product_id);
    if (!f || !f.is_active) {
      issues.push({ kind: "unavailable", product_id: l.product_id, name: l.name });
      continue;
    }
    if (f.stock < l.quantity) {
      issues.push({
        kind: "out_of_stock",
        product_id: l.product_id,
        name: f.name,
        stock: f.stock,
        requested: l.quantity,
      });
    }
    if (Math.abs(f.sale_price - l.price) > 0.009) {
      issues.push({
        kind: "price_changed",
        product_id: l.product_id,
        name: f.name,
        oldPrice: l.price,
        newPrice: f.sale_price,
      });
    }
  }
  return { issues, fresh };
}
