import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  Printer,
  Eye,
  FileText,
  Loader2,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { t } from "@/lib/i18n";
import { useStoreSettings } from "@/lib/store-settings";
import { jalaliDateTime } from "@/lib/format";
import { ReportPresetBar } from "@/components/report-preset-bar";
import { toast } from "sonner";

const WATERMARK_STORAGE_PREFIX = "report-watermark:";
type WatermarkPref = { enabled: boolean; text: string };
function readWatermarkPref(key: string): WatermarkPref | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WATERMARK_STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WatermarkPref;
    if (typeof parsed?.enabled === "boolean" && typeof parsed?.text === "string") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function StatCard({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "success" | "destructive" | "warning";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : accent
            ? "text-primary"
            : "";
  return (
    <Card className="print-avoid-break">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function PrintReportHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { data: s } = useStoreSettings();
  const store = s?.store_name ?? t.appName;
  const meta = [s?.address, s?.phone].filter(Boolean).join(" · ");
  return (
    <div className="print-only print-header print-avoid-break" dir="rtl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div style={{ fontSize: "13pt", fontWeight: 800, color: "#1f4d3a" }}>{store}</div>
          {meta && <div style={{ fontSize: "9pt", color: "#4a5450" }}>{meta}</div>}
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "12pt", fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: "9pt", color: "#4a5450" }}>{subtitle}</div>}
          <div style={{ fontSize: "8.5pt", color: "#4a5450", marginTop: "2pt" }}>
            {t.printedAt}: {jalaliDateTime(new Date())}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintReportFooter() {
  const { data: s } = useStoreSettings();
  return (
    <div className="print-only print-footer" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <span>{s?.receipt_footer ?? t.appName}</span>
        <span>{jalaliDateTime(new Date())}</span>
      </div>
    </div>
  );
}

/** Renders the branded A4 header/footer directly in the DOM (for on-screen preview + PDF snapshot). */
function BrandedPage({
  title,
  subtitle,
  watermark,
  children,
}: {
  title: string;
  subtitle?: string;
  watermark?: string;
  children: ReactNode;
}) {
  const { data: s } = useStoreSettings();
  const store = s?.store_name ?? t.appName;
  const meta = [s?.address, s?.phone].filter(Boolean).join(" · ");
  return (
    <div
      dir="rtl"
      className="report-a4-page relative mx-auto bg-white text-[#0d1a14] shadow-md"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "18mm 12mm 20mm",
        fontSize: "10.5pt",
        boxSizing: "border-box",
      }}
    >
      {watermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{
            transform: "rotate(-30deg)",
            fontSize: "84pt",
            fontWeight: 900,
            color: "rgba(31,77,58,0.08)",
            letterSpacing: "0.15em",
            zIndex: 0,
            userSelect: "none",
          }}
        >
          {watermark}
        </div>
      )}
      <div className="relative" style={{ zIndex: 1 }}>
        <div
          className="flex items-start justify-between gap-4"
          style={{ borderBottom: "1px solid #b3ad9d", paddingBottom: "6pt", marginBottom: "12pt" }}
        >
          <div>
            <div style={{ fontSize: "13pt", fontWeight: 800, color: "#1f4d3a" }}>{store}</div>
            {meta && <div style={{ fontSize: "9pt", color: "#4a5450" }}>{meta}</div>}
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "12pt", fontWeight: 700 }}>{title}</div>
            {subtitle && <div style={{ fontSize: "9pt", color: "#4a5450" }}>{subtitle}</div>}
            <div style={{ fontSize: "8.5pt", color: "#4a5450", marginTop: "2pt" }}>
              {t.printedAt}: {jalaliDateTime(new Date())}
            </div>
          </div>
        </div>
        <div className="report-preview-body">{children}</div>
        <div
          className="mt-6 flex items-center justify-between gap-4"
          style={{
            borderTop: "1px solid #b3ad9d",
            paddingTop: "6pt",
            fontSize: "9pt",
            color: "#4a5450",
          }}
        >
          <span>{s?.receipt_footer ?? t.appName}</span>
          <span>{jalaliDateTime(new Date())}</span>
        </div>
      </div>
    </div>
  );
}

interface ReportShellProps<TState = unknown> {
  title: string;
  subtitle?: string;
  filters: ReactNode;
  onExport?: () => void;
  onPrint?: () => void;
  disableExport?: boolean;
  disablePrint?: boolean;
  children: ReactNode;
  /** Unique key (e.g. route path) used to scope saved filter presets in localStorage. */
  presetKey?: string;
  /** Serializable filter state to save/load as a preset. */
  presetState?: TState;
  /** Callback invoked when the user picks a saved preset. */
  onPresetLoad?: (state: TState) => void;
}

