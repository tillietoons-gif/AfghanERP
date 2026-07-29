import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, Sliders, Download, Printer } from "lucide-react";
import { t } from "@/lib/i18n";
import { money, num } from "@/lib/format";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DataTableShell, DetailDrawer } from "@/components/data-table-shell";
import { PageHeader } from "@/components/page-header";
import { useExternalBarcodeScanner } from "@/lib/external-barcode-scanner";
import {
  adjustLocalProductStock,
  countLocalProducts,
  createLocalProduct,
  deactivateLocalProducts,
  updateLocalProduct,
  deleteLocalProduct,
  listLocalCategories,
  listLocalProductMovements,
  listLocalProductsFull,
} from "@/lib/local-store";

export const Route = createFileRoute("/products")({
  component: () => (
    <ProtectedRoute>
      <ProductsPage />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent("محصولات"),
});

interface ProductForm {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  purchase_cost: number;
  sale_price: number;
  stock: number;
  min_stock: number;
  category_id: string | null;
}

const empty: ProductForm = {
  name: "",
  sku: "",
  barcode: "",
  unit: "piece",
  purchase_cost: 0,
  sale_price: 0,
  stock: 0,
  min_stock: 5,
  category_id: null,
};

type Row = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  purchase_cost: number | string;
  sale_price: number | string;
  stock: number | string;
  min_stock: number | string;
  category_id: string | null;
  is_active?: number;
  categories?: { name: string } | null;
};

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "low" | "ok">("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(empty);
  const [adjust, setAdjust] = useState<{
    id: string;
    name: string;
    stock: number;
    delta: number;
    reason: string;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspect, setInspect] = useState<Row | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [debounced, status, categoryId]);

  useExternalBarcodeScanner({
    enabled: open,
    allowEditableTargets: true,
    onScan: (code) => {
      setForm((current) => ({ ...current, barcode: code }));
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["products", debounced, page, categoryId],
    queryFn: async () => {
      const fromIdx = page * PAGE_SIZE;
      const selectedCategoryId = categoryId === "all" ? undefined : categoryId;
      const [rows, count] = await Promise.all([
        listLocalProductsFull(debounced, PAGE_SIZE, fromIdx, selectedCategoryId),
        countLocalProducts(debounced, selectedCategoryId),
      ]);
      return { rows, count };
    },
  });
  const productsAll = data?.rows;
  const products = useMemo(() => {
    if (!productsAll) return productsAll;
    if (status === "all") return productsAll;
    return productsAll.filter((p) =>
      status === "low"
        ? Number(p.stock) <= Number(p.min_stock)
        : Number(p.stock) > Number(p.min_stock),
    );
  }, [productsAll, status]);
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: listLocalCategories,
  });

  const onSave = async () => {
    if (form.id) {
      const { stock: _omit, ...updatable } = form;
      void _omit;
      await updateLocalProduct(form.id, { ...updatable, category_id: form.category_id || null });
    } else {
      await createLocalProduct({
        ...form,
        opening_quantity: form.stock,
        category_id: form.category_id || null,
        pack_size: 1,
      });
    }
    toast.success(form.id ? "سم شو" : "زیات شو");
    setOpen(false);
    setForm(empty);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const onDelete = async (id: string) => {
    if (!confirm(t.areYouSure)) return;
    await deleteLocalProduct(id);
    toast.success("ړنګ شو");
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const onAdjust = async () => {
    if (!adjust) return;
    const delta = Number(adjust.delta) || 0;
    if (delta === 0) {
      toast.error("د تعدیل مقدار باید صفر نه وي");
      return;
    }
    try {
      await adjustLocalProductStock(adjust.id, delta, adjust.reason);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "insufficient_stock"
          ? "سټاک منفی نه شي"
          : "توکی ونه موندل شو",
      );
      return;
    }
    toast.success("سټاک تعدیل شو");
    setAdjust(null);
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const toggleAll = (checked: boolean) => {
    if (!products) return;
    setSelected(checked ? new Set(products.map((p) => p.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const exportRows = (rows: Row[]) => {
    const header = [
      "name",
      "sku",
      "barcode",
      "unit",
      "purchase_cost",
      "sale_price",
      "stock",
      "min_stock",
      "category",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.name,
          r.sku ?? "",
          r.barcode ?? "",
          r.unit,
          r.purchase_cost,
          r.sale_price,
          r.stock,
          r.min_stock,
          r.categories?.name ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onBulkDeactivate = async () => {
    if (selected.size === 0) return;
    if (!confirm(t.areYouSure)) return;
    const ids = Array.from(selected);
    await deactivateLocalProducts(ids);
    toast.success(`${num(ids.length)} غیرفعاله شول`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const selectedRows = useMemo(
    () => (products ?? []).filter((p) => selected.has(p.id)),
    [products, selected],
  );

  const isEmpty = !isLoading && (!products || products.length === 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title={t.products} subtitle="د محصولاتو مدیریت، د سټاک تعدیل او د بارکوډ لټون" />

      <DataTableShell
        loading={isLoading}
        isEmpty={isEmpty}
        empty={t.noData}
        selectionCount={selected.size}
        toolbar={
          <>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.search}
                className="pe-8"
              />
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t.category} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټولې کټګورۍ</SelectItem>
                {cats?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول حالتونه</SelectItem>
                <SelectItem value="low">{t.lowStock}</SelectItem>
                <SelectItem value="ok">ښه</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportRows(products ?? [])}
              data-shortcut="export"
            >
              <Download className="me-1 h-4 w-4" />
              {t.export ?? "صادرول"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setForm(empty);
                setOpen(true);
              }}
            >
              <Plus className="me-1 h-4 w-4" />
              {t.add}
            </Button>
          </>
        }
        bulk={
          <>
            <Button size="sm" variant="outline" onClick={() => exportRows(selectedRows)}>
              <Download className="me-1 h-4 w-4" />
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="me-1 h-4 w-4" />
              چاپ
            </Button>
            <Button size="sm" variant="destructive" onClick={onBulkDeactivate}>
              <Trash2 className="me-1 h-4 w-4" />
              غیرفعالول
            </Button>
          </>
        }
        footer={
          <>
            <div>
              {t.total}: {num(totalCount)} — مخ {num(page + 1)} / {num(totalPages)}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                مخکینی
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                راتلونکی
              </Button>
            </div>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={products && products.length > 0 && selected.size === products.length}
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                  aria-label="ټول ټاکل"
                />
              </TableHead>
              <TableHead className="text-right">{t.name}</TableHead>
              <TableHead className="text-right">{t.barcode}</TableHead>
              <TableHead className="text-right">{t.price}</TableHead>
              <TableHead className="text-right">{t.stock}</TableHead>
              <TableHead className="text-right">{t.status}</TableHead>
              <TableHead className="text-right">{t.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products?.map((p) => (
              <TableRow
                key={p.id}
                data-state={selected.has(p.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,input,[role=checkbox]")) return;
                  setInspect(p);
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(v) => toggleOne(p.id, Boolean(v))}
                    aria-label={p.name}
                  />
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell dir="ltr" className="text-right font-mono text-xs">
                  {p.barcode || "—"}
                </TableCell>
                <TableCell>{money(p.sale_price)}</TableCell>
                <TableCell>
                  {num(p.stock)} {t.units[p.unit as string] ?? p.unit}
                </TableCell>
                <TableCell>
                  {Number(p.stock) <= Number(p.min_stock) ? (
                    <Badge variant="destructive">{t.lowStock}</Badge>
                  ) : (
                    <Badge variant="secondary">ښه</Badge>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="د سټاک تعدیل"
                      onClick={() =>
                        setAdjust({
                          id: p.id,
                          name: p.name,
                          stock: Number(p.stock),
                          delta: 0,
                          reason: "",
                        })
                      }
                    >
                      <Sliders className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          id: p.id,
                          name: p.name,
                          sku: p.sku ?? "",
                          barcode: p.barcode ?? "",
                          unit: p.unit,
                          purchase_cost: Number(p.purchase_cost),
                          sale_price: Number(p.sale_price),
                          stock: Number(p.stock),
                          min_stock: Number(p.min_stock),
                          category_id: p.category_id,
                        });
                        setOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>

      {/* Detail drawer */}
      <DetailDrawer
        open={!!inspect}
        onClose={() => setInspect(null)}
        title={inspect?.name ?? ""}
        subtitle={inspect?.categories?.name ?? undefined}
        actions={
          inspect && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({
                  id: inspect.id,
                  name: inspect.name,
                  sku: inspect.sku ?? "",
                  barcode: inspect.barcode ?? "",
                  unit: inspect.unit,
                  purchase_cost: Number(inspect.purchase_cost),
                  sale_price: Number(inspect.sale_price),
                  stock: Number(inspect.stock),
                  min_stock: Number(inspect.min_stock),
                  category_id: inspect.category_id,
                });
                setInspect(null);
                setOpen(true);
              }}
            >
              <Edit className="me-1 h-4 w-4" />
              {t.edit}
            </Button>
          )
        }
      >
        {inspect && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Meta label={t.price} value={money(inspect.sale_price)} />
              <Meta label={t.cost} value={money(inspect.purchase_cost)} />
              <Meta
                label={t.stock}
                value={`${num(inspect.stock)} ${t.units[inspect.unit as string] ?? inspect.unit}`}
              />
              <Meta label={t.minStock} value={num(inspect.min_stock)} />
              <Meta
                label={t.sku}
                value={
                  <span dir="ltr" className="font-mono">
                    {inspect.sku || "—"}
                  </span>
                }
              />
              <Meta
                label={t.barcode}
                value={
                  <span dir="ltr" className="font-mono">
                    {inspect.barcode || "—"}
                  </span>
                }
              />
            </div>
            <div>
              {Number(inspect.stock) <= Number(inspect.min_stock) ? (
                <Badge variant="destructive">{t.lowStock}</Badge>
              ) : (
                <Badge variant="secondary">ښه</Badge>
              )}
            </div>
            <RecentMovements productId={inspect.id} />
          </div>
        )}
      </DetailDrawer>

      {/* Add/Edit dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setForm(empty);
        }}
      >
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? t.edit : t.add} — {t.products}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={t.name}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={t.category}>
              <Select
                value={form.category_id ?? ""}
                onValueChange={(v) => setForm({ ...form, category_id: v || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {cats?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t.barcode}>
              <Input
                dir="ltr"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </Field>
            <Field label={t.sku}>
              <Input
                dir="ltr"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </Field>
            <Field label={t.unit}>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(t.units).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t.cost}>
              <Input
                dir="ltr"
                type="number"
                value={form.purchase_cost}
                onChange={(e) => setForm({ ...form, purchase_cost: Number(e.target.value) })}
              />
            </Field>
            <Field label={t.price}>
              <Input
                dir="ltr"
                type="number"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
              />
            </Field>
            {!form.id && (
              <Field label="د پرانستلو مقدار">
                <Input
                  dir="ltr"
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label={t.minStock}>
              <Input
                dir="ltr"
                type="number"
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
            <Button onClick={onSave}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!adjust}
        onOpenChange={(v) => {
          if (!v) setAdjust(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>د سټاک تعدیل — {adjust?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              اوسنی سټاک:{" "}
              <span className="font-semibold" dir="ltr">
                {num(adjust?.stock ?? 0)}
              </span>
            </div>
            <Field label="مقدار (+ زیاتول / − کمول)">
              <Input
                dir="ltr"
                type="number"
                value={adjust?.delta ?? 0}
                onChange={(e) =>
                  setAdjust((a) => (a ? { ...a, delta: Number(e.target.value) } : a))
                }
              />
            </Field>
            <Field label="لامل">
              <Input
                value={adjust?.reason ?? ""}
                placeholder="لکه: تلف شوی، دقیق شمېرل، بېرته راستنېدنه..."
                onChange={(e) => setAdjust((a) => (a ? { ...a, reason: e.target.value } : a))}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              دا تعدیل به د سټاک په حرکتونو کې ثبت شي او د پلټنې لپاره به وساتل شي.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjust(null)}>
              {t.cancel}
            </Button>
            <Button onClick={onAdjust}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border-hair bg-surface-1/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function RecentMovements({ productId }: { productId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["product-movements", productId],
    queryFn: () => listLocalProductMovements(productId),
  });
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        وروستي حرکتونه
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">{t.loading}</div>}
      {!isLoading && (!data || data.length === 0) && (
        <div className="text-xs text-muted-foreground">{t.noData}</div>
      )}
      <ul className="space-y-1">
        {data?.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded border border-border-hair bg-surface-1/40 px-2 py-1 text-xs"
          >
            <span dir="ltr" className="font-mono">
              {new Date(m.created_at as string).toISOString().slice(0, 16).replace("T", " ")}
            </span>
            <span
              className={Number(m.quantity) < 0 ? "text-destructive" : "text-emerald-600"}
              dir="ltr"
            >
              {Number(m.quantity) > 0 ? "+" : ""}
              {num(m.quantity)}
            </span>
            <span className="truncate text-muted-foreground">{m.reason || "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
