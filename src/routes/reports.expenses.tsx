import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { DateRangePreset, type Preset, computeRange } from "@/components/date-range-preset";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { money, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { getLocalExpenseReport } from "@/lib/local-store";

export const Route = createFileRoute("/reports/expenses")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "accountant"]}>
      <ER />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.expenseReport),
});

type Row = { category: string; count: number; total: number };
type Resp = { total: number; count: number; rows: Row[] };

function ER() {
  const init = computeRange("month", "", "");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data, isFetching } = useQuery({
    queryKey: ["expense-report", from, to],
    queryFn: async (): Promise<Resp> => {
      const rows = await getLocalExpenseReport(from, to);
      return {
        rows,
        total: rows.reduce((sum, row) => sum + row.total, 0),
        count: rows.reduce((sum, row) => sum + row.count, 0),
      };
    },
  });

  const rows = data?.rows ?? [];

  return (
    <ReportShell
      title={t.expenseReport}
      subtitle={`${t.from} ${from} — ${t.to} ${to}`}
      filters={
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
      }
      onExport={() =>
        exportCsv(
          `expenses-${from}-${to}`,
          [
            { key: "category", header: t.category },
            { key: "count", header: "شمېر" },
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
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label={t.totalExpenses} value={money(data.total)} tone="destructive" />
            <StatCard label="شمېر مصارف" value={num(data.count)} />
          </div>
          {rows.length === 0 ? (
            <EmptyBox />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-right">{t.category}</th>
                      <th className="p-2 text-left">شمېر</th>
                      <th className="p-2 text-left">{t.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.category}</td>
                        <td className="p-2 text-left font-mono">{num(r.count)}</td>
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
