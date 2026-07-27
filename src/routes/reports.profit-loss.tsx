import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, StatCard, EmptyBox, LoadingBox } from "@/components/report-shell";
import { DateRangePreset, type Preset, computeRange } from "@/components/date-range-preset";
import { t } from "@/lib/i18n";
import { money } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { exportCsv } from "@/lib/csv";
import { AlertTriangle } from "lucide-react";
import { getLocalProfitLossDetails } from "@/lib/local-store";

export const Route = createFileRoute("/reports/profit-loss")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "accountant"]}>
      <PL />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.profitLoss),
});

type PLData = {
  from: string;
  to: string;
  gross_sales: number;
  discounts: number;
  returns: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  cogs_fallback_used: boolean;
};

function PL() {
  const init = computeRange("month", "", "");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data, isFetching } = useQuery({
    queryKey: ["pl", from, to],
    queryFn: (): Promise<PLData> => getLocalProfitLossDetails(from, to),
  });

  const loss = data && data.net_profit < 0;
  const rows = data
    ? [
        { group: "عوايد", label: t.grossSales, value: data.gross_sales },
        { group: "عوايد", label: t.discountsTotal, value: -data.discounts },
        { group: "عوايد", label: t.salesReturns, value: -data.returns },
        { group: "عوايد", label: t.netSales, value: data.net_sales },
        { group: "COGS", label: t.cogs, value: -data.cogs },
        { group: "COGS", label: t.grossProfit, value: data.gross_profit },
        { group: t.totalExpenses, label: t.totalExpenses, value: -data.expenses },
        { group: "خالص", label: loss ? t.netLoss : t.netProfit, value: data.net_profit },
      ]
    : [];

  const exportRows = () => {
    if (!data) return;
    exportCsv(
      `profit-loss-${from}-${to}`,
      [
        { key: "group", header: "ګروپ" },
        { key: "label", header: t.description },
        { key: "value", header: t.amount },
      ],
      rows,
    );
  };

  return (
    <ReportShell
      title={t.profitLoss}
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
      onExport={exportRows}
      disableExport={!data}
      onPrint={() => window.print()}
      disablePrint={!data}
    >
      {isFetching && !data ? (
        <LoadingBox />
      ) : !data ? (
        <EmptyBox />
      ) : (
        <>
          {data.cogs_fallback_used && (
            <Card className="border-warning/50 bg-warning/10">
              <CardContent className="flex items-start gap-2 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>{t.cogsFallbackWarn}</span>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={t.grossSales} value={money(data.gross_sales)} />
            <StatCard label={t.netSales} value={money(data.net_sales)} />
            <StatCard label={t.grossProfit} value={money(data.gross_profit)} accent />
            <StatCard label={t.totalExpenses} value={money(data.expenses)} />
            <StatCard
              label={loss ? t.netLoss : t.netProfit}
              value={money(data.net_profit)}
              tone={loss ? "destructive" : "success"}
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r, i) => {
                    const isSummary =
                      r.label === t.netSales ||
                      r.label === t.grossProfit ||
                      r.label === t.netProfit ||
                      r.label === t.netLoss;
                    return (
                      <tr
                        key={i}
                        className={`border-t ${isSummary ? "bg-muted/40 font-semibold" : ""}`}
                      >
                        <td className="p-3 text-muted-foreground">{r.group}</td>
                        <td className="p-3">{r.label}</td>
                        <td
                          className={`p-3 text-left font-mono ${r.value < 0 ? "text-destructive" : ""}`}
                        >
                          {money(r.value)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  );
}
