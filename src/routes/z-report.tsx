import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money, num, jalaliDateTime, toPashtoDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Printer, RefreshCw, FileDown } from "lucide-react";
import { toast } from "sonner";
import { exportCsv } from "@/lib/csv";
import {
  getLocalStoreSettings,
  listLocalQuickSalesForZReport,
  recordLocalZReportRun,
} from "@/lib/local-store";

export const Route = createFileRoute("/z-report")({
  component: () => (
    <ProtectedRoute>
      <ZReportPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("Z رپوټ"),
});

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface QuickSaleRow {
  id: string;
  invoice_no: string;
  sale_date: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  sale_items: { quantity: number; products: { name?: string } | null }[];
  sale_payments: { method: string; amount: number }[];
}

interface ItemAggRow {
  name: string;
  quantity: number;
  total: number;
}

function ZReportPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toLocalInput(d);
  });
  const [to, setTo] = useState(() => toLocalInput(new Date()));
  const [rows, setRows] = useState<QuickSaleRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState<{
    store_name?: string;
    address?: string;
    phone?: string;
    receipt_footer?: string;
  } | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const settings = await getLocalStoreSettings();
      setStore({
        store_name: settings.store_name,
        address: settings.address ?? undefined,
        phone: settings.phone ?? undefined,
        receipt_footer: settings.receipt_footer ?? undefined,
      });
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();
    try {
      const list = await listLocalQuickSalesForZReport(fromIso, toIso);
      setRows(list);
      const totalSum = list.reduce((sum, row) => sum + row.total, 0);
      await recordLocalZReportRun({
        from: fromIso,
        to: toIso,
        count: list.length,
        total: totalSum,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رپوټ بار نه شو");
    } finally {
      setLoading(false);
    }
  };

  const doExportCsv = () => {
    if (!rows || rows.length === 0) return;
    const flat = rows.map((r) => ({
      invoice_no: r.invoice_no,
      sale_date: jalaliDateTime(r.sale_date),
      subtotal: r.subtotal,
      discount: r.discount,
      total: r.total,
      paid: r.paid,
      items: (r.sale_items || []).reduce((s, i) => s + Number(i.quantity || 0), 0),
      payments: (r.sale_payments || []).map((p) => `${p.method}:${p.amount}`).join("|"),
    }));
    exportCsv(
      "z-report",
      [
        { key: "invoice_no", header: "بیل" },
        { key: "sale_date", header: "نېټه" },
        { key: "subtotal", header: "فرعي" },
        { key: "discount", header: "تخفیف" },
        { key: "total", header: "ټول" },
        { key: "paid", header: "ورکړل شوي" },
        { key: "items", header: "توکي" },
        { key: "payments", header: "تادیه" },
      ],
      flat,
    );
  };

  const summary = useMemo(() => {
    if (!rows) return null;
    let count = 0;
    let subtotal = 0;
    let discount = 0;
    let total = 0;
    let paid = 0;
    let itemQty = 0;
    const payMap = new Map<string, number>();
    const itemMap = new Map<string, ItemAggRow>();
    for (const r of rows) {
      count++;
      subtotal += Number(r.subtotal || 0);
      discount += Number(r.discount || 0);
      total += Number(r.total || 0);
      paid += Number(r.paid || 0);
      for (const p of r.sale_payments || []) {
        payMap.set(p.method, (payMap.get(p.method) ?? 0) + Number(p.amount || 0));
      }
      for (const it of r.sale_items || []) {
        const name = it.products?.name ?? "—";
        itemQty += Number(it.quantity || 0);
        const cur = itemMap.get(name) ?? { name, quantity: 0, total: 0 };
        cur.quantity += Number(it.quantity || 0);
        itemMap.set(name, cur);
      }
    }
    const items = [...itemMap.values()].sort((a, b) => b.quantity - a.quantity);
    return {
      count,
      subtotal,
      discount,
      total,
      paid,
      itemQty,
      payments: [...payMap.entries()],
      items,
    };
  }, [rows]);

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30 p-4 md:p-6 print:bg-white print:p-0">
      <style>{`@media print { @page { size: 80mm auto; margin: 0; } .no-print { display: none !important; } .print-only { display: block !important; } }`}</style>

      <div className="no-print mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">{t.zReport}</h1>
            <p className="text-sm text-muted-foreground">{t.walkInSummary}</p>
          </div>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto_auto_auto]">
            <div className="space-y-1">
              <Label>{t.from}</Label>
              <Input
                type="datetime-local"
                dir="ltr"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t.to}</Label>
              <Input
                type="datetime-local"
                dir="ltr"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={load} disabled={loading} className="w-full">
                <RefreshCw className="ml-1 h-4 w-4" />
                {loading ? t.loading : t.generate}
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                variant="secondary"
                disabled={!rows || rows.length === 0}
                onClick={() => window.print()}
                className="w-full"
              >
                <Printer className="ml-1 h-4 w-4" />
                {t.print}
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                disabled={!rows || rows.length === 0}
                onClick={doExportCsv}
                className="w-full"
              >
                <FileDown className="ml-1 h-4 w-4" />
                {t.exportCsv}
              </Button>
            </div>
          </CardContent>
        </Card>

        {summary && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t.quickSalesCount} value={num(summary.count, 0)} />
            <StatCard label={t.itemsSold} value={num(summary.itemQty, 0)} />
            <StatCard label={t.total} value={money(summary.total)} accent />
            <StatCard label={t.paid} value={money(summary.paid)} />
          </div>
        )}

        {summary && summary.payments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t.paymentMethod}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 p-4 pt-0 sm:grid-cols-2 md:grid-cols-3">
              {summary.payments.map(([method, amount]) => (
                <div
                  key={method}
                  className="flex items-center justify-between rounded-md border bg-card p-3"
                >
                  <span className="text-sm font-medium">{t.payMethods[method] ?? method}</span>
                  <span className="font-semibold">{money(amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {summary && summary.items.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t.itemsSold}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 text-xs">
                    <tr>
                      <th className="p-2 text-right font-medium">{t.name}</th>
                      <th className="p-2 text-right font-medium">{t.quantity}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.items.map((it) => (
                      <tr key={it.name} className="border-t">
                        <td className="p-2">{it.name}</td>
                        <td className="p-2 font-mono">{num(it.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {rows && rows.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t.noData}
            </CardContent>
          </Card>
        )}
      </div>

      {rows && summary && (
        <div
          ref={receiptRef}
          className="mx-auto mt-4 hidden w-[80mm] bg-white p-3 font-mono text-[12px] leading-tight text-black shadow print:mt-0 print:block print:shadow-none"
        >
          <div className="text-center">
            <div className="text-base font-bold">{store?.store_name || t.appName}</div>
            {store?.address && <div className="text-[11px]">{store.address}</div>}
            {store?.phone && (
              <div className="text-[11px]" dir="ltr">
                {store.phone}
              </div>
            )}
          </div>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-center text-sm font-bold">{t.zReport}</div>
          <div className="text-center text-[10px]">{t.walkInSummary}</div>
          <div className="my-2 border-t border-dashed border-black" />
          <Line label={t.from} value={jalaliDateTime(new Date(from).toISOString())} />
          <Line label={t.to} value={jalaliDateTime(new Date(to).toISOString())} />
          <div className="my-2 border-t border-dashed border-black" />
          <Line label={t.quickSalesCount} value={num(summary.count, 0)} />
          <Line label={t.itemsSold} value={num(summary.itemQty, 0)} />
          <Line label={t.subtotal} value={money(summary.subtotal)} />
          {summary.discount > 0 && (
            <Line label={t.discount} value={`- ${money(summary.discount)}`} />
          )}
          <Line label={t.total} value={money(summary.total)} bold />
          <Line label={t.paid} value={money(summary.paid)} />
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-[11px] font-bold">{t.paymentMethod}</div>
          {summary.payments.length === 0 && <div className="text-[10px] text-gray-600">—</div>}
          {summary.payments.map(([method, amount]) => (
            <Line key={method} label={t.payMethods[method] ?? method} value={money(amount)} />
          ))}
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-[11px] font-bold">{t.itemsSold}</div>
          {summary.items.slice(0, 30).map((it) => (
            <div key={it.name} className="flex justify-between text-[11px]">
              <span className="truncate">{it.name}</span>
              <span>× {num(it.quantity)}</span>
            </div>
          ))}
          {summary.items.length > 30 && (
            <div className="text-center text-[10px] text-gray-600">
              + {num(summary.items.length - 30)}
            </div>
          )}
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-center text-[10px] text-gray-600">
            {toPashtoDigits(new Date().toLocaleString("en-GB"))}
          </div>
          {store?.receipt_footer && (
            <div className="mt-1 text-center text-[11px]">{store.receipt_footer}</div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-sm font-bold" : "text-[11px]"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
