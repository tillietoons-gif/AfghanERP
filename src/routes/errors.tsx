import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, RefreshCw, Bug } from "lucide-react";
import { toast } from "sonner";
import { DataTableShell, DetailDrawer } from "@/components/data-table-shell";
import { PageHeader } from "@/components/page-header";
import {
  countLocalErrorReports,
  listLocalErrorReports,
  resolveLocalErrorReport,
} from "@/lib/local-store";
import { getLocalSession } from "@/lib/local-auth";

const TITLE = "د تېروتنو څارنه";

export const Route = createFileRoute("/errors")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager"]}>
      <ErrorsDashboard />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(TITLE),
});

type Group = {
  fingerprint: string;
  message: string;
  source: string;
  severity: string;
  occurrences: number;
  affected_users: number;
  first_seen: string;
  last_seen: string;
  resolved: boolean;
  latest_id: string;
};

type Detail = {
  id: string;
  fingerprint: string;
  message: string;
  stack: string | null;
  source: string;
  severity: string;
  route: string | null;
  url: string | null;
  user_id: string | null;
  user_agent: string | null;
  http_status: number | null;
  context: Record<string, unknown>;
  created_at: string;
  resolved: boolean;
};

const SOURCES = [
  { value: "all", label: "ټول سرچینې" },
  { value: "react_boundary", label: "د ری‌اکټ حد" },
  { value: "window_error", label: "د پاڼې تېروتنه" },
  { value: "unhandled_rejection", label: "ناڅاپي وعده" },
  { value: "server_function", label: "د سرور فنکشن" },
  { value: "manual", label: "لاسي" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("fa-AF", { timeZone: "Asia/Kabul" });
}

function ErrorsDashboard() {
  const qc = useQueryClient();
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["error_report_groups", onlyUnresolved, source],
    queryFn: async () => {
      const reports = await listLocalErrorReports({
        resolved: onlyUnresolved ? false : undefined,
        source: source === "all" ? undefined : source,
        limit: 500,
      });
      return reports.map((report): Group => ({
        fingerprint: report.fingerprint,
        message: report.message,
        source: report.source,
        severity: report.severity,
        occurrences: report.count,
        affected_users: 0,
        first_seen: report.first_seen,
        last_seen: report.last_seen,
        resolved: Boolean(report.resolved),
        latest_id: report.id,
      }));
    },
  });

  const unresolvedCount = useQuery({
    queryKey: ["unresolved_error_count"],
    queryFn: () => countLocalErrorReports({ resolved: false }),
  });

  const resolveMut = useMutation({
    mutationFn: (fingerprint: string) =>
      resolveLocalErrorReport(fingerprint, getLocalSession()?.user.id ?? "local"),
    onSuccess: () => {
      toast.success("د تېروتنې ډله حل شوه");
      qc.invalidateQueries({ queryKey: ["error_report_groups"] });
      qc.invalidateQueries({ queryKey: ["unresolved_error_count"] });
    },
    onError: (e) => toast.error(`ناکامي: ${(e as Error).message}`),
  });

  const detailQuery = useQuery({
    queryKey: ["error_report_detail", selected],
    enabled: !!selected,
    queryFn: async () => {
      const report = (await listLocalErrorReports({ limit: 500 })).find(
        (entry) => entry.id === selected,
      );
      if (!report) throw new Error("error_report_not_found");
      let context: Record<string, unknown> = {};
      if (report.context) {
        try {
          context = JSON.parse(report.context) as Record<string, unknown>;
        } catch {
          context = { raw: report.context };
        }
      }
      return {
        id: report.id,
        fingerprint: report.fingerprint,
        message: report.message,
        stack: report.stack,
        source: report.source,
        severity: report.severity,
        route: report.route,
        url: report.url,
        user_id: null,
        user_agent: report.user_agent,
        http_status: report.http_status,
        context,
        created_at: report.first_seen,
        resolved: Boolean(report.resolved),
      } satisfies Detail;
    },
  });

  const filtered = useMemo(() => {
    const rows = groupsQuery.data ?? [];
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) => r.message.toLowerCase().includes(q) || r.fingerprint.toLowerCase().includes(q),
    );
  }, [groupsQuery.data, search]);

  const totalOccurrences = filtered.reduce((sum, r) => sum + Number(r.occurrences), 0);

  return (
    <div dir="rtl" className="space-y-4 p-4 md:p-6">
      <PageHeader
        kicker={
          <span className="inline-flex items-center gap-1">
            <Bug className="h-3 w-3" /> Runtime
          </span>
        }
        title={TITLE}
        subtitle="د پروډکشن رن‌ټایم تېروتنې د سټک ټریس او د غوښتنې متن سره"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              groupsQuery.refetch();
              unresolvedCount.refetch();
            }}
          >
            <RefreshCw className="ms-2 h-4 w-4" /> تازه
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat title="ناحل شوې" value={unresolvedCount.data ?? 0} tone="destructive" />
        <Stat title="ډلې" value={filtered.length} />
        <Stat title="ټول پيښې" value={totalOccurrences} />
        <Stat
          title="متاثره کاروونکي"
          value={filtered.reduce((s, r) => s + Number(r.affected_users), 0)}
        />
      </div>

      <DataTableShell
        loading={groupsQuery.isLoading}
        isEmpty={!groupsQuery.isLoading && filtered.length === 0}
        empty={
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p>هيڅ تېروتنه نشته 🎉</p>
          </div>
        }
        toolbar={
          <>
            <Input
              className="max-w-xs"
              placeholder="د پیغام لټون…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={onlyUnresolved ? "unresolved" : "all"}
              onValueChange={(v) => setOnlyUnresolved(v === "unresolved")}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unresolved">یوازې ناحل شوې</SelectItem>
                <SelectItem value="all">ټول</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        <div className="divide-y divide-border-hair">
          {filtered.map((g) => (
            <button
              key={g.fingerprint}
              onClick={() => setSelected(g.latest_id)}
              className="w-full text-right p-4 hover:bg-accent/40 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={g.resolved ? "outline" : "destructive"}>
                      {g.resolved ? "حل شوی" : g.severity}
                    </Badge>
                    <Badge variant="secondary">{g.source}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{g.fingerprint}</span>
                  </div>
                  <div className="truncate font-medium">{g.message}</div>
                  <div className="text-xs text-muted-foreground">
                    {Number(g.occurrences)} پيښې · {Number(g.affected_users)} کاروونکي · وروستۍ:{" "}
                    {fmtDate(g.last_seen)}
                  </div>
                </div>
                {!g.resolved && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      resolveMut.mutate(g.fingerprint);
                    }}
                    disabled={resolveMut.isPending}
                  >
                    <CheckCircle2 className="ms-2 h-4 w-4" /> حل کول
                  </Button>
                )}
              </div>
            </button>
          ))}
        </div>
      </DataTableShell>

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> د تېروتنې تفصيل
          </span>
        }
      >
        {detailQuery.isLoading || !detailQuery.data ? (
          <div className="p-6 text-center text-sm text-muted-foreground">راوړل کيږي…</div>
        ) : (
          <div className="space-y-3 text-sm">
            <Field label="پیغام" value={detailQuery.data.message} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="سرچینه" value={detailQuery.data.source} />
              <Field label="سختوالی" value={detailQuery.data.severity} />
              <Field label="لار" value={detailQuery.data.route ?? "—"} />
              <Field label="HTTP" value={detailQuery.data.http_status?.toString() ?? "—"} />
            </div>
            <Field label="URL" value={detailQuery.data.url ?? "—"} mono />
            <Field label="User Agent" value={detailQuery.data.user_agent ?? "—"} mono small />
            <Field label="کاروونکی" value={detailQuery.data.user_id ?? "ناپېژندل شوی"} mono small />
            <Field label="مهال" value={fmtDate(detailQuery.data.created_at)} />
            {detailQuery.data.stack && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Stack trace</div>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                  {detailQuery.data.stack}
                </pre>
              </div>
            )}
            {Object.keys(detailQuery.data.context ?? {}).length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">متن</div>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(detailQuery.data.context, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

function Stat({ title, value, tone }: { title: string; value: number; tone?: "destructive" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div
          className={`text-2xl font-bold ${tone === "destructive" && value > 0 ? "text-destructive" : ""}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${small ? "text-xs" : ""} break-all`}>
        {value}
      </div>
    </div>
  );
}
