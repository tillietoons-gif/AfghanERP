import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  POS_DIALOG_CONTENT,
  POS_DIALOG_HEADER,
  POS_DIALOG_BODY,
  POS_DIALOG_FOOTER,
} from "@/lib/dialog-classes";
import { usePosDialog } from "@/lib/pos-dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Download, Printer, ScanLine, Eye, Search } from "lucide-react";
import { ReceiptPreviewDialog } from "@/components/receipt-preview-dialog";
import { t } from "@/lib/i18n";
import { money, jalaliDateTime, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ScanHistoryPanel } from "@/components/scan-history-panel";
import { ScanFallbackDialog } from "@/components/scan-fallback-dialog";
import { recordScan } from "@/lib/scan-session";
import { getScannerPrefs } from "@/lib/scanner-prefs";
import { useExternalBarcodeScanner } from "@/lib/external-barcode-scanner";
import { DataTableShell, DetailDrawer } from "@/components/data-table-shell";
import { PageHeader } from "@/components/page-header";
import {
  createLocalPurchase,
  findLocalProductByCode,
  getLocalPurchaseItems,
  listLocalProductsFull,
  listLocalPurchases,
  listLocalSuppliers,
} from "@/lib/local-store";

export const Route = createFileRoute("/purchases")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "inventory_officer"]}>
      <PurchasesPage />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent("پیرودل"),
});

type Item = { product_id: string; name: string; quantity: number; cost: number };

type PurchaseRow = {
  id: string;
  invoice_no: string;
  supplier_invoice_no: string | null;
  purchase_date: string;
  total: number;
  paid: number;
  notes?: string | null;
  suppliers: { name?: string } | null;
  purchase_items: { quantity: number; cost?: number; products?: { name?: string } | null }[] | null;
};

function paymentStatus(row: { total: number; paid: number }): "paid" | "partial" | "unpaid" {
  const total = Number(row.total) || 0;
  const paid = Number(row.paid) || 0;
  if (paid <= 0) return "unpaid";
  if (paid + 0.001 < total) return "partial";
  return "paid";
}

function PurchasesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  // list filters
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "partial" | "unpaid">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspect, setInspect] = useState<PurchaseRow | null>(null);
  const [invalidField, setInvalidField] = useState<
    { kind: "cart" } | { kind: "row"; index: number; field: "quantity" | "cost" } | null
  >(null);
  const { contentRef, bodyRef, scrollToFirstError } = usePosDialog(open);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    setSelected(new Set());
  }, [debounced, supplierFilter, statusFilter]);

  const { data: purchases, isLoading } = useQuery({
    queryKey: ["purchases-list", debounced, supplierFilter],
    queryFn: async () => {
      const purchases = await listLocalPurchases(debounced, 100);
      const matching =
        supplierFilter === "all"
          ? purchases
          : purchases.filter((purchase) => purchase.supplier_id === supplierFilter);
      return Promise.all(
        matching.map(async (purchase) => ({
          ...purchase,
          suppliers: purchase.supplier_name ? { name: purchase.supplier_name } : null,
          purchase_items: await getLocalPurchaseItems(purchase.id).then((items) =>
            items.map((item) => ({
              quantity: item.quantity,
              cost: item.cost,
              products: { name: item.product_name },
            })),
          ),
        })),
      ) as Promise<PurchaseRow[]>;
    },
  });

  const filteredPurchases = useMemo(() => {
    if (!purchases) return purchases;
    if (statusFilter === "all") return purchases;
    return purchases.filter((p) => paymentStatus(p) === statusFilter);
  }, [purchases, statusFilter]);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-select"],
    queryFn: () => listLocalSuppliers("", 500),
  });

  const { data: products } = useQuery({
    queryKey: ["products-purchase", productSearch],
    queryFn: () => listLocalProductsFull(productSearch, 20),
  });

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.quantity * i.cost, 0), [items]);
  const total = Math.max(0, subtotal - discount);

  const addItem = (p: { id: string; name: string; purchase_cost: number | null }, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing)
        return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + qty } : i));
      return [
        ...prev,
        { product_id: p.id, name: p.name, quantity: qty, cost: Number(p.purchase_cost ?? 0) },
      ];
    });
    setProductSearch("");
    setTimeout(() => productSearchRef.current?.focus(), 50);
  };

  const [fallbackCode, setFallbackCode] = useState<string | null>(null);

  const lookupPurchaseBarcode = async (
    code: string,
    opts?: { keepScannerOpen?: boolean },
  ): Promise<boolean> => {
    const trimmed = code.trim();
    if (!trimmed) return false;
    setProductSearch(trimmed);
    const hit = await findLocalProductByCode(trimmed);
    if (hit) {
      const packQty = Math.max(1, Number(hit.pack_size) || 1);
      const mode = getScannerPrefs().repeatScanMode;
      const already = items.some((i) => i.product_id === hit.id);
      const addQty = mode === "increment" && already ? 1 : packQty;
      addItem(hit, addQty);
      recordScan("purchase", {
        code: trimmed,
        matched: true,
        productName: hit.name,
        quantityAdded: addQty,
      });
      toast.success(`${hit.name}${addQty > 1 ? ` ×${addQty}` : ""} — زیات شو`);
      if (opts?.keepScannerOpen) setProductSearch("");
      return true;
    }
    recordScan("purchase", { code: trimmed, matched: false });
    setFallbackCode(trimmed);
    return false;
  };

  useExternalBarcodeScanner({
    enabled: open && !scannerOpen,
    onScan: (code) => lookupPurchaseBarcode(code),
  });

  const reset = () => {
    setSupplierId("");
    setSupplierInvoiceNo("");
    setItems([]);
    setDiscount(0);
    setPaid(0);
    setNotes("");
    setProductSearch("");
  };

  const save = async () => {
    if (items.length === 0) {
      setInvalidField({ kind: "cart" });
      void scrollToFirstError();
      toast.error("سبد خالي دی");
      return;
    }
    for (let idx = 0; idx < items.length; idx++) {
      const i = items[idx];
      if (i.quantity <= 0) {
        setInvalidField({ kind: "row", index: idx, field: "quantity" });
        void scrollToFirstError();
        toast.error(`${i.name}: ناسم شمېر`);
        return;
      }
      if (i.cost < 0) {
        setInvalidField({ kind: "row", index: idx, field: "cost" });
        void scrollToFirstError();
        toast.error(`${i.name}: ناسم لګښت`);
        return;
      }
    }
    setInvalidField(null);
    const data = await createLocalPurchase({
      supplier_id: supplierId || null,
      supplier_invoice_no: supplierInvoiceNo || null,
      items: items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.cost,
        cost: item.cost,
        discount: 0,
      })),
      payments: paid > 0 ? [{ method: "cash", amount: paid }] : [],
      discount,
      tax: 0,
      notes: notes || null,
    });
    toast.success("پېرود خوندي شو");
    setOpen(false);
    reset();
    qc.invalidateQueries({ queryKey: ["purchases-list"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    if (data) window.open(`/print/purchase/${data}`, "_blank");
  };

  const toggleAll = (checked: boolean) => {
    if (!filteredPurchases) return;
    setSelected(checked ? new Set(filteredPurchases.map((p) => p.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const columns = [
    { key: "invoice_no" as const, header: "د پېرود شمېره" },
    { key: "supplier_invoice_no" as const, header: "د عرضه کوونکي رسید" },
    {
      key: "purchase_date" as const,
      header: "نېټه",
      value: (r: PurchaseRow) => new Date(r.purchase_date).toISOString(),
    },
    {
      key: "supplier" as const,
      header: "عرضه کوونکی",
      value: (r: PurchaseRow) => r.suppliers?.name ?? "",
    },
    {
      key: "items" as const,
      header: "توکي",
      value: (r: PurchaseRow) => (r.purchase_items ?? []).length,
    },
    { key: "paid" as const, header: "ورکړل شوي" },
    { key: "total" as const, header: "ټول" },
  ];

  const doExport = (rows: PurchaseRow[]) => {
    if (!rows || rows.length === 0) return;
    exportCsv<PurchaseRow>("purchases", columns, rows);
  };

  const selectedRows = useMemo(
    () => (filteredPurchases ?? []).filter((p) => selected.has(p.id)),
    [filteredPurchases, selected],
  );

  const isEmpty = !isLoading && (!filteredPurchases || filteredPurchases.length === 0);

  const statusBadge = (row: PurchaseRow) => {
    const s = paymentStatus(row);
    if (s === "paid") return <Badge variant="secondary">تسویه</Badge>;
    if (s === "partial") return <Badge>نیمه</Badge>;
    return <Badge variant="destructive">پور</Badge>;
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title={t.purchases}
        subtitle="د عرضه کوونکو پېرودل، د رسید مدیریت او د سټاک زیاتونه"
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) reset();
              else {
                try {
                  const raw = localStorage.getItem("scanner.prefs.v1");
                  if (raw && JSON.parse(raw)?.autoOpenPurchase) setScannerOpen(true);
                } catch {
                  /* ignore */
                }
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="me-1 h-4 w-4" />
                نوی پېرود
              </Button>
            </DialogTrigger>
            <DialogContent
              ref={contentRef}
              dir="rtl"
              className={POS_DIALOG_CONTENT}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <DialogHeader className={POS_DIALOG_HEADER}>
                <DialogTitle>نوی پېرود</DialogTitle>
              </DialogHeader>
              <div ref={bodyRef} className={POS_DIALOG_BODY}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>عرضه کوونکی</Label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>د عرضه کوونکي د رسید شمېره</Label>
                    <Input
                      dir="ltr"
                      value={supplierInvoiceNo}
                      onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                      placeholder="INV-1234"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>د محصول لټون</Label>
                    <div className="flex gap-2">
                      <Input
                        ref={productSearchRef}
                        className="flex-1"
                        data-autofocus="true"
                        aria-invalid={invalidField?.kind === "cart" || undefined}
                        value={productSearch}
                        onChange={(e) => {
                          if (invalidField?.kind === "cart") setInvalidField(null);
                          setProductSearch(e.target.value);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const code = productSearch.trim();
                            if (code) await lookupPurchaseBarcode(code);
                          }
                        }}
                        placeholder="نوم یا بارکوډ (Enter وټاپئ)"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setScannerOpen(true)}
                        title="بارکوډ سکین کړئ"
                      >
                        <ScanLine className="h-4 w-4" />
                      </Button>
                    </div>
                    {productSearch && products && products.length > 0 && (
                      <div className="max-h-40 overflow-y-auto rounded border bg-popover">
                        {products.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => addItem(p)}
                            className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent"
                          >
                            <span>{p.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {money(p.purchase_cost ?? 0)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <BarcodeScanner
                  open={scannerOpen}
                  continuous
                  onClose={() => {
                    setScannerOpen(false);
                    productSearchRef.current?.focus();
                  }}
                  onDetected={(code) => lookupPurchaseBarcode(code, { keepScannerOpen: true })}
                />
                <ScanFallbackDialog
                  open={!!fallbackCode}
                  code={fallbackCode ?? ""}
                  onClose={() => setFallbackCode(null)}
                  onMapped={(p) => {
                    addItem(
                      { id: p.id, name: p.name, purchase_cost: p.purchase_cost },
                      Math.max(1, p.pack_size),
                    );
                  }}
                />
                <ScanHistoryPanel
                  context="purchase"
                  onRetry={(code) => lookupPurchaseBarcode(code)}
                />

                <Card className="p-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">محصول</TableHead>
                        <TableHead className="text-right w-24">شمېر</TableHead>
                        <TableHead className="text-right w-28">لګښت</TableHead>
                        <TableHead className="text-right">مجموعه</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            توکي زیات کړئ
                          </TableCell>
                        </TableRow>
                      )}
                      {items.map((i, idx) => (
                        <TableRow key={i.product_id}>
                          <TableCell>{i.name}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              dir="ltr"
                              className="h-8"
                              aria-invalid={
                                (invalidField?.kind === "row" &&
                                  invalidField.index === idx &&
                                  invalidField.field === "quantity") ||
                                undefined
                              }
                              value={i.quantity}
                              onChange={(e) => {
                                if (invalidField?.kind === "row") setInvalidField(null);
                                setItems((prev) =>
                                  prev.map((x, j) =>
                                    j === idx ? { ...x, quantity: Number(e.target.value) } : x,
                                  ),
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              dir="ltr"
                              className="h-8"
                              aria-invalid={
                                (invalidField?.kind === "row" &&
                                  invalidField.index === idx &&
                                  invalidField.field === "cost") ||
                                undefined
                              }
                              value={i.cost}
                              onChange={(e) => {
                                if (invalidField?.kind === "row") setInvalidField(null);
                                setItems((prev) =>
                                  prev.map((x, j) =>
                                    j === idx ? { ...x, cost: Number(e.target.value) } : x,
                                  ),
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-semibold">
                            {money(i.quantity * i.cost)}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setItems((prev) => prev.filter((_, j) => j !== idx))}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>{t.discount}</Label>
                    <Input
                      type="number"
                      dir="ltr"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t.paid}</Label>
                    <Input
                      type="number"
                      dir="ltr"
                      value={paid}
                      onChange={(e) => setPaid(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t.total}</Label>
                    <div className="rounded-md border px-3 py-2 font-bold">{money(total)}</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t.notes}</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter className={POS_DIALOG_FOOTER}>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t.cancel}
                </Button>
                <Button onClick={save}>{t.save} او چاپ</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

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
                placeholder="د رسید شمېره..."
                className="pe-8"
              />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="عرضه کوونکی" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول عرضه کوونکي</SelectItem>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول حالتونه</SelectItem>
                <SelectItem value="paid">تسویه</SelectItem>
                <SelectItem value="partial">نیمه</SelectItem>
                <SelectItem value="unpaid">پور</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport(filteredPurchases ?? [])}
            disabled={!filteredPurchases || filteredPurchases.length === 0}
            data-shortcut="export"
          >
            <Download className="me-1 h-4 w-4" />
            {t.export} CSV
          </Button>
        }
        bulk={
          <>
            <Button size="sm" variant="outline" onClick={() => doExport(selectedRows)}>
              <Download className="me-1 h-4 w-4" />
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="me-1 h-4 w-4" />
              چاپ
            </Button>
          </>
        }
        footer={
          <div>
            {t.total}: {num(filteredPurchases?.length ?? 0)}
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    !!filteredPurchases &&
                    filteredPurchases.length > 0 &&
                    selected.size === filteredPurchases.length
                  }
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                  aria-label="ټول ټاکل"
                />
              </TableHead>
              <TableHead className="text-right">{t.invoice}</TableHead>
              <TableHead className="text-right">د عرضه کوونکي رسید</TableHead>
              <TableHead className="text-right">{t.date}</TableHead>
              <TableHead className="text-right">عرضه کوونکی</TableHead>
              <TableHead className="text-right">توکي</TableHead>
              <TableHead className="text-right">{t.paid}</TableHead>
              <TableHead className="text-right">{t.total}</TableHead>
              <TableHead className="text-right">{t.status}</TableHead>
              <TableHead className="text-right">{t.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPurchases?.map((p) => (
              <TableRow
                key={p.id}
                data-state={selected.has(p.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,input,a,[role=checkbox]")) return;
                  setInspect(p);
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(v) => toggleOne(p.id, Boolean(v))}
                    aria-label={p.invoice_no}
                  />
                </TableCell>
                <TableCell dir="ltr" className="font-mono text-xs text-right">
                  {p.invoice_no}
                </TableCell>
                <TableCell dir="ltr" className="font-mono text-xs text-right">
                  {p.supplier_invoice_no ?? "—"}
                </TableCell>
                <TableCell>{jalaliDateTime(p.purchase_date)}</TableCell>
                <TableCell>{p.suppliers?.name ?? "—"}</TableCell>
                <TableCell>{num((p.purchase_items ?? []).length)}</TableCell>
                <TableCell>{money(p.paid)}</TableCell>
                <TableCell className="font-semibold">{money(p.total)}</TableCell>
                <TableCell>{statusBadge(p)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="مخکتنه"
                      onClick={() => setPreviewId(p.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Link to="/print/purchase/$id" params={{ id: p.id }} target="_blank">
                      <Button size="icon" variant="ghost" title="بیا چاپ / PDF">
                        <Printer className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>

      <DetailDrawer
        open={!!inspect}
        onClose={() => setInspect(null)}
        title={
          inspect ? (
            <span dir="ltr" className="font-mono">
              {inspect.invoice_no}
            </span>
          ) : (
            ""
          )
        }
        subtitle={
          inspect
            ? `${inspect.suppliers?.name ?? "—"} · ${jalaliDateTime(inspect.purchase_date)}`
            : undefined
        }
        actions={
          inspect && (
            <>
              <Button size="sm" variant="outline" onClick={() => setPreviewId(inspect.id)}>
                <Eye className="me-1 h-4 w-4" />
                مخکتنه
              </Button>
              <Link to="/print/purchase/$id" params={{ id: inspect.id }} target="_blank">
                <Button size="sm" variant="outline">
                  <Printer className="me-1 h-4 w-4" />
                  چاپ
                </Button>
              </Link>
            </>
          )
        }
      >
        {inspect && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Meta label={t.total} value={money(inspect.total)} />
              <Meta label={t.paid} value={money(inspect.paid)} />
              <Meta
                label="پاتې پور"
                value={money(Math.max(0, Number(inspect.total) - Number(inspect.paid)))}
              />
              <Meta label={t.status} value={statusBadge(inspect)} />
              <Meta
                label="د عرضه کوونکي رسید"
                value={
                  <span dir="ltr" className="font-mono">
                    {inspect.supplier_invoice_no || "—"}
                  </span>
                }
              />
              <Meta label="د توکو شمېر" value={num((inspect.purchase_items ?? []).length)} />
            </div>
            <div className="rounded-md border border-border-hair">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">محصول</TableHead>
                    <TableHead className="text-right w-20">شمېر</TableHead>
                    <TableHead className="text-right w-24">لګښت</TableHead>
                    <TableHead className="text-right">مجموعه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(inspect.purchase_items ?? []).map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>{it.products?.name ?? "—"}</TableCell>
                      <TableCell>{num(it.quantity)}</TableCell>
                      <TableCell>{money(it.cost ?? 0)}</TableCell>
                      <TableCell className="font-semibold">
                        {money((it.cost ?? 0) * it.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!inspect.purchase_items || inspect.purchase_items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        توکي نشته
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {inspect.notes && (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.notes}
                </div>
                <div className="rounded-md border border-border-hair bg-surface-1/60 p-3 whitespace-pre-wrap">
                  {inspect.notes}
                </div>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>

      <ReceiptPreviewDialog
        open={!!previewId}
        onClose={() => setPreviewId(null)}
        url={previewId ? `/print/purchase/${previewId}` : null}
        title="د پېرود رسيد مخکتنه"
      />
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
