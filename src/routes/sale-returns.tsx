import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox, StatCard } from "@/components/report-shell";
import { DateRangePreset, type Preset, computeRange } from "@/components/date-range-preset";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/refund-dialog";
import { t } from "@/lib/i18n";
import { money, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { listLocalSalesForReturns } from "@/lib/local-store";

export const Route = createFileRoute("/sale-returns")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager"]}>
      <SaleReturns />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent("د پلور بېرته راګرځول"),
});

type Row = {
  id: string;
  invoice_no: string;
  sale_date: string;
  status: string;
  total: number;
  notes: string | null;
};

function SaleReturns() {
  const init = computeRange("month", "", "");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [openSale, setOpenSale] = useState<{ id: string; invoice: string } | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["sale-returns", from, to],
    queryFn: (): Promise<Row[]> => listLocalSalesForReturns(from, to),
  });

  const rows = data ?? [];
  const totalRefunded = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <ReportShell
      title="د پلور بېرته راګرځول"
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
          `sale-returns-${from}-${to}`,
          [
            { key: "invoice_no", header: t.invoice },
            { key: "sale_date", header: t.date },
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
            <StatCard label="د بېرته راګرځېدلو پلورونو شمېر" value={num(rows.length)} />
            <StatCard
              label="د بېرته راګرځېدلو مجموعي ارزښت"
              value={money(totalRefunded)}
              tone="destructive"
            />
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
                        <td className="p-2">
                          {new Date(r.sale_date).toLocaleString("fa-IR", {
                            timeZone: "Asia/Kabul",
                          })}
                        </td>
                        <td className="p-2">
                          {r.status === "refunded"
                            ? "بشپړ بېرته راګرځېدلی"
                            : "برخه ییز بېرته راګرځېدلی"}
                        </td>
                        <td className="p-2 text-left font-mono">{money(Number(r.total))}</td>
                        <td className="p-2 text-left no-print">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenSale({ id: r.id, invoice: r.invoice_no })}
                          >
                            {t.viewLedger}
                          </Button>
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
      {openSale && (
        <RefundDialog
          saleId={openSale.id}
          invoiceNo={openSale.invoice}
          onClose={() => setOpenSale(null)}
          onDone={() => refetch()}
        />
      )}
    </ReportShell>
  );
}
