import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScanLine, Camera, X, Keyboard, RotateCw, History, Check, XCircle } from "lucide-react";
import {
  getScannerPrefs,
  setScannerPrefs,
  getScanHistory,
  pushScanHistory,
  clearScanHistory,
  HISTORY_MAX,
  type ScanHistoryEntry,
} from "@/lib/scanner-prefs";

/**
 * onDetected may return a boolean (or Promise<boolean>) indicating whether the scanned
 * code matched a product. The scanner will play audible + visual feedback accordingly.
 * Returning void/undefined is treated as "success" for backward compatibility.
 */
interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void | boolean | Promise<void | boolean>;
  /** Default continuous mode when no user preference has been saved yet. */
  continuous?: boolean;
}

const LAST_BARCODE_KEY = "scanner.lastBarcode";

// ---- audio feedback (WebAudio, no assets) ----
let sharedCtx: AudioContext | null = null;
function beep(kind: "ok" | "err") {
  try {
    if (typeof window === "undefined") return;
    sharedCtx =
      sharedCtx ??
      new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    const ctx = sharedCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (kind === "ok") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.09);
    } else {
      osc.type = "square";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.18);
    }
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === "ok" ? 0.14 : 0.22));
    osc.start();
    osc.stop(ctx.currentTime + (kind === "ok" ? 0.16 : 0.24));
  } catch {
    /* ignore audio failure */
  }
}

