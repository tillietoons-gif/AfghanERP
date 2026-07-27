import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Download, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { money, num, jalaliDate } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { useMemo, useState } from "react";
import {
  listLocalCustomersFull,
  listLocalProductsFull,
  listLocalSuppliers,
} from "@/lib/local-store";

export const Route = createFileRoute("/alerts")({
  component: () => (
    <ProtectedRoute>
      <AlertsPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("خبرتیاوې"),
});

type LowStockRow = {
  id: string;
  name: string;
  barcode: string | null;
  stock: number;
  min_stock: number;
  unit: string | null;
};

type ExpiringRow = {
  id: string;
  name: string;
  barcode: string | null;
  stock: number;
  expiry_date: string;
  purchase_cost: number | null;
};

type BalanceRow = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  created_at: string | null;
};

function AlertsPage() {
  const { data: lowStock } = useQuery({
    queryKey: ["alerts-low-stock"],
    queryFn: async (): Promise<LowStockRow[]> =>
      (await listLocalProductsFull("", 500))
        .filter((product) => product.stock <= product.min_stock)
        .map((product) => ({
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          stock: product.stock,
          min_stock: product.min_stock,
          unit: product.unit,
        })),
  });

  const { data: expiring } = useQuery({
    queryKey: ["alerts-expiring"],
    queryFn: async (): Promise<ExpiringRow[]> => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 30);
      return (await listLocalProductsFull("", 500))
        .filter(
          (product) =>
            product.expiry_date && product.expiry_date <= cutoff.toISOString().slice(0, 10),
        )
        .map((product) => ({
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          stock: product.stock,
          expiry_date: product.expiry_date!,
          purchase_cost: product.purchase_cost,
        }));
    },
  });

  const { data: payables } = useQuery({
    queryKey: ["alerts-payables-all"],
    queryFn: async (): Promise<BalanceRow[]> => listLocalSuppliers("", 1000),
  });

  const { data: receivables } = useQuery({
    queryKey: ["alerts-receivables-all"],
    queryFn: async (): Promise<BalanceRow[]> => listLocalCustomersFull("", 1000),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold">خبرتیاوې</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {t.lowStock} ({num(lowStock?.length ?? 0)})
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={!lowStock || lowStock.length === 0}
            onClick={() =>
              exportCsv<LowStockRow>(
                "low-stock",
                [
                  { key: "name", header: "نوم" },
                  { key: "barcode", header: "بارکوډ" },
                  { key: "stock", header: "اوسنی سټاک" },
                  { key: "min_stock", header: "لږترلږه" },
                  { key: "unit", header: "واحد" },
                ],
                lowStock ?? [],
              )
            }
          >
            <Download className="ml-1 h-4 w-4" />
            {t.export} CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{t.name}</TableHead>
                <TableHead className="text-right">{t.barcode}</TableHead>
                <TableHead className="text-right">{t.stock}</TableHead>
                <TableHead className="text-right">{t.minStock}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStock?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell dir="ltr" className="text-right font-mono text-xs">
                    {p.barcode ?? "—"}
                  </TableCell>
                  <TableCell className="font-semibold text-destructive">
                    {num(p.stock)} {p.unit}
                  </TableCell>
                  <TableCell>{num(p.min_stock)}</TableCell>
                </TableRow>
              ))}
              {(!lowStock || lowStock.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t.noData}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {t.expiring} — راتلونکو ۳۰ ورځو کې ({num(expiring?.length ?? 0)})
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={!expiring || expiring.length === 0}
            onClick={() =>
              exportCsv<ExpiringRow>(
                "expiring",
                [
                  { key: "name", header: "نوم" },
                  { key: "barcode", header: "بارکوډ" },
                  { key: "stock", header: "سټاک" },
                  { key: "expiry_date", header: "د ختمېدو نېټه" },
                  { key: "purchase_cost", header: "لګښت" },
                ],
                expiring ?? [],
              )
            }
          >
            <Download className="ml-1 h-4 w-4" />
            {t.export} CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{t.name}</TableHead>
                <TableHead className="text-right">{t.barcode}</TableHead>
                <TableHead className="text-right">{t.stock}</TableHead>
                <TableHead className="text-right">{t.expiryDate}</TableHead>
                <TableHead className="text-right">ارزښت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expiring?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell dir="ltr" className="text-right font-mono text-xs">
                    {p.barcode ?? "—"}
                  </TableCell>
                  <TableCell>{num(p.stock)}</TableCell>
                  <TableCell className="font-semibold text-amber-600">
                    {jalaliDate(p.expiry_date)}
                  </TableCell>
                  <TableCell>{money(Number(p.stock) * Number(p.purchase_cost ?? 0))}</TableCell>
                </TableRow>
              ))}
              {(!expiring || expiring.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t.noData}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <BalanceCard
        title="د عرضه کوونکو پورونه (Payables)"
        rows={payables ?? []}
        filename="supplier-payables"
      />
      <BalanceCard
        title="د پیرودونکو تحصیلات (Receivables)"
        rows={receivables ?? []}
        filename="customer-receivables"
      />
    </div>
  );
}

