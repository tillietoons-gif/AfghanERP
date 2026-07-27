import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Trash2, RotateCw, Download } from "lucide-react";
import { useScanSession, clearScanSession, type ScanContext } from "@/lib/scan-session";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

interface Props {
  context: ScanContext;
  onRetry?: (code: string) => void;
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function ScanHistoryPanel({ context, onRetry }: Props) {
  const events = useScanSession(context);

  const doExport = () => {
    if (events.length === 0) {
      toast.info(t.nothingToExport);
      return;
    }
    exportCsv(
      `scan-history-${context}`,
      [
        { key: "ts", header: t.time, value: (r) => new Date(r.ts as number).toISOString() },
        { key: "code", header: t.barcode },
        { key: "matched", header: t.matched, value: (r) => (r.matched ? "yes" : "no") },
        {
          key: "productName",
          header: t.product,
          value: (r) => (r.productName as string | undefined) ?? "",
        },
        {
          key: "quantityAdded",
          header: t.quantity,
          value: (r) => (r.quantityAdded as number | undefined) ?? "",
        },
      ],
      events as unknown as Record<string, unknown>[],
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" /> {t.scanHistory}
          <Badge variant="secondary" className="text-[10px]">
            {events.length}
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={doExport}
            title={t.export}
            disabled={events.length === 0}
          >
            <Download className="h-3 w-3" />
          </Button>
          {events.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => clearScanSession(context)}
              title={t.clear}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{t.noScansYet}</p>
        ) : (
          <div className="max-h-56 space-y-1 overflow-auto">
            {events.map((e) => (
              <div
                key={e.id}
                className={`flex items-center justify-between gap-2 rounded border p-1.5 text-xs ${e.matched ? "" : "bg-destructive/10"}`}
              >
                <div className="min-w-0 flex-1">
                  <div dir="ltr" className="truncate font-mono text-[11px]">
                    {e.code}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {e.matched ? (e.productName ?? "—") : t.scanNotFound}
                    {e.quantityAdded ? ` ×${e.quantityAdded}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(e.ts)}</span>
                  {onRetry && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => onRetry(e.code)}
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
