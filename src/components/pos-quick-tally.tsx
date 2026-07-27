import { money } from "@/lib/format";
import { t } from "@/lib/i18n";

export interface QuickTallyProduct {
  id: string;
  name: string;
  sale_price: number;
  stock: number;
}

interface Props {
  products: QuickTallyProduct[];
  onPick: (p: QuickTallyProduct) => void;
}

/** Grid of top-selling products for quick-sale tap-to-add. */
export function PosQuickTally({ products, onPick }: Props) {
  if (!products || products.length === 0) return null;
  return (
    <div className="rounded-lg border bg-muted/20 p-2">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">
        {t.topSelling} — {t.tapToAdd}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            disabled={Number(p.stock) <= 0}
            className="flex flex-col items-start rounded-md border bg-primary/10 p-2 text-right text-sm font-semibold hover:bg-primary/20 disabled:opacity-40"
          >
            <span className="line-clamp-2 min-h-[2.5rem]">{p.name}</span>
            <span className="mt-1 text-primary">{money(p.sale_price)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
