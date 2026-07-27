import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { money } from "@/lib/format";
import { jalaliDate } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { BookOpen } from "lucide-react";
import { getLocalReceivablesDetails } from "@/lib/local-store";

export const Route = createFileRoute("/reports/receivables")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "accountant", "cashier"]}>
      <REC />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.receivables),
});

type Row = {
  customer_id: string;
  name: string;
  phone: string | null;
  credit_sales: number;
  paid: number;
  balance: number;
  aging_0_30: number;
  aging_31_60: number;
  aging_61_90: number;
  aging_90_plus: number;
  last_payment: string | null;
};

function REC() {
  const { data, isFetching } = useQuery({
    queryKey: ["receivables"],
    queryFn: (): Promise<Row[]> => getLocalReceivablesDetails(),
  });

  const rows = data ?? [];
  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          balance: a.balance + Number(r.balance || 0),
          aging_0_30: a.aging_0_30 + Number(r.aging_0_30 || 0),
          aging_31_60: a.aging_31_60 + Number(r.aging_31_60 || 0),
          aging_61_90: a.aging_61_90 + Number(r.aging_61_90 || 0),
          aging_90_plus: a.aging_90_plus + Number(r.aging_90_plus || 0),
        }),
        { balance: 0, aging_0_30: 0, aging_31_60: 0, aging_61_90: 0, aging_90_plus: 0 },
      ),
    [rows],
  );

  return (
    <ReportShell
      title={t.receivables}
      filters={
        <div className="text-sm text-muted-foreground">
          {t.asOfDate}: {new Date().toISOString().slice(0, 10)}
        </div>
      }
      onExport={() =>
        exportCsv(
          `receivables-${new Date().toISOString().slice(0, 10)}`,
          [
            { key: "name", header: t.customer },
            { key: "phone", header: "شمېره" },
            { key: "credit_sales", header: t.creditSales },
            { key: "paid", header: t.paid },
            { key: "balance", header: t.remainingBalance },
            { key: "aging_0_30", header: t.aging0_30 },
            { key: "aging_31_60", header: t.aging31_60 },
            { key: "aging_61_90", header: t.aging61_90 },
            { key: "aging_90_plus", header: t.aging90_plus },
            { key: "last_payment", header: t.lastPayment },
          ],
          rows,
        )
      }
      disableExport={rows.length === 0}
      onPrint={() => window.print()}
      disablePrint={rows.length === 0}
    >
      {isFetching && rows.length === 0 ? (
        <LoadingBox />
      ) : rows.length === 0 ? (
        <EmptyBox />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            <StatCard label={t.receivablesTotal} value={money(totals.balance)} accent />
            <StatCard label={t.aging0_30} value={money(totals.aging_0_30)} tone="success" />
            <StatCard label={t.aging31_60} value={money(totals.aging_31_60)} />
            <StatCard label={t.aging61_90} value={money(totals.aging_61_90)} tone="warning" />
            <StatCard
              label={t.aging90_plus}
              value={money(totals.aging_90_plus)}
              tone="destructive"
            />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-right">{t.customer}</th>
                    <th className="p-2 text-left">{t.creditSales}</th>
                    <th className="p-2 text-left">{t.paid}</th>
                    <th className="p-2 text-left">{t.remainingBalance}</th>
                    <th className="p-2 text-left">{t.aging0_30}</th>
                    <th className="p-2 text-left">{t.aging31_60}</th>
                    <th className="p-2 text-left">{t.aging61_90}</th>
                    <th className="p-2 text-left">{t.aging90_plus}</th>
                    <th className="p-2 text-left">{t.lastPayment}</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bucket = (days: [number, number | null]) => {
                      const today = new Date();
                      const iso = (d: Date) => d.toISOString().slice(0, 10);
                      const toD = new Date(today);
                      toD.setDate(today.getDate() - days[0]);
                      const search: { from?: string; to: string } = { to: iso(toD) };
                      if (days[1] !== null) {
                        const fromD = new Date(today);
                        fromD.setDate(today.getDate() - days[1]);
                        search.from = iso(fromD);
                      }
                      return search;
                    };
                    const agingLink = (val: number, days: [number, number | null]) => (
                      <Link
                        to="/customers/$id/ledger"
                        params={{ id: r.customer_id }}
                        search={bucket(days)}
                        className="hover:underline"
                      >
                        {money(val)}
                      </Link>
                    );
                    return (
                      <tr key={r.customer_id} className="border-t">
                        <td className="p-2">
                          <div className="font-medium">{r.name}</div>
                          {r.phone && (
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {r.phone}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-left font-mono">{money(r.credit_sales)}</td>
                        <td className="p-2 text-left font-mono">{money(r.paid)}</td>
                        <td className="p-2 text-left font-mono font-semibold">
                          {money(r.balance)}
                        </td>
                        <td className="p-2 text-left font-mono">
                          {agingLink(r.aging_0_30, [0, 30])}
                        </td>
                        <td className="p-2 text-left font-mono">
                          {agingLink(r.aging_31_60, [31, 60])}
                        </td>
                        <td className="p-2 text-left font-mono text-warning">
                          {agingLink(r.aging_61_90, [61, 90])}
                        </td>
                        <td className="p-2 text-left font-mono text-destructive">
                          {agingLink(r.aging_90_plus, [91, null])}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                          {r.last_payment ? jalaliDate(r.last_payment) : "—"}
                        </td>
                        <td className="p-2">
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/customers/$id/ledger" params={{ id: r.customer_id }}>
                              <BookOpen className="ml-1 h-4 w-4" />
                              {t.viewLedger}
                            </Link>
                          </Button>
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
