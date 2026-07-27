import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { jalaliDateTime, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import {
  countLocalStockMovements,
  listLocalProductsFull,
  listLocalStockMovementsFiltered,
} from "@/lib/local-store";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/stock-movements")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "inventory_officer"]}>
      <StockMovementsPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("د سټاک حرکتونه"),
});

const TYPE_OPTIONS = [
  "purchase",
  "sale",
  "adjustment",
  "adjustment_in",
  "adjustment_out",
  "return_in",
  "return_out",
] as const;
type MoveType = (typeof TYPE_OPTIONS)[number];

const typeLabel: Record<string, string> = {
  purchase: "پېرود",
  sale: "پلور",
  adjustment: "سمون",
  adjustment_in: "د سټاک زياتول",
  adjustment_out: "د سټاک کمول",
  return_in: "راستنېدل",
  return_out: "بېرته ورکړه",
};

type Row = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  created_at: string;
  products: { name?: string; unit?: string; stock?: number } | null;
};

function StockMovementsPage() {
  const [productId, setProductId] = useState<string>("");
  const [type, setType] = useState<MoveType | "">("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  useEffect(() => {
    setPage(0);
  }, [productId, type, from, to]);

  const { data: products } = useQuery({
    queryKey: ["products-filter-select"],
    queryFn: () => listLocalProductsFull("", 500),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["stock-movements", productId, type, from, to, page],
    queryFn: async () => {
      const fromIdx = page * PAGE_SIZE;
      const filters = {
        productId: productId || undefined,
        movementType: type || undefined,
        from,
        to,
      };
      const [rows, count] = await Promise.all([
        listLocalStockMovementsFiltered(filters, PAGE_SIZE, fromIdx),
        countLocalStockMovements(filters),
      ]);
      return { rows: rows as Row[], count };
    },
  });
  const rows = data?.rows;
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const hasFilters = !!(productId || type || from || to);

  const filenameSuffix = useMemo(() => {
    const parts = [];
    if (from) parts.push(from);
    if (to) parts.push(to);
    return parts.join("_") || "all";
  }, [from, to]);

  const doExport = () => {
    if (!rows || rows.length === 0) return;
    exportCsv<Row>(
      `stock-movements-${filenameSuffix}`,
      [
        { key: "created_at", header: "نېټه", value: (r) => new Date(r.created_at).toISOString() },
        { key: "product", header: "محصول", value: (r) => r.products?.name ?? "" },
        {
          key: "movement_type",
          header: "ډول",
          value: (r) => typeLabel[r.movement_type] ?? r.movement_type,
        },
        { key: "quantity", header: "شمېر" },
        { key: "reason", header: "دلیل" },
      ],
      rows,
    );
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">د سټاک حرکتونه</h1>
        <Button
          variant="outline"
          onClick={doExport}
          disabled={!rows || rows.length === 0}
          data-shortcut="export"
        >
          <Download className="ml-1 h-4 w-4" />
          {t.export} CSV
        </Button>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <Label>محصول</Label>
            <Select
              value={productId || "all"}
              onValueChange={(v) => setProductId(v === "all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول</SelectItem>
                {products?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>ډول</Label>
            <Select
              value={type || "all"}
              onValueChange={(v) => setType(v === "all" ? "" : (v as MoveType))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول</SelectItem>
                {TYPE_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {typeLabel[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>له نېټې</Label>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>تر نېټې</Label>
            <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              disabled={!hasFilters}
              onClick={() => {
                setProductId("");
                setType("");
                setFrom("");
                setTo("");
              }}
            >
              <X className="ml-1 h-4 w-4" />
              فلټرونه پاک کړئ
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{t.date}</TableHead>
              <TableHead className="text-right">محصول</TableHead>
              <TableHead className="text-right">ډول</TableHead>
              <TableHead className="text-right">شمېر</TableHead>
              <TableHead className="text-right">دلیل</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  {t.loading}
                </TableCell>
              </TableRow>
            )}
            {rows?.map((r) => {
              const qty = Number(r.quantity);
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell className="text-xs">{jalaliDateTime(r.created_at)}</TableCell>
                  <TableCell>{r.products?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {typeLabel[r.movement_type] ?? r.movement_type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={
                      qty < 0 ? "font-semibold text-destructive" : "font-semibold text-emerald-600"
                    }
                  >
                    {qty > 0 ? "+" : ""}
                    {num(qty)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.reason ?? "—"}</TableCell>
                </TableRow>
              );
            })}
            {!isLoading && (!rows || rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t.noData}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t p-2 text-xs">
          <div className="text-muted-foreground">
            ټول: {num(totalCount)} — مخ {num(page + 1)} / {num(totalPages)}
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
        </div>
      </Card>

      <MovementDetailsSheet row={selected} onClose={() => setSelected(null)} from={from} to={to} />
    </div>
  );
}

function MovementDetailsSheet({
  row,
  onClose,
  from,
  to,
}: {
  row: Row | null;
  onClose: () => void;
  from: string;
  to: string;
}) {
  const { data: history } = useQuery({
    queryKey: ["movement-history", row?.product_id, from, to],
    enabled: !!row?.product_id,
    queryFn: () => listLocalStockMovementsFiltered({ productId: row!.product_id, from, to }, 500),
  });

  // Compute the "after" anchor for the newest movement in the filtered range.
  // If a "to" filter excludes recent movements, subtract everything that happened after.
  const { data: postMovements } = useQuery({
    queryKey: ["movement-post", row?.product_id, to],
    enabled: !!row?.product_id && !!to,
    queryFn: async () => {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      return listLocalStockMovementsFiltered(
        { productId: row!.product_id, from: end.toISOString() },
        500,
      );
    },
  });

  const currentStock = Number(row?.products?.stock ?? 0);
  const anchor = useMemo(() => {
    const postDelta = (postMovements ?? []).reduce((s, m) => s + Number(m.quantity), 0);
    return currentStock - postDelta;
  }, [currentStock, postMovements]);

  const walked = useMemo(() => {
    if (!history)
      return [] as {
        id: string;
        movement_type: string;
        quantity: number;
        reason: string | null;
        created_at: string;
        before: number;
        after: number;
      }[];
    let running = anchor;
    return history.map((m) => {
      const after = running;
      const before = after - Number(m.quantity);
      running = before;
      return { ...m, before, after };
    });
  }, [history, anchor]);

  const selectedWalked = walked.find((w) => w.id === row?.id);

  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader>
          <SheetTitle>د حرکت تفصیل</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-base font-bold">{row.products?.name ?? "—"}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-muted-foreground">نېټه</div>
                <div>{jalaliDateTime(row.created_at)}</div>
                <div className="text-muted-foreground">ډول</div>
                <div>
                  <Badge variant="secondary">
                    {typeLabel[row.movement_type] ?? row.movement_type}
                  </Badge>
                </div>
                <div className="text-muted-foreground">شمېر</div>
                <div
                  className={
                    Number(row.quantity) < 0
                      ? "font-bold text-destructive"
                      : "font-bold text-emerald-600"
                  }
                >
                  {Number(row.quantity) > 0 ? "+" : ""}
                  {num(row.quantity)} {row.products?.unit ?? ""}
                </div>
                <div className="text-muted-foreground">دلیل</div>
                <div>{row.reason ?? "—"}</div>
                <div className="text-muted-foreground">اوسنی سټاک</div>
                <div className="font-semibold">
                  {num(currentStock)} {row.products?.unit ?? ""}
                </div>
              </div>
              {selectedWalked && (
                <div className="mt-3 flex items-center justify-between rounded-md bg-muted p-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">مخکې</div>
                    <div className="text-base font-bold">{num(selectedWalked.before)}</div>
                  </div>
                  <div className="text-2xl text-muted-foreground">←</div>
                  <div>
                    <div className="text-muted-foreground">وروسته</div>
                    <div className="text-base font-bold">{num(selectedWalked.after)}</div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">
                  د دې محصول حرکتونه{(from || to) && " (د غوره شوي مودې پر بنسټ)"}
                </span>
                {walked.length > 0 && (
                  <span className="text-muted-foreground">
                    خالص بدلون:{" "}
                    <span
                      className={
                        walked.reduce((s, m) => s + Number(m.quantity), 0) < 0
                          ? "font-bold text-destructive"
                          : "font-bold text-emerald-600"
                      }
                    >
                      {(() => {
                        const net = walked.reduce((s, m) => s + Number(m.quantity), 0);
                        return `${net > 0 ? "+" : ""}${num(net)}`;
                      })()}
                    </span>
                  </span>
                )}
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">نېټه</TableHead>
                      <TableHead className="text-right text-xs">ډول</TableHead>
                      <TableHead className="text-right text-xs">مخکې</TableHead>
                      <TableHead className="text-right text-xs">بدلون</TableHead>
                      <TableHead className="text-right text-xs">وروسته</TableHead>
                      <TableHead className="text-right text-xs">یاداښت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {walked.map((m) => {
                      const isSel = m.id === row.id;
                      const qty = Number(m.quantity);
                      return (
                        <TableRow key={m.id} className={isSel ? "bg-primary/10" : ""}>
                          <TableCell className="text-[10px]">
                            {jalaliDateTime(m.created_at)}
                          </TableCell>
                          <TableCell className="text-[11px]">
                            {typeLabel[m.movement_type] ?? m.movement_type}
                          </TableCell>
                          <TableCell className="text-xs">{num(m.before)}</TableCell>
                          <TableCell
                            className={
                              qty < 0
                                ? "text-xs font-semibold text-destructive"
                                : "text-xs font-semibold text-emerald-600"
                            }
                          >
                            {qty > 0 ? "+" : ""}
                            {num(qty)}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{num(m.after)}</TableCell>
                          <TableCell
                            className="max-w-[140px] truncate text-[10px] text-muted-foreground"
                            title={m.reason ?? ""}
                          >
                            {m.reason ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {walked.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground text-xs"
                        >
                          {t.noData}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                مخکې/وروسته له اوسني سټاک ({num(currentStock)}) څخه شاته حساب شوي دي.
              </p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
