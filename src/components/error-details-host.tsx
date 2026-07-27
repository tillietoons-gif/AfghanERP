import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, ClipboardList, Timer } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  subscribeErrorDetails,
  subscribeRetryScheduled,
  type NormalizedError,
  type RetryScheduledPayload,
} from "../lib/error-handler";

interface State {
  error: NormalizedError;
  context?: string;
  onRetry?: () => void;
}

export function ErrorDetailsHost() {
  const [state, setState] = useState<State | null>(null);
  const [copied, setCopied] = useState<"" | "msg" | "full">("");
  const [retry, setRetry] = useState<RetryScheduledPayload | null>(null);
  const [remaining, setRemaining] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(
    () =>
      subscribeErrorDetails((p) => {
        setCopied("");
        setRetry(null);
        setRemaining(0);
        setState(p);
      }),
    [],
  );

  useEffect(
    () =>
      subscribeRetryScheduled((p) => {
        // Only react to retries for the currently-displayed incident.
        setState((prev) => {
          if (!prev || prev.error.incidentId !== p.incidentId) return prev;
          setRetry(p);
          setRemaining(Math.ceil(p.delayMs / 1000));
          return prev;
        });
      }),
    [],
  );

  useEffect(() => {
    if (!retry) return;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (tickRef.current) window.clearInterval(tickRef.current);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [retry]);

  const close = () => setState(null);

  if (!state) return null;
  const { error, context, onRetry } = state;

  const shortBlob = [
    `Incident: ${error.incidentId}`,
    context ? `Context: ${context}` : null,
    `Message: ${error.message}`,
    error.code ? `Code: ${error.code}` : null,
    error.status ? `Status: ${error.status}` : null,
    `Time: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const fullBlob = JSON.stringify(
    {
      incidentId: error.incidentId,
      context: context ?? null,
      message: error.message,
      code: error.code ?? null,
      status: error.status ?? null,
      fieldErrors: error.fieldErrors ?? null,
      retry: retry ?? null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      url: typeof window !== "undefined" ? window.location.href : null,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  );

  const doCopy = async (text: string, kind: "msg" | "full") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success("کاپي شو");
    } catch {
      toast.error("کاپي ونه شو");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>د تېروتنې توضیحات</DialogTitle>
          <DialogDescription>
            {context ? `${context} — ` : ""}
            {error.message}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">د پېښې کوډ</span>
            <code className="font-mono text-xs">{error.incidentId}</code>
          </div>
          {error.code ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">کوډ</span>
              <code className="font-mono text-xs">{error.code}</code>
            </div>
          ) : null}
          {error.status ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">HTTP</span>
              <code className="font-mono text-xs">{error.status}</code>
            </div>
          ) : null}
          {error.fieldErrors ? (
            <div className="border-t pt-2">
              <div className="mb-1 text-muted-foreground">د ډګرونو تېروتنې</div>
              <ul className="list-inside list-disc space-y-1">
                {Object.entries(error.fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-mono text-xs">{k}</span>: {v}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {retry ? (
            <div className="flex items-center justify-between border-t pt-2 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Timer className="h-3 w-3" />
                اتومات بیا هڅه (#{retry.attempt})
              </span>
              <span className="font-mono">
                {remaining > 0 ? `${remaining} ثانیې کې` : "روان دی…"}
              </span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => doCopy(shortBlob, "msg")}>
              <Copy className="ms-2 h-4 w-4" />
              {copied === "msg" ? "کاپي شو" : "پیغام کاپي"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => doCopy(fullBlob, "full")}>
              <ClipboardList className="ms-2 h-4 w-4" />
              {copied === "full" ? "کاپي شو" : "بشپړ توضیحات کاپي"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              تړل
            </Button>
            {onRetry ? (
              <Button
                size="sm"
                onClick={() => {
                  onRetry();
                  close();
                }}
              >
                <RefreshCw className="ms-2 h-4 w-4" />
                بیا هڅه
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