export function ReportShell<TState = unknown>({
  title,
  subtitle,
  filters,
  onExport,
  onPrint,
  disableExport,
  disablePrint,
  children,
  presetKey,
  presetState,
  onPresetLoad,
}: ReportShellProps<TState>) {
  const watermarkKey = presetKey ?? title;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [watermarkEnabled, setWatermarkEnabled] = useState(
    () => readWatermarkPref(watermarkKey)?.enabled ?? false,
  );
  const [watermarkText, setWatermarkText] = useState(
    () => readWatermarkPref(watermarkKey)?.text ?? "DRAFT",
  );
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfErrorDetails, setPdfErrorDetails] = useState<string | null>(null);
  const [pdfErrorDetailsOpen, setPdfErrorDetailsOpen] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfStage, setPdfStage] = useState<string>("");
  const [pdfDone, setPdfDone] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        WATERMARK_STORAGE_PREFIX + watermarkKey,
        JSON.stringify({ enabled: watermarkEnabled, text: watermarkText }),
      );
    } catch {
      /* ignore quota */
    }
  }, [watermarkKey, watermarkEnabled, watermarkText]);

  const activeWatermark = watermarkEnabled ? watermarkText.trim() || "DRAFT" : undefined;

  const doPrint = useCallback(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("print-mode-a4");
    if (activeWatermark) {
      document.body.dataset.printWatermark = activeWatermark;
      document.body.classList.add("print-watermark");
    }
    const cleanup = () => {
      document.body.classList.remove("print-mode-a4");
      document.body.classList.remove("print-watermark");
      delete document.body.dataset.printWatermark;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }, [activeWatermark]);

  const handlePrint = useCallback(() => {
    if (onPrint) return onPrint();
    doPrint();
  }, [onPrint, doPrint]);

  const runPdfExport = useCallback(async () => {
    const node = previewRef.current;
    if (!node) {
      setPreviewOpen(true);
      toast.info("د PDF جوړولو لپاره لومړی مخکتنه پرانیستل کیږي");
      return;
    }
    cancelRef.current = false;
    setPdfBusy(true);
    setPdfError(null);
    setPdfErrorDetails(null);
    setPdfErrorDetailsOpen(false);
    setPdfDone(false);
    setPdfProgress(5);
    setPdfStage("د کتابتونونو بارول...");
    const checkCancel = () => {
      if (cancelRef.current) throw new Error("__CANCELLED__");
    };
    try {
      const [{ default: html2canvas }, jspdfModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      checkCancel();
      const JsPDF = jspdfModule.jsPDF;
      const pages = Array.from(node.querySelectorAll<HTMLElement>(".report-a4-page"));
      const targets = pages.length > 0 ? pages : [node];
      const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      setPdfProgress(15);
      for (let i = 0; i < targets.length; i++) {
        checkCancel();
        setPdfStage(`د مخ ${i + 1} / ${targets.length} انځورول...`);
        const canvas = await html2canvas(targets[i], {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        checkCancel();
        const img = canvas.toDataURL("image/jpeg", 0.92);
        const ratio = canvas.height / canvas.width;
        const imgH = pageW * ratio;
        if (i > 0) pdf.addPage();
        if (imgH <= pageH) {
          pdf.addImage(img, "JPEG", 0, 0, pageW, imgH);
        } else {
          let remaining = imgH;
          let offset = 0;
          while (remaining > 0) {
            pdf.addImage(img, "JPEG", 0, -offset, pageW, imgH);
            remaining -= pageH;
            offset += pageH;
            if (remaining > 0) pdf.addPage();
          }
        }
        setPdfProgress(15 + Math.round(((i + 1) / targets.length) * 75));
      }
      setPdfStage("د فایل خوندي کول...");
      setPdfProgress(95);
      const safe = title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "report";
      pdf.save(`${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
      setPdfProgress(100);
      setPdfDone(true);
      setPdfStage("بشپړ شو");
      toast.success("PDF ډاونلوډ شو");
    } catch (err) {
      const isCancel = err instanceof Error && err.message === "__CANCELLED__";
      if (isCancel) {
        setPdfStage("لغوه شو");
        setPdfProgress(0);
        toast.info("د PDF جوړول لغوه شول");
      } else {
        console.error("[ReportShell] PDF export failed", err);
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error && err.stack ? err.stack : String(err);
        setPdfError(msg || "ناڅرګنده تېروتنه");
        setPdfErrorDetails(stack);
        setPdfStage("ناکام شو");
        toast.error("د PDF جوړول ناکام شول");
      }
    } finally {
      cancelRef.current = false;
      setPdfBusy(false);
    }
  }, [title]);

  const handleCancelPdf = useCallback(() => {
    cancelRef.current = true;
    setPdfStage("د لغوه کولو غوښتنه...");
  }, []);

  const handleRetryPdf = useCallback(() => {
    setPdfError(null);
    setPdfErrorDetails(null);
    setPdfErrorDetailsOpen(false);
    setPdfProgress(0);
    setPdfStage("");
    setPdfDone(false);
    void runPdfExport();
  }, [runPdfExport]);

  const handleDownloadPdf = useCallback(() => {
    void runPdfExport();
  }, [runPdfExport]);

  return (
    <div dir="rtl" className="min-h-screen bg-muted/20 p-4 print:bg-white print:p-0 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="no-print flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {presetKey && presetState !== undefined && onPresetLoad && (
              <ReportPresetBar<TState>
                presetKey={presetKey}
                state={presetState}
                onLoad={onPresetLoad}
              />
            )}
            {onExport && (
              <Button
                size="sm"
                variant="outline"
                onClick={onExport}
                disabled={disableExport}
                data-shortcut="export"
              >
                <Download className="ml-1 h-4 w-4" />
                {t.exportCsv}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              disabled={disablePrint}
            >
              <Eye className="ml-1 h-4 w-4" />
              مخکتنه
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={disablePrint || pdfBusy}
            >
              {pdfBusy ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="ml-1 h-4 w-4" />
              )}
              {pdfBusy ? "جوړېږي..." : "PDF"}
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrint} disabled={disablePrint}>
              <Printer className="ml-1 h-4 w-4" />
              {t.print}
            </Button>
          </div>
        </div>

        <PrintReportHeader title={title} subtitle={subtitle} />

        <Card className="no-print" data-shortcut-scope="filters">
          <CardContent className="p-4">{filters}</CardContent>
        </Card>

        {children}

        <PrintReportFooter />
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={(v) => {
          if (!v && pdfBusy) return;
          setPreviewOpen(v);
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-w-5xl"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (pdfBusy) return;
            const tgt = e.target as HTMLElement;
            const tag = tgt?.tagName;
            if (e.key === "Enter" && !e.shiftKey && tag !== "INPUT" && tag !== "TEXTAREA") {
              e.preventDefault();
              handleDownloadPdf();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>د چاپ مخکتنه — {title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Switch
                id="wm-toggle"
                checked={watermarkEnabled}
                onCheckedChange={setWatermarkEnabled}
              />
              <Label htmlFor="wm-toggle" className="text-sm">
                واټرمارک وښایه
              </Label>
            </div>
            <Input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              disabled={!watermarkEnabled}
              placeholder="DRAFT / CONFIDENTIAL"
              className="h-8 w-52"
            />
            <div className="ms-auto text-xs text-muted-foreground">
              A4 · Enter = PDF ډاونلوډ · Esc = بندول
            </div>
          </div>
          <div className="max-h-[65vh] overflow-auto rounded-md border bg-[#f1efe6] p-4">
            <div ref={previewRef}>
              <BrandedPage title={title} subtitle={subtitle} watermark={activeWatermark}>
                {children}
              </BrandedPage>
            </div>
          </div>
          {(pdfBusy || pdfError || pdfDone) && (
            <div
              className={`rounded-md border p-3 text-sm ${
                pdfError
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : pdfDone
                    ? "border-success/40 bg-success/5 text-success"
                    : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                {pdfBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : pdfError ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span className="flex-1 truncate">
                  {pdfError ? `تېروتنه: ${pdfError}` : pdfStage || "چمتو"}
                </span>
                <span className="font-mono text-xs opacity-70">{pdfProgress}%</span>
                {pdfBusy && (
                  <Button size="sm" variant="ghost" onClick={handleCancelPdf} className="h-7">
                    <XCircle className="ml-1 h-3.5 w-3.5" />
                    لغوه
                  </Button>
                )}
              </div>
              <Progress value={pdfProgress} className="h-1.5" />
              {pdfError && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={handleRetryPdf}>
                      <RotateCw className="ml-1 h-3.5 w-3.5" />
                      بیا هڅه
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPdfError(null);
                        setPdfErrorDetails(null);
                        setPdfErrorDetailsOpen(false);
                        setPdfProgress(0);
                        setPdfStage("");
                      }}
                    >
                      وتل
                    </Button>
                    {pdfErrorDetails && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPdfErrorDetailsOpen((v) => !v)}
                        aria-expanded={pdfErrorDetailsOpen}
                      >
                        {pdfErrorDetailsOpen ? (
                          <ChevronUp className="ml-1 h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="ml-1 h-3.5 w-3.5" />
                        )}
                        د تېروتنې تفصيلات
                      </Button>
                    )}
                  </div>
                  {pdfErrorDetailsOpen && pdfErrorDetails && (
                    <pre
                      dir="ltr"
                      className="max-h-40 overflow-auto rounded border border-destructive/30 bg-background/60 p-2 text-left font-mono text-[11px] leading-relaxed"
                    >
                      {pdfErrorDetails}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setTimeout(handlePrint, 100);
              }}
              disabled={pdfBusy}
            >
              <Printer className="ml-1 h-4 w-4" />
              اوس چاپ کړئ
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} disabled={pdfBusy}>
              {pdfBusy ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="ml-1 h-4 w-4" />
              )}
              {pdfBusy ? "جوړېږي..." : "PDF ډاونلوډ"}
            </Button>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)} disabled={pdfBusy}>
              بندول
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function EmptyBox() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {t.emptyReport}
      </CardContent>
    </Card>
  );
}

export function LoadingBox() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {t.loadingReport}
      </CardContent>
    </Card>
  );
}
