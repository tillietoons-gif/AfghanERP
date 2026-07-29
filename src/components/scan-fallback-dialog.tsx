import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useExternalBarcodeScanner } from "@/lib/external-barcode-scanner";
import { t } from "@/lib/i18n";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { createLocalBarcode, listLocalProductsFull } from "@/lib/local-store";

interface Props {
  open: boolean;
  code: string;
  onClose: () => void;
  /** After a mapping is created & confirmed, called with the picked product to add it into the current cart/grid. */
  onMapped?: (product: {
    id: string;
    name: string;
    sale_price: number;
    purchase_cost: number;
    stock: number;
    pack_size: number;
  }) => void;
}

type ProductLite = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sale_price: number;
  purchase_cost: number;
  stock: number;
};
type Step = "pick" | "review" | "done";

/** Heuristic: infer pack_size from a label like "carton", "6 pack", "کارتن", "شپږ ټوټې". */
function inferPack(label: string): number {
  const l = label.toLowerCase();
  const m = l.match(/(\d+)/);
  if (m) return Math.max(1, Number(m[1]));
  if (/carton|کارتن|box|بکس/.test(l)) return 12;
  if (/dozen|درجن/.test(l)) return 12;
  if (/pair|جوړه/.test(l)) return 2;
  return 1;
}

export function ScanFallbackDialog({ open, code, onClose, onMapped }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("pick");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductLite | null>(null);
  const [packSize, setPackSize] = useState(1);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [packTouched, setPackTouched] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["scan-fallback-products", search],
    enabled: open,
    queryFn: (): Promise<ProductLite[]> => listLocalProductsFull(search, 20),
  });

  useExternalBarcodeScanner({
    enabled: open && step === "pick",
    onScan: (nextCode) => setSearch(nextCode),
  });

  const reset = () => {
    setStep("pick");
    setSearch("");
    setSelected(null);
    setPackSize(1);
    setLabel("");
    setPackTouched(false);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const goReview = () => {
    if (!selected) {
      toast.error("محصول وټاکئ");
      return;
    }
    setStep("review");
  };

  const onLabelChange = (v: string) => {
    setLabel(v);
    if (!packTouched) {
      const inferred = inferPack(v);
      if (inferred > 1) setPackSize(inferred);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await createLocalBarcode({
        product_id: selected.id,
        barcode: code,
        pack_size: Math.max(1, packSize),
        label: label.trim() || null,
      });
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "دا بارکوډ مخکې ثبت شوی");
      return;
    }
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["product-barcodes"] });
    setStep("done");
  };

  const finish = () => {
    if (selected) onMapped?.({ ...selected, pack_size: Math.max(1, packSize) });
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            د بارکوډ لپاره محصول ټاکل
            <Badge variant="secondary" className="text-[10px]">
              {step === "pick" ? "۱ / ۳" : step === "review" ? "۲ / ۳" : "۳ / ۳"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded border bg-muted p-2 text-sm">
            بارکوډ:{" "}
            <span dir="ltr" className="font-mono">
              {code}
            </span>
          </div>

          {step === "pick" && (
            <>
              <div className="text-xs text-muted-foreground">
                دا کوډ د هیڅ محصول سره نه دی تړل شوی — یو محصول وټاکئ.
              </div>
              <Input
                placeholder="د محصول نوم/SKU/بارکوډ لټول..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-52 overflow-auto rounded border">
                {(products ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p)}
                    className={`block w-full px-2 py-1.5 text-right text-xs hover:bg-muted ${selected?.id === p.id ? "bg-muted font-semibold" : ""}`}
                  >
                    <div>{p.name}</div>
                    <div dir="ltr" className="text-[10px] text-muted-foreground">
                      {p.sku ?? "—"} · سټاک {p.stock}
                    </div>
                  </button>
                ))}
                {(products ?? []).length === 0 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">{t.noData}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>د بستې اندازه</Label>
                  <Input
                    type="number"
                    min={1}
                    dir="ltr"
                    value={packSize}
                    onChange={(e) => {
                      setPackTouched(true);
                      setPackSize(Number(e.target.value) || 1);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>لیبل (اختیاري)</Label>
                  <Input
                    value={label}
                    onChange={(e) => onLabelChange(e.target.value)}
                    placeholder="کارتن، شپږ ټوټې..."
                  />
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                نکته: کله چې لیبل ولیکئ، د بستې اندازه به په اتومات ډول اټکل شي (تاسو یې بدلولی شئ).
              </div>
            </>
          )}

          {step === "review" && selected && (
            <div className="space-y-2">
              <div className="rounded border bg-muted/40 p-3 text-sm">
                <div className="mb-2 font-semibold">د تایید لپاره وګورئ:</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-muted-foreground">محصول</div>
                  <div className="col-span-2 font-semibold">{selected.name}</div>
                  <div className="text-muted-foreground">SKU</div>
                  <div className="col-span-2" dir="ltr">
                    {selected.sku ?? "—"}
                  </div>
                  <div className="text-muted-foreground">بارکوډ</div>
                  <div className="col-span-2 font-mono" dir="ltr">
                    {code}
                  </div>
                  <div className="text-muted-foreground">د بستې اندازه</div>
                  <div className="col-span-2 font-semibold" dir="ltr">
                    ×{packSize}
                  </div>
                  <div className="text-muted-foreground">لیبل</div>
                  <div className="col-span-2">{label.trim() || "—"}</div>
                  <div className="text-muted-foreground">اوسنی سټاک</div>
                  <div className="col-span-2" dir="ltr">
                    {selected.stock}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                د <b>ثبت او زیاتول</b> په فشارولو سره نقشه به جوړه شي او <b>{packSize}</b> ټوټې د
                محصول به سبد ته زیاتې شي.
              </div>
            </div>
          )}

          {step === "done" && selected && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded border border-green-500 bg-green-500/10 p-3 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-semibold">نقشه جوړه شوه</div>
                  <div className="text-xs text-muted-foreground">
                    <span dir="ltr" className="font-mono">
                      {code}
                    </span>{" "}
                    ← <b>{selected.name}</b> ×{packSize}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                په راتلونکو سکنونو کې به دا بارکوډ په اتومات ډول ومنل شي.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "pick" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                {t.cancel}
              </Button>
              <Button onClick={goReview} disabled={!selected}>
                بیاکتنه <ArrowRight className="mr-1 h-4 w-4" />
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("pick")}>
                شاته
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "..." : "ثبت او زیاتول"}
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={finish}>ښه</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
