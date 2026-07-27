import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ScanLine, Download, Upload } from "lucide-react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { BarcodeImportDialog } from "@/components/barcode-import-dialog";
import { exportCsv } from "@/lib/csv";
import { t } from "@/lib/i18n";
import { num } from "@/lib/format";
import { toast } from "sonner";
import {
  createLocalBarcode,
  deleteLocalBarcode,
  listLocalBarcodes,
  listLocalProductsFull,
  updateLocalBarcode,
} from "@/lib/local-store";

export const Route = createFileRoute("/barcodes")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "inventory_officer"]}>
      <BarcodesPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("بارکوډونه"),
});

type Row = {
  id: string;
  barcode: string;
  label: string | null;
  pack_size: number;
  product_id: string;
  products: { id: string; name: string; sku: string | null; barcode: string | null } | null;
};

type ProductLite = { id: string; name: string; sku: string | null; barcode: string | null };

function BarcodesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<{
    product_id: string;
    barcode: string;
    label: string;
    pack_size: number;
  }>({
    product_id: "",
    barcode: "",
    label: "",
    pack_size: 1,
  });
  const [prodQuery, setProdQuery] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: aliases, isLoading } = useQuery({
    queryKey: ["product-barcodes", search],
    queryFn: () => listLocalBarcodes(search),
  });

  const { data: products } = useQuery({
    queryKey: ["barcode-products", prodQuery],
    queryFn: () => listLocalProductsFull(prodQuery, 20),
  });

  const filtered = useMemo(() => aliases ?? [], [aliases]);
  const selectedProduct = products?.find((p) => p.id === form.product_id) ?? null;

  const reset = () => {
    setForm({ product_id: "", barcode: "", label: "", pack_size: 1 });
    setProdQuery("");
    setFormErrors({});
  };

  const save = async () => {
    // Client-side validation surfaces the same way as server-side field errors.
    const clientErrors: Record<string, string> = {};
    if (!form.product_id) clientErrors.product_id = "محصول وټاکئ";
    const code = form.barcode.trim();
    if (!code) clientErrors.barcode = "بارکوډ لیکئ";
    if (Object.keys(clientErrors).length) {
      setFormErrors(clientErrors);
      return;
    }
    setFormErrors({});

    try {
      await createLocalBarcode({
        product_id: form.product_id,
        barcode: code,
        label: form.label.trim() || null,
        pack_size: Math.max(1, Number(form.pack_size) || 1),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        setFormErrors({ barcode: "دا بارکوډ مخکې ثبت شوی" });
      } else {
        toast.error(error instanceof Error ? error.message : "د بارکوډ ثبت ناکام شو");
      }
      return;
    }
    toast.success("بارکوډ ثبت شو");
    setOpen(false);
    reset();
    qc.invalidateQueries({ queryKey: ["product-barcodes"] });
  };

  const del = async (id: string) => {
    if (!confirm("ډاډه یاست؟")) return;
    try {
      await deleteLocalBarcode(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ړنګول ناکام شو");
      return;
    }
    toast.success("ړنګ شو");
    qc.invalidateQueries({ queryKey: ["product-barcodes"] });
  };

  const updatePack = async (id: string, pack_size: number) => {
    try {
      await updateLocalBarcode(id, { pack_size: Math.max(1, pack_size) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تازه کول ناکام شو");
      return;
    }
    qc.invalidateQueries({ queryKey: ["product-barcodes"] });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">د بارکوډ نقشه</h1>
          <p className="text-xs text-muted-foreground">
            هر محصول ته څو بارکوډونه یا د بستې مختلف اندازې وټاکئ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const rows = (aliases ?? []).map((r) => ({
                product_name: r.products?.name ?? "",
                product_sku: r.products?.sku ?? "",
                product_barcode: r.products?.barcode ?? "",
                alias_barcode: r.barcode,
                pack_size: r.pack_size,
                label: r.label ?? "",
              }));
              if (rows.length === 0) {
                toast.info(t.noData);
                return;
              }
              exportCsv(
                "barcode-mappings",
                [
                  { key: "product_name", header: "محصول" },
                  { key: "product_sku", header: "SKU" },
                  { key: "product_barcode", header: "اصلي بارکوډ" },
                  { key: "alias_barcode", header: "اضافي بارکوډ" },
                  { key: "pack_size", header: "د بستې اندازه" },
                  { key: "label", header: "لیبل" },
                ],
                rows,
              );
            }}
          >
            <Download className="ml-1 h-4 w-4" />
            CSV صادرول
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="ml-1 h-4 w-4" />
            CSV واردول
          </Button>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) reset();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="ml-1 h-4 w-4" />
                نوی بارکوډ
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-lg">
              <DialogHeader>
                <DialogTitle>د بارکوډ اضافه کول</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>محصول</Label>
                  <Input
                    placeholder="د لټون لپاره ولیکئ..."
                    value={prodQuery}
                    onChange={(e) => setProdQuery(e.target.value)}
                  />
                  <div className="mt-1 max-h-40 overflow-auto rounded border">
                    {(products ?? []).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, product_id: p.id }));
                          setProdQuery(p.name);
                        }}
                        className={`block w-full px-2 py-1.5 text-right text-xs hover:bg-muted ${form.product_id === p.id ? "bg-muted font-semibold" : ""}`}
                      >
                        <div>{p.name}</div>
                        <div className="text-[10px] text-muted-foreground" dir="ltr">
                          {p.sku ?? "—"} · {p.barcode ?? "—"}
                        </div>
                      </button>
                    ))}
                    {(products ?? []).length === 0 && (
                      <div className="p-2 text-center text-xs text-muted-foreground">
                        {t.noData}
                      </div>
                    )}
                  </div>
                  {selectedProduct && (
                    <div className="mt-1 rounded bg-muted p-1.5 text-xs">
                      ټاکل شوی: <span className="font-semibold">{selectedProduct.name}</span>
                    </div>
                  )}
                  {formErrors.product_id && (
                    <p className="text-xs text-destructive">{formErrors.product_id}</p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>بارکوډ</Label>
                    <div className="flex gap-1">
                      <Input
                        dir="ltr"
                        value={form.barcode}
                        aria-invalid={!!formErrors.barcode}
                        onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setScanOpen(true)}
                      >
                        <ScanLine className="h-4 w-4" />
                      </Button>
                    </div>
                    {formErrors.barcode && (
                      <p className="text-xs text-destructive">{formErrors.barcode}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>د بستې اندازه</Label>
                    <Input
                      type="number"
                      min={1}
                      dir="ltr"
                      value={form.pack_size}
                      aria-invalid={!!formErrors.pack_size}
                      onChange={(e) => setForm({ ...form, pack_size: Number(e.target.value) || 1 })}
                    />
                    {formErrors.pack_size && (
                      <p className="text-xs text-destructive">{formErrors.pack_size}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>لیبل (اختیاري)</Label>
                  <Input
                    value={form.label}
                    aria-invalid={!!formErrors.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="لکه: کارتن، شپږ ټوټې..."
                  />
                  {formErrors.label && (
                    <p className="text-xs text-destructive">{formErrors.label}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t.cancel}
                </Button>
                <Button onClick={save}>{t.save}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>لیست ({num(filtered.length, 0)})</span>
            <Input
              placeholder="لټون د بارکوډ/لیبل..."
              className="h-8 w-64"
              dir="ltr"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">محصول</TableHead>
                <TableHead className="text-right">بارکوډ</TableHead>
                <TableHead className="text-right">لیبل</TableHead>
                <TableHead className="text-right">د بستې اندازه</TableHead>
                <TableHead className="text-right">اصلي بارکوډ/SKU</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    {t.loading}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t.noData}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.products?.name ?? "—"}</TableCell>
                  <TableCell dir="ltr" className="font-mono text-right">
                    {r.barcode}
                  </TableCell>
                  <TableCell>{r.label ?? "—"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      dir="ltr"
                      className="h-8 w-20"
                      defaultValue={r.pack_size}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 1;
                        if (v !== r.pack_size) void updatePack(r.id, v);
                      }}
                    />
                  </TableCell>
                  <TableCell dir="ltr" className="text-right text-xs text-muted-foreground">
                    {r.products?.barcode ?? "—"} · {r.products?.sku ?? "—"}
                  </TableCell>
                  <TableCell className="text-left">
                    <Button size="icon" variant="ghost" onClick={() => void del(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(code) => {
          setForm((f) => ({ ...f, barcode: code }));
          setScanOpen(false);
          return true;
        }}
      />

      <BarcodeImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => qc.invalidateQueries({ queryKey: ["product-barcodes"] })}
      />

      <Card>
        <CardContent className="p-3 text-xs text-muted-foreground">
          نکته: کله چې د پلور یا پېرود پر مهال بارکوډ سکن شي، سیسټم لومړی د اصلي بارکوډ/SKU لټون
          کوي، بیا دلته ثبت شوي اضافي بارکوډونه — او د <b>بستې اندازه</b> پر بنسټ به شمېر په اتومات
          ډول د سبد لپاره ضرب شي.
        </CardContent>
      </Card>
    </div>
  );
}