type StatusFilter = "outstanding" | "settled" | "credit" | "all";

function BalanceCard({
  title,
  rows,
  filename,
}: {
  title: string;
  rows: BalanceRow[];
  filename: string;
}) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("outstanding");
  const [currency, setCurrency] = useState<"AFN" | "USD">("AFN");
  const [rate, setRate] = useState<number>(70); // AFN per 1 USD, editable

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const bal = Number(r.balance ?? 0);
      if (status === "outstanding" && !(bal > 0)) return false;
      if (status === "settled" && !(bal === 0)) return false;
      if (status === "credit" && !(bal < 0)) return false;
      if (from && r.created_at && r.created_at < from) return false;
      if (to && r.created_at && r.created_at > `${to}T23:59:59`) return false;
      return true;
    });
  }, [rows, status, from, to]);

  const totalAfn = filtered.reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const fmtDisplay = (afn: number) =>
    currency === "AFN" ? money(afn) : `$ ${(afn / (rate || 1)).toFixed(2)}`;

  const clear = () => {
    setFrom("");
    setTo("");
    setStatus("outstanding");
    setCurrency("AFN");
  };

  const doExport = () => {
    const cols =
      currency === "AFN"
        ? [
            { key: "name" as const, header: "نوم" },
            { key: "phone" as const, header: "ټیلیفون" },
            { key: "balance" as const, header: "بیلانس (AFN)" },
            { key: "created_at" as const, header: "نېټه" },
          ]
        : [
            { key: "name" as const, header: "نوم" },
            { key: "phone" as const, header: "ټیلیفون" },
            { key: "balance_usd" as const, header: `بیلانس (USD @ ${rate})` },
            { key: "created_at" as const, header: "نېټه" },
          ];
    const data = filtered.map((r) => ({
      ...r,
      balance_usd: (Number(r.balance ?? 0) / (rate || 1)).toFixed(2),
    }));
    exportCsv(`${filename}-${status}-${currency}`, cols as never, data as never);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {title} ({num(filtered.length)}) —{" "}
          <span className="text-primary">{fmtDisplay(totalAfn)}</span>
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={filtered.length === 0}
          onClick={doExport}
          data-shortcut="export"
        >
          <Download className="ml-1 h-4 w-4" />
          {t.export} CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">له نېټې</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">تر نېټې</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">حالت</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outstanding">پاتې (Outstanding)</SelectItem>
                <SelectItem value="settled">تسویه شوی</SelectItem>
                <SelectItem value="credit">پیش‌کړه (Credit)</SelectItem>
                <SelectItem value="all">ټول</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">اسعار</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as "AFN" | "USD")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AFN">AFN ؋</SelectItem>
                <SelectItem value="USD">USD $</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {currency === "USD" && (
            <div className="space-y-1">
              <Label className="text-xs">نرخ (AFN/USD)</Label>
              <Input
                type="number"
                min={1}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 1)}
              />
            </div>
          )}
          <div className="col-span-2 flex items-center gap-2 md:col-span-5">
            <Button size="sm" variant="ghost" onClick={clear}>
              <X className="ml-1 h-4 w-4" />
              فلټرونه پاک کړئ
            </Button>
            {(from || to || status !== "outstanding") && (
              <Badge variant="secondary" className="text-[10px]">
                فعال فلټر: {status}
                {from && ` • ${from}`}
                {to && ` → ${to}`}
              </Badge>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{t.name}</TableHead>
              <TableHead className="text-right">{t.phone}</TableHead>
              <TableHead className="text-right">نېټه</TableHead>
              <TableHead className="text-right">{t.balance}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell dir="ltr" className="text-right font-mono text-xs">
                  {r.phone ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.created_at ? jalaliDate(r.created_at) : "—"}
                </TableCell>
                <TableCell
                  className={`font-semibold ${Number(r.balance) < 0 ? "text-emerald-600" : ""}`}
                >
                  {fmtDisplay(Number(r.balance ?? 0))}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {t.noData}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
