import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { ReportShell, EmptyBox, LoadingBox } from "@/components/report-shell";
import { DateRangePreset, type Preset, computeRange } from "@/components/date-range-preset";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { money } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { getLocalAccountBalances } from "@/lib/local-store";

export const Route = createFileRoute("/reports/account-balances")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "accountant"]}>
      <AB />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.accountBalances),
});

type Row = { account: string; opening: number; debit: number; credit: number; closing: number };

function AB() {
  const init = computeRange("month", "", "");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data, isFetching } = useQuery({
    queryKey: ["ab", from, to],
    queryFn: (): Promise<Row[]> => getLocalAccountBalances(from, to),
  });

  const rows = data ?? [];
  const filterState = { preset, from, to };

  return (
    <ReportShell
      title={t.accountBalances}
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
      presetKey="reports/account-balances"
      presetState={filterState}
      onPresetLoad={(s) => {
        setPreset(s.preset);
        setFrom(s.from);
        setTo(s.to);
      }}
      onExport={() =>
        exportCsv(
          `account-balances-${from}-${to}`,
          [
            { key: "account", header: t.account },
            { key: "opening", header: t.opening },
            { key: "debit", header: t.debit },
            { key: "credit", header: t.credit },
            { key: "closing", header: t.closing },
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
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-3 text-right">{t.account}</th>
                  <th className="p-3 text-left">{t.opening}</th>
                  <th className="p-3 text-left">{t.debit}</th>
                  <th className="p-3 text-left">{t.credit}</th>
                  <th className="p-3 text-left">{t.closing}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.account} className="border-t">
                    <td className="p-3">{r.account}</td>
                    <td className="p-3 text-left font-mono">{money(r.opening)}</td>
                    <td className="p-3 text-left font-mono">{money(r.debit)}</td>
                    <td className="p-3 text-left font-mono">{money(r.credit)}</td>
                    <td className="p-3 text-left font-mono font-semibold">{money(r.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </ReportShell>
  );
}
