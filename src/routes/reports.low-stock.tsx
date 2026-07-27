import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { getLocalLowStock } from "@/lib/local-store";

export const Route = createFileRoute("/reports/low-stock")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "inventory_officer", "accountant"]}>
      <LowStockReport />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.lowStockReport),
});

type Row = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  min_stock: number;
  unit: string;
};

function LowStockReport() {
  const { data, isFetching } = useQuery({
    queryKey: ["low-stock"],
    queryFn: getLocalLowStock,
  });

  const rows = data ?? [];
  const critical = rows.filter((r) => Number(r.stock) <= 0).length;

  return (
    <ReportShell
      title={t.lowStockReport}
      filters={
        <div className="text-sm text-muted-foreground">
          د هغو محصولاتو لیست چې سټاک یې د لږترلږه حد څخه ښکته دی
        </div>
      }
      onExport={() =>
        exportCsv(
          "low-stock",
          [
            { key: "name", header: t.name },
            { key: "sku", header: t.sku },
            { key: "stock", header: t.stock },
            { key: "min_stock", header: t.minStock },
            { key: "unit", header: t.unit },
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
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="د کم سټاک شمېر" value={num(rows.length)} tone="warning" />
            <StatCard label="پای ته رسیدلي (۰)" value={num(critical)} tone="destructive" />
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
                      <th className="p-2 text-left">{t.minStock}</th>
                      <th className="p-2 text-right">{t.unit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-t ${Number(r.stock) <= 0 ? "bg-destructive/5" : ""}`}
                      >
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 font-mono" dir="ltr">
                          {r.sku ?? "—"}
                        </td>
                        <td className="p-2 text-left font-mono">{num(r.stock)}</td>
                        <td className="p-2 text-left font-mono">{num(r.min_stock)}</td>
                        <td className="p-2">{t.units[r.unit] ?? r.unit}</td>
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
