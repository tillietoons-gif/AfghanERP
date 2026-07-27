import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { DateRangePreset, type Preset, computeRange } from "@/components/date-range-preset";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { money, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { getLocalPurchaseReportDetails } from "@/lib/local-store";

export const Route = createFileRoute("/reports/purchases")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "accountant", "inventory_officer"]}>
      <PR />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.purchaseReport),
});

type Group = "day" | "supplier" | "product" | "category";
type Row = { bucket: string; qty: number; total: number; txn_count: number };
type Resp = { total_purchases: number; txn_count: number; items_purchased: number; rows: Row[] };

function PR() {
  const init = computeRange("month", "", "");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [group, setGroup] = useState<Group>("day");

  const { data, isFetching } = useQuery({
    queryKey: ["purchase-report", from, to, group],
    queryFn: (): Promise<Resp> => getLocalPurchaseReportDetails(from, to, group),
  });

  const rows = data?.rows ?? [];
  const labels: Record<Group, string> = {
    day: t.byDay,
    supplier: t.bySupplier,
    product: t.byProduct,
    category: t.byCategory,
  };

  return (
    <ReportShell
      title={t.purchaseReport}
      subtitle={`${t.from} ${from} — ${t.to} ${to}`}
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <DateRangePreset
            preset={preset}
            from={from}
            to={to}
            onChange={(p, f, tt) => {
              setPreset(p);
              setFrom(f);
              setTo(tt);
            }}
          />
          <div className="space-y-1">
            <Label className="text-xs">{t.groupBy}</Label>
            <Select value={group} onValueChange={(v) => setGroup(v as Group)}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(labels) as Group[]).map((g) => (
                  <SelectItem key={g} value={g}>
                    {labels[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      }
      onExport={() =>
        exportCsv(
          `purchases-${group}-${from}-${to}`,
          [
            { key: "bucket", header: labels[group] },
            { key: "txn_count", header: "شمېر بیلونه" },
            { key: "qty", header: t.quantity },
            { key: "total", header: t.total },
          ],
          rows,
        )
      }
      disableExport={rows.length === 0}
      onPrint={() => window.print()}
      disablePrint={rows.length === 0}
    >
      {isFetching && !data ? (
        <LoadingBox />
      ) : !data ? (
        <EmptyBox />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t.totalPurchases} value={money(data.total_purchases)} accent />
            <StatCard label="شمېر بیلونه" value={num(data.txn_count)} />
            <StatCard label={t.quantity} value={num(data.items_purchased)} />
          </div>
          {rows.length === 0 ? (
            <EmptyBox />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-right">{labels[group]}</th>
                      <th className="p-2 text-left">{t.quantity}</th>
                      <th className="p-2 text-left">شمېر بیلونه</th>
                      <th className="p-2 text-left">{t.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.bucket}</td>
                        <td className="p-2 text-left font-mono">{num(r.qty)}</td>
                        <td className="p-2 text-left font-mono">{num(r.txn_count)}</td>
                        <td className="p-2 text-left font-mono">{money(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </ReportShell>
  );
}
