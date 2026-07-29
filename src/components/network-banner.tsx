import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, X } from "lucide-react";
import { subscribeOnline, isOnline } from "@/lib/network-status";
import { subscribeQueue, drainQueue, type QueuedPosAction } from "@/lib/pos-queue";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "network-banner.dismissed-offline";

function loadDismissedOffline() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissedOffline(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(DISMISS_KEY, "1");
    else window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Global connectivity banner. Renders only when offline OR when the POS queue
 * has pending scans waiting to be flushed. Fixed to the top of the viewport
 * so it never gets hidden behind route content.
 */
export function NetworkBanner() {
  const [online, setOnline] = useState<boolean>(() => isOnline());
  const [queue, setQueue] = useState<QueuedPosAction[]>([]);
  const [dismissedOffline, setDismissedOfflineState] = useState<boolean>(() =>
    loadDismissedOffline(),
  );

  useEffect(() => subscribeOnline(setOnline), []);
  useEffect(() => subscribeQueue(setQueue), []);

  useEffect(() => {
    if (online) {
      updateDismissedOffline(false);
    }
  }, [online]);

  const updateDismissedOffline = (value: boolean) => {
    setDismissedOfflineState(value);
    persistDismissedOffline(value);
  };

  const hasQueue = queue.length > 0;
  if ((online && !hasQueue) || (!online && dismissedOffline)) return null;

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 px-3 py-2 text-sm shadow ${
        online ? "bg-amber-500/95 text-amber-950" : "bg-destructive/95 text-destructive-foreground"
      }`}
    >
      <WifiOff className="h-4 w-4" aria-hidden />
      {!online && <span>آفلاین یاست — بدلونونه به بیرته آنلاین کیدو سره ولېږل شي</span>}
      {online && hasQueue && (
        <span>{queue.length} د پلور سکینونه په قطار کې دي — د بحالۍ په حال کې دي</span>
      )}
      {hasQueue && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2"
          onClick={() => void drainQueue()}
          aria-label="اوس بیا هڅه وکړئ"
        >
          <RefreshCw className="ml-1 h-3 w-3" />
          اوس بیا هڅه
        </Button>
      )}
      {!online && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-current hover:bg-black/10"
          onClick={() => updateDismissedOffline(true)}
          aria-label="د آفلاین خبرتیا پټه کړئ"
          title="پټول"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
