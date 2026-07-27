import { useEffect, useState } from "react";
import { Wifi, WifiOff, Printer, Database, Activity, Keyboard, CloudUpload } from "lucide-react";
import { toPashtoDigits } from "@/lib/format";
import { ThemeToggle } from "@/components/theme-toggle";
import { openShortcuts } from "@/components/shortcuts-overlay";
import { subscribeSalesQueue } from "@/lib/offline-sales-queue";

/**
 * Bottom status strip: connectivity, pending queue, printer, theme, shortcuts, clock.
 */
export function StatusBar() {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState(0);
  const [salesQueue, setSalesQueue] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    const q = () => {
      try {
        const raw = localStorage.getItem("pos_queue_v1");
        if (!raw) return setQueue(0);
        const arr = JSON.parse(raw) as unknown;
        setQueue(Array.isArray(arr) ? arr.length : 0);
      } catch {
        setQueue(0);
      }
    };
    q();
    const iv = setInterval(q, 5_000);
    const clk = setInterval(() => setNow(new Date()), 30_000);
    const unsubSales = subscribeSalesQueue((q) => setSalesQueue(q.length));
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
      clearInterval(iv);
      clearInterval(clk);
      unsubSales();
    };
  }, []);

  const time = toPashtoDigits(
    now.toLocaleTimeString("fa-AF", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kabul",
    }),
  );

  return (
    <div
      dir="rtl"
      className="hidden h-8 items-center justify-between gap-4 border-t border-border-hair bg-surface-1 px-3 text-[11px] text-muted-foreground md:flex"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          {online ? (
            <Wifi className="h-3 w-3 text-success" />
          ) : (
            <WifiOff className="h-3 w-3 text-destructive" />
          )}
          {online ? "آنلاین" : "آفلاین"}
        </span>
        <span className="opacity-40">•</span>
        <span className="inline-flex items-center gap-1.5">
          <Database className="h-3 w-3 opacity-70" /> د تازه پاتې شویو:{" "}
          <span className="font-mono">{toPashtoDigits(String(queue))}</span>
        </span>
        {salesQueue > 0 && (
          <>
            <span className="opacity-40">•</span>
            <span
              className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400"
              title="پلورل چې لاهم همغږي شوي نه دي"
            >
              <CloudUpload className="h-3 w-3" /> د سینک پاتې:{" "}
              <span className="font-mono">{toPashtoDigits(String(salesQueue))}</span>
            </span>
          </>
        )}
        <span className="opacity-40">•</span>
        <span className="inline-flex items-center gap-1.5">
          <Printer className="h-3 w-3 opacity-70" /> چاپګر چمتو
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openShortcuts}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-surface-2 hover:text-foreground"
          aria-label="د کیبورډ لنډیزونه"
          title="Shift + ؟"
        >
          <Keyboard className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">لنډیزونه</span>
          <span className="kbd">?</span>
        </button>
        <ThemeToggle compact />
        <span className="opacity-40">•</span>
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-primary" />
          کابل • <span className="font-mono">{time}</span>
        </span>
        <span className="opacity-40">•</span>
        <span className="font-mono opacity-60">v1.0</span>
      </div>
    </div>
  );
}
