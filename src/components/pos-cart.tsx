import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2 } from "lucide-react";
import { money, num } from "@/lib/format";
import { t } from "@/lib/i18n";

export interface CartLine {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  discount: number;
  stock: number;
}

interface Props {
  cart: CartLine[];
  onUpdate: (idx: number, patch: Partial<CartLine>) => void;
  onRemove: (idx: number) => void;
}

/** Scrollable list of cart lines with per-line quantity controls. */
export function PosCart({ cart, onUpdate, onRemove }: Props) {
  if (cart.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t.emptyCart}</p>;
  }
  return (
    <>
      {cart.map((l, idx) => (
        <div
          key={l.product_id}
          data-cart-line
          data-cart-index={idx}
          tabIndex={0}
          aria-label={`${l.name} — ${l.quantity}`}
          className="rounded-md border bg-muted/30 p-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{l.name}</div>
              <div className="text-xs text-muted-foreground">{money(l.price)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                پاتې ذخیره: <span className="font-medium text-foreground">{num(Math.max(0, l.stock - l.quantity), 0)}</span>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => onRemove(idx)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                onClick={() => onUpdate(idx, { quantity: Math.max(1, l.quantity - 1) })}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Input
                className="h-8 w-16 text-center"
                value={l.quantity}
                onChange={(e) =>
                  onUpdate(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                }
                dir="ltr"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => onUpdate(idx, { quantity: l.quantity + 1 })}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="text-sm font-bold">{money(l.price * l.quantity - l.discount)}</div>
          </div>
        </div>
      ))}
    </>
  );
}
