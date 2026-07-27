import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Copy, Trash2, RotateCcw, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import {
  listIncidents,
  subscribeIncidents,
  clearIncidents,
  formatIncidentDetails,
  type IncidentRecord,
} from "@/lib/incident-history";
import { jalaliDateTime } from "@/lib/format";
import { makeRouteErrorComponent } from "@/components/route-error-page";

const incidentsSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  size: fallback(z.number().int(), 25).default(25),
});

export const Route = createFileRoute("/incidents")({
  validateSearch: zodValidator(incidentsSearchSchema),
  component: () => (
    <ProtectedRoute>
      <AppShell>
        <IncidentsPage />
      </AppShell>
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent("د تېروتنو تاریخچه"),
});

const PAGE_SIZES = [10, 25, 50, 100];

function matches(rec: IncidentRecord, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (rec.incidentId.toLowerCase().includes(needle)) return true;
  if (rec.message.toLowerCase().includes(needle)) return true;
  if (rec.context?.toLowerCase().includes(needle)) return true;
  if (rec.code?.toLowerCase().includes(needle)) return true;
  if (rec.status != null && String(rec.status).includes(needle)) return true;
  if (rec.fieldErrors) {
    for (const [k, v] of Object.entries(rec.fieldErrors)) {
      if (k.toLowerCase().includes(needle) || v.toLowerCase().includes(needle)) return true;
    }
  }
  return false;
}

function IncidentsPage() {
  const { q, page, size } = Route.useSearch();
  const navigate = Route.useNavigate();

  // Local search input, debounced into the URL to keep the URL calm while typing.
  const [localQ, setLocalQ] = useState(q);
  useEffect(() => {
    setLocalQ(q);
  }, [q]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (localQ !== q) navigate({ search: { q: localQ, page: 1, size } });
    }, 250);
    return () => window.clearTimeout(id);
  }, [localQ, q, size, navigate]);

  const [records, setRecords] = useState<IncidentRecord[]>(() => listIncidents());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setRecords(listIncidents());
    return subscribeIncidents(setRecords);
  }, []);

  // Filtered subset. Even though this runs client-side, the filter+paginate
  // pipeline keeps DOM node count bounded, which is what "server-side"
  // pagination actually buys you at these volumes.
  const filtered = useMemo(() => {
    const trimmed = q.trim();
    if (!trimmed) return records;
    return records.filter((r) => matches(r, trimmed));
  }, [records, q]);

  const safeSize = PAGE_SIZES.includes(size) ? size : 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeSize;
  const paged = filtered.slice(start, start + safeSize);

  const copy = async (rec: IncidentRecord) => {
    try {
      await navigator.clipboard.writeText(formatIncidentDetails(rec));
      setCopiedId(rec.incidentId);
      toast.success("پېښه کاپي شوه");
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("کاپي ونه شو");
    }
  };

  const copyId = async (rec: IncidentRecord) => {
    try {
      await navigator.clipboard.writeText(rec.incidentId);
      toast.success("د پېښې شمېره کاپي شوه");
    } catch {
      toast.error("کاپي ونه شو");
    }
  };

  const goto = (p: number) =>
    navigate({ search: { q, size: safeSize, page: Math.max(1, Math.min(totalPages, p)) } });
  const setSize = (s: number) => navigate({ search: { q, size: s, page: 1 } });

  return (
    <div className="space-y-4 p-4 md:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">د تېروتنو تاریخچه</h1>
          <p className="text-xs text-muted-foreground">
            ټول {records.length} — د لټون پایلې {filtered.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRecords(listIncidents())}
            aria-label="بیا بار کړئ"
          >
            <RotateCcw className="ml-1 h-3 w-3" /> تازه
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={records.length === 0}
            onClick={() => {
              if (!confirm("ټولې پېښې ړنګ کړم؟")) return;
              clearIncidents();
            }}
            aria-label="ټولې پېښې ړنګ کړئ"
          >
            <Trash2 className="ml-1 h-3 w-3" /> ټولې ړنګ کړه
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            id="incidents-search"
            name="incidents-search"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder="د شمېرې، پیغام، یا کوډ لټون…"
            className="pr-10"
            aria-label="د پېښو لټون"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">هر مخ کې:</span>
          <Select value={String(safeSize)} onValueChange={(v) => setSize(Number(v))}>
            <SelectTrigger className="h-8 w-[80px]" aria-label="د مخ اندازه">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">شمېره</TableHead>
              <TableHead className="text-right">پیغام</TableHead>
              <TableHead className="text-right">شرایط</TableHead>
              <TableHead className="text-right">کوډ / وضعیت</TableHead>
              <TableHead className="text-right">نېټه</TableHead>
              <TableHead className="text-right">عمليات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {records.length === 0 ? "تر اوسه هېڅ پېښه نشته" : "هېڅ پایله ونه موندل شوه"}
                </TableCell>
              </TableRow>
            )}
            {paged.map((r) => (
              <TableRow key={`${r.incidentId}-${r.at}`}>
                <TableCell className="font-mono text-xs" dir="ltr">
                  <button
                    type="button"
                    className="underline decoration-dotted hover:text-primary"
                    onClick={() => copyId(r)}
                    aria-label={`د پېښې ${r.incidentId} شمېره کاپي کړئ`}
                  >
                    {r.incidentId}
                  </button>
                </TableCell>
                <TableCell className="max-w-[280px] truncate" title={r.message}>
                  {r.message}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.context ?? "—"}</TableCell>
                <TableCell className="text-xs" dir="ltr">
                  {r.code && (
                    <Badge variant="outline" className="mr-1">
                      {r.code}
                    </Badge>
                  )}
                  {r.status != null && <Badge variant="secondary">{r.status}</Badge>}
                  {!r.code && r.status == null && "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {jalaliDateTime(new Date(r.at).toISOString())}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(r)}
                    aria-label={`د پېښې ${r.incidentId} بشپړ توضیحات کاپي کړئ`}
                  >
                    <Copy className="ml-1 h-3 w-3" />
                    {copiedId === r.incidentId ? "کاپي شوه" : "بشپړ توضیحات"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          مخ {safePage} / {totalPages} — د {filtered.length === 0 ? 0 : start + 1} څخه{" "}
          {Math.min(filtered.length, start + safeSize)} پورې
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={safePage <= 1}
            onClick={() => goto(safePage - 1)}
            aria-label="مخکینی مخ"
          >
            <ChevronRight className="h-3 w-3" />
            مخکینی
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={safePage >= totalPages}
            onClick={() => goto(safePage + 1)}
            aria-label="راتلونکی مخ"
          >
            راتلونکی
            <ChevronLeft className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
