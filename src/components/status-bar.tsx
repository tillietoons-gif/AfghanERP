import { useEffect, useState } from "react";
import { Activity, CloudUpload, Database, Keyboard, Printer, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { toPashtoDigits } from "@/lib/format";
import { openShortcuts } from "@/components/shortcuts-overlay";
import { subscribeSalesQueue } from "@/lib/offline-sales-queue";
import { useOnline } from "@/lib/network-status";

function useAppStatus() {
  const online = useOnline();
  const [queue, setQueue] = useState(0);
  const [salesQueue, setSalesQueue] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const updateQueue = () => {
      try {
        const raw = localStorage.getItem("pos_queue_v1");
        const pending = raw ? (JSON.parse(raw) as unknown) : [];
        setQueue(Array.isArray(pending) ? pending.length : 0);
      } catch {
        setQueue(0);
      }
    };
    updateQueue();
    const queueInterval = window.setInterval(updateQueue, 5_000);
    const clockInterval = window.setInterval(() => setNow(new Date()), 30_000);
    const unsubscribeSales = subscribeSalesQueue((pending) => setSalesQueue(pending.length));
    return () => {
      window.clearInterval(queueInterval);
      window.clearInterval(clockInterval);
      unsubscribeSales();
    };
  }, []);

  return { online, queue, salesQueue, now };
}

function StatusRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-hair py-3 last:border-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

/** Header button and modal for operational status. */
export function StatusButton() {
  const [open, setOpen] = useState(false);
  const { online, queue, salesQueue, now } = useAppStatus();
  const time = toPashtoDigits(
    now.toLocaleTimeString("fa-AF", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kabul",
    }),
  );

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label="د اپلیکیشن حالت"
        title="د اپلیکیشن حالت"
      >
        {online ? (
          <Activity className="h-4 w-4 text-success" />
        ) : (
          <WifiOff className="h-4 w-4 text-destructive" />
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />د اپلیکیشن حالت
            </DialogTitle>
            <DialogDescription>د اتصال، همغږۍ او محلي اپلیکیشن حالت</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border-hair text-sm">
            <StatusRow
              icon={
                online ? (
                  <Wifi className="h-4 w-4 text-success" />
                ) : (
                  <WifiOff className="h-4 w-4 text-destructive" />
                )
              }
              label="انټرنیټ"
              value={online ? "آنلاین" : "آفلاین"}
            />
            <StatusRow
              icon={<Database className="h-4 w-4" />}
              label="د تازه پاتې شویو"
              value={toPashtoDigits(String(queue))}
            />
            <StatusRow
              icon={<CloudUpload className="h-4 w-4" />}
              label="د سینک پاتې پلور"
              value={toPashtoDigits(String(salesQueue))}
            />
            <StatusRow icon={<Printer className="h-4 w-4" />} label="چاپګر" value="چمتو" />
            <StatusRow icon={<Activity className="h-4 w-4" />} label="کابل" value={time} />
            <StatusRow icon={<Activity className="h-4 w-4" />} label="نسخه" value="v1.0" />
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={openShortcuts}>
              <Keyboard className="ml-1 h-4 w-4" />لنډیزونه
            </Button>
            <ThemeToggle compact />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
