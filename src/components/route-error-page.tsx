import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, Copy, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { normalizeError } from "@/lib/error-handler";
import { recordIncident } from "@/lib/incident-history";
import { restorePreservedInputs } from "@/lib/form-preservation";

/**
 * Shared errorComponent for per-route boundaries. Shows the normalized message,
 * the incident id, and a Retry action that re-runs the route loader via
 * `router.invalidate()` + `reset()` — invalidate alone re-fetches data but
 * doesn't clear the boundary; reset alone clears UI but doesn't re-run the
 * loader.
 */
export function RouteErrorPage({
  error,
  reset,
  context,
}: {
  error: Error;
  reset: () => void;
  context?: string;
}) {
  const router = useRouter();
  const normalized = useMemo(() => normalizeError(error as unknown as never), [error]);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    recordIncident(normalized, context);
    // Move focus to the Retry action so keyboard users land on the primary
    // recovery control instead of being stranded on whatever had focus when
    // the boundary caught the error.
    retryBtnRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized.incidentId]);

  const copy = async () => {
    const payload = [
      `Incident: ${normalized.incidentId}`,
      context ? `Context: ${context}` : null,
      normalized.code ? `Code: ${normalized.code}` : null,
      normalized.status != null ? `Status: ${normalized.status}` : null,
      `Message: ${normalized.message}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast.success("پېښه کاپي شوه");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("کاپي ونه شو");
    }
  };

  return (
    <div dir="rtl" className="flex min-h-[60vh] items-center justify-center p-4">
      <Card
        className="w-full max-w-lg space-y-4 p-6 text-center"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex justify-center">
          <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">{context ?? "پاڼه بار نشوه"}</h1>
        <p className="text-sm text-muted-foreground">{normalized.message}</p>
        <p className="text-xs text-muted-foreground">
          پېښه: <span className="font-mono">{normalized.incidentId}</span>
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            ref={retryBtnRef}
            disabled={retrying}
            aria-busy={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                reset();
                await router.invalidate();
                // Rehydrate values the user typed before the boundary caught,
                // and return focus to the last input they were editing.
                restorePreservedInputs();
              } finally {
                setRetrying(false);
              }
            }}
            aria-label="بیا هڅه وکړئ او ستاسو معلومات بېرته راولئ"
          >
            <RotateCcw className={"ml-1 h-4 w-4" + (retrying ? " animate-spin" : "")} />
            {retrying ? "بیا هڅه کیږي…" : "بیا هڅه"}
          </Button>
          <Button variant="outline" onClick={copy} aria-label="پېښه کاپي کړئ">
            <Copy className="ml-1 h-4 w-4" />
            {copied ? "کاپي شوه" : "پېښه کاپي"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.navigate({ to: "/" })}
            aria-label="کور ته لاړ شئ"
          >
            <Home className="ml-1 h-4 w-4" />
            کور
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Factory that curries `context` into a route `errorComponent`. */
export function makeRouteErrorComponent(context: string) {
  return function BoundErrorComponent(props: { error: Error; reset: () => void }) {
    return <RouteErrorPage {...props} context={context} />;
  };
}
