import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, X, Eye, Printer } from "lucide-react";
import { DataTableShell, DetailDrawer } from "@/components/data-table-shell";
import { PageHeader } from "@/components/page-header";
import { t } from "@/lib/i18n";
import { jalaliDateTime } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { countLocalAuditLogs, listLocalAuditActors, listLocalAuditLogs } from "@/lib/local-store";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/audit")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin"]}>
      <AuditPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("د پېښو ثبت"),
});

const ENTITY_OPTIONS = [
  "user_roles",
  "products",
  "categories",
  "brands",
  "suppliers",
  "customers",
  "sales",
  "sale_items",
  "sale_payments",
  "purchases",
  "purchase_items",
  "expenses",
  "stock_movements",
  "store_settings",
  "branches",
  "expense_categories",
];

const ACTION_OPTIONS = ["insert", "update", "delete", "create"];

const actionLabel: Record<string, string> = {
  insert: "زیاتونه",
  update: "بدلون",
  delete: "ړنګونه",
  create: "جوړونه",
};

type Row = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
  user_id: string | null;
};

function AuditPage() {
  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [actorId, setActorId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    setPage(0);
  }, [entity, action, actorId, from, to]);

  const { data: actors } = useQuery({
    queryKey: ["audit-actors"],
    queryFn: listLocalAuditActors,
  });

  const actorNames = useMemo(
    () => Object.fromEntries((actors ?? []).map((actor) => [actor.id, actor.full_name])),
    [actors],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", entity, action, actorId, from, to, page],
    queryFn: async () => {
      const fromIdx = page * PAGE_SIZE;
      const end = to ? new Date(to) : null;
      if (end) end.setDate(end.getDate() + 1);
      const filters = {
        entity: entity || undefined,
        action: action || undefined,
        user_id: actorId || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: end?.toISOString(),
      };
      const [logs, count] = await Promise.all([
        listLocalAuditLogs({ ...filters, limit: PAGE_SIZE, offset: fromIdx }),
        countLocalAuditLogs(filters),
      ]);
      const rows: Row[] = logs.map((log) => {
        try {
          return { ...log, metadata: JSON.parse(log.metadata) };
        } catch {
          return { ...log, metadata: log.metadata };
        }
      });
      return { rows, count };
    },
  });
  const rows = data?.rows;
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const hasFilters = !!(entity || action || actorId || from || to);

  const doExport = () => {
    if (!rows || rows.length === 0) return;
    exportCsv<Row>(
      "audit-logs",
      [
        { key: "created_at", header: "نېټه", value: (r) => new Date(r.created_at).toISOString() },
        {
          key: "user",
          header: "کارونکی",
          value: (r) => (r.user_id && actorNames[r.user_id]) || r.user_id || "",
        },
        { key: "action", header: "کړنه", value: (r) => actionLabel[r.action] ?? r.action },
        { key: "entity", header: "جدول" },
        { key: "entity_id", header: "د ثبت ID" },
        { key: "metadata", header: "معلومات", value: (r) => JSON.stringify(r.metadata ?? {}) },
      ],
      rows,
    );
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="د پېښو ثبت (Audit Log)"
        subtitle="د ټولو بدلونونو مکمل ثبت"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="ml-1 h-4 w-4" />
              چاپ
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={doExport}
              disabled={!rows || rows.length === 0}
              data-shortcut="export"
            >
              <Download className="ml-1 h-4 w-4" />
              {t.export} CSV
            </Button>
          </>
        }
      />

      <Card className="p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="space-y-1">
            <Label>جدول</Label>
            <Select value={entity || "all"} onValueChange={(v) => setEntity(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول</SelectItem>
                {ENTITY_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>کړنه</Label>
            <Select value={action || "all"} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول</SelectItem>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {actionLabel[a] ?? a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>کارونکی</Label>
            <Select
              value={actorId || "all"}
              onValueChange={(v) => setActorId(v === "all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ټول</SelectItem>
                {actors?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name ?? a.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>له نېټې</Label>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>تر نېټې</Label>
            <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              disabled={!hasFilters}
              onClick={() => {
                setEntity("");
                setAction("");
                setActorId("");
                setFrom("");
                setTo("");
              }}
            >
              <X className="ml-1 h-4 w-4" />
              فلټرونه پاک کړئ
            </Button>
          </div>
        </div>
      </Card>

      <DataTableShell
        loading={isLoading}
        isEmpty={!isLoading && (!rows || rows.length === 0)}
        toolbar={
          <span className="text-xs text-muted-foreground">
            {totalCount > 0 ? `${totalCount} ثبتونه` : "—"}
          </span>
        }
        footer={
          <>
            <span>
              {totalCount > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} / ${totalCount}`
                : "—"}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                مخکینی
              </Button>
              <span className="px-2 py-1 text-xs">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                راتلونکی
              </Button>
            </div>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{t.date}</TableHead>
              <TableHead className="text-right">کارونکی</TableHead>
              <TableHead className="text-right">کړنه</TableHead>
              <TableHead className="text-right">جدول</TableHead>
              <TableHead className="text-right">د ثبت ID</TableHead>
              <TableHead className="text-right">{t.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,a")) return;
                  setSelected(r);
                }}
              >
                <TableCell className="text-xs">{jalaliDateTime(r.created_at)}</TableCell>
                <TableCell className="text-xs">
                  {(r.user_id && actorNames[r.user_id]) ||
                    (r.user_id ? r.user_id.slice(0, 8) : "—")}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{actionLabel[r.action] ?? r.action}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.entity}</TableCell>
                <TableCell dir="ltr" className="text-right font-mono text-[10px]">
                  {r.entity_id ?? "—"}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => setSelected(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="د پېښې تفصیل"
        subtitle={
          selected
            ? `${selected.entity} · ${actionLabel[selected.action] ?? selected.action}`
            : undefined
        }
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <Row2 label="نېټه" value={jalaliDateTime(selected.created_at)} />
            <Row2 label="کړنه" value={actionLabel[selected.action] ?? selected.action} />
            <Row2 label="جدول" value={selected.entity} />
            <Row2 label="د ثبت ID" value={selected.entity_id ?? "—"} ltr />
            <Row2
              label="کارونکی"
              value={(selected.user_id && actorNames[selected.user_id]) || selected.user_id || "—"}
            />
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">معلومات</div>
              <pre dir="ltr" className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px]">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

function Row2({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={ltr ? "font-mono text-xs" : "font-medium"} dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}
