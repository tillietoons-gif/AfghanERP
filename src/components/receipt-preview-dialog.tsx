import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, ExternalLink, FileDown, RefreshCw, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** e.g. "/print/receipt/abc" or "/print/purchase/abc" */
  url: string | null;
  title?: string;
}

const LOAD_TIMEOUT_MS = 15000;

export function ReceiptPreviewDialog({ open, onClose, url, title = "د رسيد مخکتنه" }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewUrl = url ? `${url}${url.includes("?") ? "&" : "?"}preview=1` : "";

  // Reset when opening or url changes
  useEffect(() => {
    if (!open || !url) return;
    setStatus("loading");
    setErrorMsg("");
    setDownloading(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setStatus((s) => (s === "loading" ? "error" : s));
      setErrorMsg((m) => m || "د مخکتنې د پورته کیدو وخت پای ته ورسید. مهرباني وکړئ بیا هڅه وکړئ.");
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open, url, reloadKey]);

  // Listen for messages from the iframe (ready / error / pdf status)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MessageEvent) => {
      const data = e.data as { type?: string; message?: string } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "receipt-ready") {
        setStatus("ready");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      } else if (data.type === "receipt-error") {
        setStatus("error");
        setErrorMsg(data.message || "د رسيد بار کول ناکام شول.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      } else if (data.type === "download-pdf-done") {
        setDownloading(false);
      } else if (data.type === "download-pdf-error") {
        setDownloading(false);
        setErrorMsg(data.message || "د PDF جوړول ناکام شول.");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [open]);

  const openInTab = () => url && window.open(url, "_blank", "noopener,noreferrer");
  const printFrame = () => {
    const iframe = iframeRef.current;
    try {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    } catch {
      // Fallback: open in a new tab so the user can print from there
      openInTab();
    }
  };
  const downloadPdf = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    setDownloading(true);
    iframe.contentWindow.postMessage({ type: "download-pdf" }, "*");
    // Safety timeout for the "downloading" spinner
    setTimeout(() => setDownloading(false), 20000);
  };
  const reload = () => {
    setReloadKey((k) => k + 1);
  };

  const disabled = status !== "ready";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        dir="rtl"
        className="flex max-h-[92dvh] w-[min(96vw,900px)] max-w-none flex-col gap-3 p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="truncate">{title}</DialogTitle>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted">
          {previewUrl && (
            <iframe
              key={reloadKey}
              ref={iframeRef}
              src={previewUrl}
              title="receipt-preview"
              className="block h-full w-full bg-white"
              onLoad={() => {
                // If the iframe posts no `receipt-ready` (older builds), flip to
                // ready once the document has loaded so buttons enable.
                setStatus((s) => (s === "error" ? s : "ready"));
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
              }}
              onError={() => {
                setStatus("error");
                setErrorMsg("د مخکتنې چوکاټ بار نه شو.");
              }}
            />
          )}

          {status === "loading" && (
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">د رسيد مخکتنه پورته کیږي…</p>
            </div>
          )}

          {status === "error" && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center"
              role="alert"
            >
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div className="max-w-sm space-y-1">
                <p className="text-sm font-medium">د مخکتنې ښودل ناکام شول</p>
                <p className="text-xs text-muted-foreground">{errorMsg}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={reload}>
                  <RefreshCw className="ml-1 h-4 w-4" />
                  بیا هڅه
                </Button>
                <Button size="sm" variant="outline" onClick={openInTab}>
                  <ExternalLink className="ml-1 h-4 w-4" />
                  په نوې ټب کې پرانیزئ
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button onClick={printFrame} disabled={disabled}>
            <Printer className="ml-1 h-4 w-4" />
            چاپ
          </Button>
          <Button variant="secondary" onClick={downloadPdf} disabled={disabled || downloading}>
            {downloading ? (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="ml-1 h-4 w-4" />
            )}
            {downloading ? "PDF جوړیږي…" : "PDF ډاونلوډ"}
          </Button>
          <Button variant="outline" onClick={openInTab}>
            <ExternalLink className="ml-1 h-4 w-4" />
            په نوې ټب کې
          </Button>
          <Button variant="ghost" onClick={onClose}>
            بندول
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
