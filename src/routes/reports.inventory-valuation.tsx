import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { money, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { getLocalInventoryValuation } from "@/lib/local-store";

export const Route = createFileRoute("/reports/inventory-valuation")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "accountant", "inventory_officer"]}>
      <IV />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.inventoryValuation),
});

type Row = {
  product_id: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  cost: number;
  sale_price: number;
  cost_value: number;
  sale_value: number;
  potential_profit: number;
};

function IV() {
  const { data, isFetching } = useQuery({
    queryKey: ["inventory-valuation"],
    queryFn: async (): Promise<Row[]> => (await getLocalInventoryValuation()).items,
  });

  const rows = data ?? [];
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.cost += Number(r.cost_value || 0);
        acc.sale += Number(r.sale_value || 0);
        acc.profit += Number(r.potential_profit || 0);
        acc.stock += Number(r.stock || 0);
        return acc;
      },
      { cost: 0, sale: 0, profit: 0, stock: 0 },
    );
  }, [rows]);

  return (
    <ReportShell
      title={t.inventoryValuation}
      filters={
        <div className="text-sm text-muted-foreground">
          {t.asOfDate}: {new Date().toISOString().slice(0, 10)}
        </div>
      }
      onExport={() =>
        exportCsv(
          `inventory-valuation-${new Date().toISOString().slice(0, 10)}`,
          [
            { key: "name", header: t.product },
            { key: "category", header: t.category },
            { key: "stock", header: t.quantity },
            { key: "cost", header: t.costPrice },
            { key: "sale_price", header: t.salePriceLbl },
            { key: "cost_value", header: t.totalCostValue },
            { key: "sale_value", header: t.potentialSaleValue },
            { key: "potential_profit", header: t.potentialProfit },
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
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label={t.quantity} value={num(totals.stock)} />
            <StatCard label={t.totalCostValue} value={money(totals.cost)} accent />
            <StatCard label={t.potentialSaleValue} value={money(totals.sale)} />
            <StatCard label={t.potentialProfit} value={money(totals.profit)} tone="success" />
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-right">{t.product}</th>
                    <th className="p-2 text-right">{t.category}</th>
                    <th className="p-2 text-left">{t.quantity}</th>
                    <th className="p-2 text-left">{t.costPrice}</th>
                    <th className="p-2 text-left">{t.salePriceLbl}</th>
                    <th className="p-2 text-left">{t.totalCostValue}</th>
                    <th className="p-2 text-left">{t.potentialSaleValue}</th>
                    <th className="p-2 text-left">{t.potentialProfit}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.product_id} className="border-t">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-muted-foreground">{r.category || "—"}</td>
                      <td className="p-2 text-left font-mono">
                        {num(r.stock)} {r.unit}
                      </td>
                      <td className="p-2 text-left font-mono">{money(r.cost)}</td>
                      <td className="p-2 text-left font-mono">{money(r.sale_price)}</td>
                      <td className="p-2 text-left font-mono">{money(r.cost_value)}</td>
                      <td className="p-2 text-left font-mono">{money(r.sale_value)}</td>
                      <td className="p-2 text-left font-mono text-success">
                        {money(r.potential_profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  );
}
