import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { listLocalSales } from "@/lib/local-store";

type PaperSize = "80mm" | "A4";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Sequentially loads each sale's print route inside a hidden iframe with
 * ?autoPdf=1&paper=X. The print route generates the PDF and posts back a
 * `batch-pdf-done` message. We wait for each before moving to the next so
 * browsers don't collapse the downloads.
 */
export function BatchReceiptsDialog({ open, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [paper, setPaper] = useState<PaperSize>("80mm");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data as { type?: string; ok?: boolean } | null;
      if (d && d.type === "batch-pdf-done") {
        resolverRef.current?.(!!d.ok);
        resolverRef.current = null;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!open) {
      setRunning(false);
      setDone(0);
      setTotal(0);
      setCurrent("");
    }
  }, [open]);

  const start = async () => {
    if (from > to) {
      toast.error("د نېټې محدوده سمه نه ده");
      return;
    }
    setRunning(true);
    setDone(0);
    try {
      const list = (await listLocalSales("", 10_000)).filter((sale) => {
        const date = sale.sale_date.slice(0, 10);
        return date >= from && date <= to;
      });
      setTotal(list.length);
      if (list.length === 0) {
        toast.info("په دې محدوده کې کوم پلور نشته");
        setRunning(false);
        return;
      }

      for (const s of list) {
        setCurrent(s.invoice_no);
        const url = `/print/receipt/${s.id}?autoPdf=1&paper=${paper}`;
        const iframe = iframeRef.current;
        if (!iframe) break;
        await new Promise<boolean>((resolve) => {
          resolverRef.current = resolve;
          iframe.src = url;
          // Safety timeout so one bad receipt doesn't block the batch.
          setTimeout(() => {
            if (resolverRef.current === resolve) {
              resolverRef.current = null;
              resolve(false);
            }
          }, 15000);
        });
        setDone((n) => n + 1);
      }
      toast.success("د بیلونو ډاونلوډ بشپړ شو");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      setCurrent("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !running && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />د بیلونو ډله ییز PDF ډاونلوډ
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>له نېټې</Label>
              <Input
                type="date"
                dir="ltr"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={running}
              />
            </div>
            <div className="space-y-1">
              <Label>تر نېټې</Label>
              <Input
                type="date"
                dir="ltr"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={running}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>د پاڼې اندازه</Label>
            <Select
              value={paper}
              onValueChange={(v) => setPaper(v as PaperSize)}
              disabled={running}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="80mm">80mm (تھرمل)</SelectItem>
                <SelectItem value="A4">A4 (رسمي)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(running || done > 0) && total > 0 && (
            <div className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {done} / {total}
                </span>
                {current && (
                  <span className="font-mono" dir="ltr">
                    {current}
                  </span>
                )}
              </div>
              <Progress value={(done / total) * 100} />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            یادونه: ستاسو براوزر به هر بیل جلا PDF کې ډاونلوډ کړي. کیدای شي په لومړي ځل کې د پاپ‌اپ
            اجازه وغواړي.
          </p>

          {/* Hidden worker iframe */}
          <iframe
            ref={iframeRef}
            title="batch-worker"
            style={{
              position: "fixed",
              left: -9999,
              top: -9999,
              width: 800,
              height: 1200,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={start} disabled={running}>
            {running ? (
              <Loader2 className="ml-1 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="ml-1 h-4 w-4" />
            )}
            پیل
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            بندول
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
