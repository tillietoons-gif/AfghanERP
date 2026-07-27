import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { getLocalExpiring } from "@/lib/local-store";

export const Route = createFileRoute("/reports/expiry")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "inventory_officer", "accountant"]}>
      <ExpiryReport />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.expiringReport),
});

type Row = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  expiry_date: string;
  unit: string;
};

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function bucketLabel(days: number) {
  if (days < 0) return "ختم شوي";
  if (days <= 7) return "≤ ۷ ورځې";
  if (days <= 30) return "≤ ۳۰ ورځې";
  return "≤ ۹۰ ورځې";
}

function ExpiryReport() {
  const [windowDays, setWindowDays] = useState(90);

  const { data, isFetching } = useQuery({
    queryKey: ["expiry", windowDays],
    queryFn: () => getLocalExpiring(windowDays),
  });

  const rows = data ?? [];
  const today = new Date();
  const expired = rows.filter((r) => new Date(r.expiry_date) < today).length;
  const soon = rows.filter((r) => {
    const d = daysBetween(today, new Date(r.expiry_date));
    return d >= 0 && d <= 30;
  }).length;

  return (
    <ReportShell
      title={t.expiringReport}
      subtitle={`د راتلونکو ${num(windowDays)} ورځو په اوږدو کې`}
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>د کتلو موده (ورځې)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              dir="ltr"
              className="h-9 w-32"
              value={windowDays}
              onChange={(e) => setWindowDays(Math.max(1, Number(e.target.value) || 30))}
            />
          </div>
        </div>
      }
      onExport={() =>
        exportCsv(
          `expiry-${windowDays}d`,
          [
            { key: "name", header: t.name },
            { key: "sku", header: t.sku },
            { key: "stock", header: t.stock },
            { key: "expiry_date", header: t.expiryDate },
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
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="ختم شوي" value={num(expired)} tone="destructive" />
            <StatCard label="په ۳۰ ورځو کې ختمېږي" value={num(soon)} tone="warning" />
            <StatCard label="ټول" value={num(rows.length)} />
          </div>
          {rows.length === 0 ? (
            <EmptyBox />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-right">{t.name}</th>
                      <th className="p-2 text-right">{t.sku}</th>
                      <th className="p-2 text-left">{t.stock}</th>
                      <th className="p-2 text-right">{t.expiryDate}</th>
                      <th className="p-2 text-right">حالت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const d = daysBetween(today, new Date(r.expiry_date));
                      return (
                        <tr
                          key={r.id}
                          className={`border-t ${d < 0 ? "bg-destructive/5" : d <= 7 ? "bg-warning/5" : ""}`}
                        >
                          <td className="p-2">{r.name}</td>
                          <td className="p-2 font-mono" dir="ltr">
                            {r.sku ?? "—"}
                          </td>
                          <td className="p-2 text-left font-mono">{num(r.stock)}</td>
                          <td className="p-2 font-mono" dir="ltr">
                            {r.expiry_date}
                          </td>
                          <td className="p-2">{bucketLabel(d)}</td>
                        </tr>
                      );
                    })}
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
