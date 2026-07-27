import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { DateRangePreset, type Preset, computeRange } from "@/components/date-range-preset";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { money } from "@/lib/format";
import { jalaliDate } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { getLocalCashbookDetails } from "@/lib/local-store";

export const Route = createFileRoute("/reports/cashbook")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "accountant", "cashier"]}>
      <CB />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.cashbook),
});

type Row = {
  ts: string;
  txn_type: string;
  reference: string;
  description: string;
  cash_in: number;
  cash_out: number;
  running_balance: number;
};
type Resp = { opening: number; closing: number; total_in: number; total_out: number; rows: Row[] };

const typeLabels: Record<string, string> = {
  opening: t.opening,
  cash_sale: t.cashSale,
  customer_payment: t.customerPayment,
  cash_purchase: t.cashPurchase,
  supplier_payment: t.supplierPayment,
  cash_expense: t.cashExpense,
  cash_refund: t.salesReturns,
};

function CB() {
  const init = computeRange("month", "", "");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data, isFetching } = useQuery({
    queryKey: ["cashbook", from, to],
    queryFn: (): Promise<Resp> => getLocalCashbookDetails(from, to),
  });

  const rows = data?.rows ?? [];

  return (
    <ReportShell
      title={t.cashbook}
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
          `cashbook-${from}-${to}`,
          [
            { key: "ts", header: t.date },
            { key: "txn_type", header: t.txnType },
            { key: "reference", header: t.reference },
            { key: "description", header: t.description },
            { key: "cash_in", header: t.cashIn },
            { key: "cash_out", header: t.cashOut },
            { key: "running_balance", header: t.runningBalance },
          ],
          rows.map((r) => ({ ...r, txn_type: typeLabels[r.txn_type] ?? r.txn_type })),
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
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label={t.openingCash} value={money(data.opening)} />
            <StatCard label={t.cashIn} value={money(data.total_in)} tone="success" />
            <StatCard label={t.cashOut} value={money(data.total_out)} tone="destructive" />
            <StatCard label={t.closingCash} value={money(data.closing)} accent />
          </div>

          {rows.length === 0 ? (
            <EmptyBox />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-right">{t.date}</th>
                      <th className="p-2 text-right">{t.txnType}</th>
                      <th className="p-2 text-right">{t.reference}</th>
                      <th className="p-2 text-left">{t.cashIn}</th>
                      <th className="p-2 text-left">{t.cashOut}</th>
                      <th className="p-2 text-left">{t.runningBalance}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 whitespace-nowrap">{jalaliDate(r.ts)}</td>
                        <td className="p-2">{typeLabels[r.txn_type] ?? r.txn_type}</td>
                        <td className="p-2 text-muted-foreground">{r.reference}</td>
                        <td className="p-2 text-left font-mono text-success">
                          {r.cash_in ? money(r.cash_in) : "—"}
                        </td>
                        <td className="p-2 text-left font-mono text-destructive">
                          {r.cash_out ? money(r.cash_out) : "—"}
                        </td>
                        <td className="p-2 text-left font-mono font-semibold">
                          {money(r.running_balance)}
                        </td>
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