export function BarcodeScanner({
  open,
  onClose,
  onDetected,
  continuous: continuousDefault = false,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [manual, setManual] = useState<string>("");
  const [lastCode, setLastCode] = useState<string>("");
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const [lastPersisted, setLastPersisted] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LAST_BARCODE_KEY) || "";
  });
  const [rearmTick, setRearmTick] = useState(0);
  const [prefs, setPrefs] = useState(() => getScannerPrefs());
  // Continuous: use saved pref if present, else the caller's default
  const [continuous, setContinuous] = useState<boolean>(() => {
    const p = getScannerPrefs();
    // If the user has interacted with the toggle before, we keep their pref.
    // We treat `continuous` in prefs as authoritative once written; the default
    // seed already matches `defaultPrefs.continuous`, so first-time users get the
    // caller's default.
    const raw = typeof window !== "undefined" ? localStorage.getItem("scanner.prefs.v1") : null;
    return raw ? p.continuous : continuousDefault;
  });
  const [history, setHistory] = useState<ScanHistoryEntry[]>(() => getScanHistory());

  // Keep prefs live if changed elsewhere (e.g. Settings page)
  useEffect(() => {
    const h = () => setPrefs(getScannerPrefs());
    window.addEventListener("scanner-prefs-change", h);
    return () => window.removeEventListener("scanner-prefs-change", h);
  }, []);

  const toggleContinuous = (v: boolean) => {
    setContinuous(v);
    setScannerPrefs({ continuous: v });
  };

  const persistLast = (code: string) => {
    setLastPersisted(code);
    try {
      localStorage.setItem(LAST_BARCODE_KEY, code);
    } catch {
      /* ignore */
    }
  };

  const flashFeedback = (ok: boolean) => {
    if (prefs.beep) beep(ok ? "ok" : "err");
    if (prefs.overlay) {
      setFlash(ok ? "ok" : "err");
      setTimeout(() => setFlash(null), 350);
    }
    if (prefs.vibrate) {
      try {
        navigator.vibrate?.(ok ? 40 : [60, 60, 60]);
      } catch {
        /* ignore */
      }
    }
  };

  const handleDetected = async (code: string) => {
    setLastCode(code);
    persistLast(code);
    let ok = true;
    try {
      const res = await onDetected(code);
      if (res === false) ok = false;
    } catch {
      ok = false;
    }
    flashFeedback(ok);
    setHistory(pushScanHistory({ code, matched: ok, ts: Date.now() }));
  };

  useEffect(() => {
    if (!open) {
      setManual("");
      setLastCode("");
      setFlash(null);
      return;
    }
    setError("");
    setHistory(getScanHistory());
    let cancelled = false;

    (async () => {
      try {
        const cams = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(cams);
        const savedId = prefs.preferredCameraId;
        const preferred =
          (savedId && cams.find((c) => c.deviceId === savedId)?.deviceId) ||
          cams.find((c) => /back|rear|environment/i.test(c.label))?.deviceId ||
          cams[0]?.deviceId ||
          "";
        setDeviceId(preferred);
      } catch (e) {
        setError((e as Error).message || "کیمرې ته لاسرسی نشته");
      }
    })();

    setTimeout(() => manualRef.current?.focus(), 150);

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Global keyboard shortcuts while dialog is open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "F2") {
        e.preventDefault();
        manualRef.current?.focus();
        manualRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let active = true;
    let cooldown = false;

    reader
      .decodeFromVideoDevice(deviceId || undefined, videoRef.current, (result, err, controls) => {
        if (!active) return;
        controlsRef.current = controls;
        if (result && !cooldown) {
          const code = result.getText();
          if (continuous) {
            cooldown = true;
            setTimeout(
              () => {
                cooldown = false;
              },
              Math.max(200, prefs.cooldownMs),
            );
          } else {
            controls.stop();
          }
          void handleDetected(code);
        }
        void err;
      })
      .catch((e) => setError((e as Error).message || "د سکینر تېروتنه"));

    return () => {
      active = false;
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId, continuous, rearmTick]);

  const submitManual = (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = manual.trim();
    if (!code) return;
    void handleDetected(code);
    setManual("");
    manualRef.current?.focus();
  };

  const retryLast = () => {
    if (!lastPersisted) return;
    void handleDetected(lastPersisted);
  };

  const retryFromHistory = (code: string) => {
    persistLast(code);
    void handleDetected(code);
  };

  const clearHistory = () => {
    clearScanHistory();
    setHistory([]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />د بارکوډ سکینر
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
              <div className="mt-1 text-xs">لاندې کوډ په لاس داخل کړئ.</div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {/* Left column: camera + device controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-xs">
                <Label htmlFor="cont-switch" className="cursor-pointer">
                  پرله پسې سکن (Continuous)
                </Label>
                <Switch id="cont-switch" checked={continuous} onCheckedChange={toggleContinuous} />
              </div>
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[4/3] w-full object-cover"
                  muted
                  playsInline
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-1/3 w-3/4 rounded-lg border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
                {prefs.overlay && flash && (
                  <div
                    className={`pointer-events-none absolute inset-0 animate-in fade-in ${
                      flash === "ok" ? "bg-emerald-500/40" : "bg-red-500/50"
                    }`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold text-white drop-shadow">
                      {flash === "ok" ? "✓" : "✕"}
                    </div>
                  </div>
                )}
                {lastCode && continuous && (
                  <div
                    className={`absolute bottom-2 right-2 rounded px-2 py-1 font-mono text-[11px] text-white ${
                      flash === "err" ? "bg-red-600/90" : "bg-emerald-600/90"
                    }`}
                    dir="ltr"
                  >
                    {flash === "err" ? "✕" : "✓"} {lastCode}
                  </div>
                )}
              </div>
              {devices.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {devices.map((d, idx) => (
                    <Button
                      key={d.deviceId}
                      size="sm"
                      variant={d.deviceId === deviceId ? "default" : "outline"}
                      onClick={() => {
                        setDeviceId(d.deviceId);
                        setScannerPrefs({ preferredCameraId: d.deviceId });
                      }}
                      className="text-xs"
                    >
                      <Camera className="ml-1 h-3 w-3" />
                      {d.label || `کیمره ${idx + 1}`}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Right column: manual entry + history */}
            <div className="space-y-3">
              <div className="rounded-md border p-2">
                <Label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Keyboard className="h-3 w-3" />
                  په لاس داخلول — Enter تایید، Esc بندول، F2 فوکس
                </Label>
                <form onSubmit={submitManual} className="flex gap-2">
                  <Input
                    ref={manualRef}
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="بارکوډ ولیکئ..."
                    className="flex-1 font-mono"
                  />
                  <Button type="submit" size="sm" disabled={!manual.trim()}>
                    تایید
                  </Button>
                </form>
                {lastPersisted && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      وروستی:{" "}
                      <span className="font-mono" dir="ltr">
                        {lastPersisted}
                      </span>
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={retryLast}>
                      <RotateCw className="ml-1 h-3 w-3" />
                      بیا لټون
                    </Button>
                  </div>
                )}
              </div>

              {/* Scan history */}
              <div className="rounded-md border p-2">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <History className="h-3 w-3" />د سکن تاریخچه (تر {HISTORY_MAX} پورې)
                  </span>
                  {history.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={clearHistory}
                    >
                      پاکول
                    </Button>
                  )}
                </div>
                {history.length === 0 ? (
                  <div className="py-2 text-center text-[11px] text-muted-foreground">
                    لا هېڅ سکن نه دی شوی
                  </div>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-auto text-xs">
                    {history.map((h) => (
                      <li
                        key={`${h.code}-${h.ts}`}
                        className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {h.matched ? (
                            <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 shrink-0 text-red-600" />
                          )}
                          <span className="truncate font-mono" dir="ltr" title={h.code}>
                            {h.code}
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          onClick={() => retryFromHistory(h.code)}
                          title="بیا لټون"
                        >
                          <RotateCw className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{continuous ? "پرله پسې سکن — Esc بندول" : "بارکوډ د کادر دننه راولئ"}</span>
            <div className="flex gap-1">
              {error && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setRearmTick((n) => n + 1);
                  }}
                >
                  کیمره بیا
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="ml-1 h-4 w-4" />
                بندول
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
