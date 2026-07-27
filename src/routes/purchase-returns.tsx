import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { DateRangePreset, type Preset, computeRange } from "@/components/date-range-preset";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PurchaseReturnDialog } from "@/components/purchase-return-dialog";
import { t } from "@/lib/i18n";
import { money, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { listLocalPurchasesForReturns } from "@/lib/local-store";

export const Route = createFileRoute("/purchase-returns")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "inventory_officer"]}>
      <PurchaseReturns />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent("د پېرود بېرته راګرځول"),
});

type Row = {
  id: string;
  invoice_no: string;
  purchase_date: string;
  status: string;
  total: number;
  paid: number;
  notes: string | null;
  suppliers: { name: string } | null;
};

function PurchaseReturns() {
  const init = computeRange("month", "", "");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [tab, setTab] = useState<"open" | "returned">("open");
  const [openPurchase, setOpenPurchase] = useState<{ id: string; invoice: string } | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["purchase-returns", from, to, tab],
    queryFn: async (): Promise<Row[]> =>
      (await listLocalPurchasesForReturns(from, to, tab === "returned")).map((purchase) => ({
        ...purchase,
        suppliers: purchase.supplier_name ? { name: purchase.supplier_name } : null,
      })),
  });

  const rows = data ?? [];
  const totalValue = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <ReportShell
      title="د پېرود بېرته راګرځول"
      subtitle={`${t.from} ${from} — ${t.to} ${to}`}
      filters={
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="flex gap-1 rounded-md border p-1">
            <Button
              size="sm"
              variant={tab === "open" ? "default" : "ghost"}
              onClick={() => setTab("open")}
            >
              فعال پېرودونه
            </Button>
            <Button
              size="sm"
              variant={tab === "returned" ? "default" : "ghost"}
              onClick={() => setTab("returned")}
            >
              بېرته راګرځېدلي
            </Button>
          </div>
        </div>
      }
      onExport={() =>
        exportCsv(
          `purchase-returns-${tab}-${from}-${to}`,
          [
            { key: "invoice_no", header: t.invoice },
            { key: "purchase_date", header: t.date },
            { key: "status", header: t.status },
            { key: "total", header: t.total },
            { key: "notes", header: t.notes },
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
            <StatCard label="د پېرودونو شمېر" value={num(rows.length)} />
            <StatCard label="ټول ارزښت" value={money(totalValue)} />
          </div>
          {rows.length === 0 ? (
            <EmptyBox />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-right">{t.invoice}</th>
                      <th className="p-2 text-right">{t.date}</th>
                      <th className="p-2 text-right">عرضه کوونکی</th>
                      <th className="p-2 text-right">{t.status}</th>
                      <th className="p-2 text-left">{t.total}</th>
                      <th className="p-2 text-right no-print">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 font-mono" dir="ltr">
                          {r.invoice_no}
                        </td>
                        <td className="p-2">{r.purchase_date}</td>
                        <td className="p-2">{r.suppliers?.name ?? "—"}</td>
                        <td className="p-2">
                          {r.status === "returned"
                            ? "بشپړ بېرته راګرځېدلی"
                            : r.status === "partial_return"
                              ? "برخه ییز بېرته راګرځېدلی"
                              : "فعال"}
                        </td>
                        <td className="p-2 text-left font-mono">{money(Number(r.total))}</td>
                        <td className="p-2 text-left no-print">
                          {tab === "open" ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setOpenPurchase({ id: r.id, invoice: r.invoice_no })}
                            >
                              بېرته راګرځول
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
      {openPurchase && (
        <PurchaseReturnDialog
          purchaseId={openPurchase.id}
          invoiceNo={openPurchase.invoice}
          onClose={() => setOpenPurchase(null)}
          onDone={() => refetch()}
        />
      )}
    </ReportShell>
  );
}
