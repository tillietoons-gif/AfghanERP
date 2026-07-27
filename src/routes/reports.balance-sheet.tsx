import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { money } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getLocalBalanceSheet } from "@/lib/local-store";

export const Route = createFileRoute("/reports/balance-sheet")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "accountant"]}>
      <BS />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.balanceSheet),
});

type BSData = {
  as_of: string;
  assets: {
    cash_on_hand: number;
    bank: number;
    receivables: number;
    inventory: number;
    total: number;
  };
  liabilities: { payables: number; customer_prepaid: number; total: number };
  equity: { opening_capital: number; retained_profit: number; total: number };
  balanced: boolean;
  note: string;
};

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <tr className={`border-t ${bold ? "bg-muted/40 font-semibold" : ""}`}>
      <td className="p-3">{label}</td>
      <td className="p-3 text-left font-mono">{money(value)}</td>
    </tr>
  );
}

function BS() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const { data, isFetching } = useQuery({
    queryKey: ["bs", asOf],
    queryFn: (): Promise<BSData> => getLocalBalanceSheet(asOf),
  });

  const exportRows = () => {
    if (!data) return;
    const rows = [
      { section: t.assets, label: t.cashOnHand, value: data.assets.cash_on_hand },
      { section: t.assets, label: t.bankAccounts, value: data.assets.bank },
      { section: t.assets, label: t.receivables, value: data.assets.receivables },
      { section: t.assets, label: t.inventoryValue, value: data.assets.inventory },
      { section: t.assets, label: t.total, value: data.assets.total },
      { section: t.liabilities, label: t.payables, value: data.liabilities.payables },
      {
        section: t.liabilities,
        label: t.customerPrepaid,
        value: data.liabilities.customer_prepaid,
      },
      { section: t.liabilities, label: t.total, value: data.liabilities.total },
      { section: t.equity, label: t.openingCapital, value: data.equity.opening_capital },
      { section: t.equity, label: t.retainedProfit, value: data.equity.retained_profit },
      { section: t.equity, label: t.total, value: data.equity.total },
    ];
    exportCsv(
      `balance-sheet-${asOf}`,
      [
        { key: "section", header: "برخه" },
        { key: "label", header: t.name },
        { key: "value", header: t.amount },
      ],
      rows,
    );
  };

  return (
    <ReportShell
      title={t.balanceSheet}
      subtitle={`${t.asOfDate} ${asOf}`}
      filters={
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t.asOfDate}</Label>
            <Input
              type="date"
              dir="ltr"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="h-9 w-40"
            />
          </div>
        </div>
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
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t.assets} value={money(data.assets.total)} accent />
            <StatCard label={t.liabilities} value={money(data.liabilities.total)} />
            <StatCard label={t.equity} value={money(data.equity.total)} />
          </div>

          <Card
            className={
              data.balanced
                ? "border-success/50 bg-success/10"
                : "border-destructive/50 bg-destructive/10"
            }
          >
            <CardContent className="flex items-start gap-2 p-3 text-sm">
              {data.balanced ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <span>{data.balanced ? t.balancedOk : t.balancedFail}</span>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t.assets}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    <Row label={t.cashOnHand} value={data.assets.cash_on_hand} />
                    <Row label={t.bankAccounts} value={data.assets.bank} />
                    <Row label={t.receivables} value={data.assets.receivables} />
                    <Row label={t.inventoryValue} value={data.assets.inventory} />
                    <Row label={t.total} value={data.assets.total} bold />
                  </tbody>
                </table>
                <p className="p-2 text-[11px] text-muted-foreground">{t.bankPlaceholderNote}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t.liabilities}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    <Row label={t.payables} value={data.liabilities.payables} />
                    <Row label={t.customerPrepaid} value={data.liabilities.customer_prepaid} />
                    <Row label={t.total} value={data.liabilities.total} bold />
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t.equity}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    <Row label={t.openingCapital} value={data.equity.opening_capital} />
                    <Row label={t.retainedProfit} value={data.equity.retained_profit} />
                    <Row label={t.total} value={data.equity.total} bold />
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </ReportShell>
  );
}
