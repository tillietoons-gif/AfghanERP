// Production error monitoring — client-side capture + local persistence.

import { createLocalErrorReport } from "@/lib/local-store";

export type ErrorSource =
  "react_boundary" | "window_error" | "unhandled_rejection" | "server_function" | "manual";

export type ErrorSeverity = "info" | "warning" | "error" | "fatal";

export interface ReportInput {
  error: unknown;
  source: ErrorSource;
  severity?: ErrorSeverity;
  route?: string;
  httpStatus?: number;
  context?: Record<string, unknown>;
}

// Per-fingerprint throttling to avoid flooding the table when a
// component crashes in a render loop.
const THROTTLE_MS = 30_000;
const sentAt = new Map<string, number>();

function normalizeMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "Unknown error";
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return String(err);
  }
}

function normalizeStack(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) return err.stack.slice(0, 8000);
  return undefined;
}

// Fingerprint = source + first stack frame + message (stable across sessions).
async function fingerprintOf(source: ErrorSource, message: string, stack?: string) {
  const topFrame = (stack ?? "").split("\n").slice(0, 3).join("|");
  const raw = `${source}::${message}::${topFrame}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 24);
  }
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return `hash_${(h >>> 0).toString(16)}`;
}

export async function reportError(input: ReportInput): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const message = normalizeMessage(input.error).slice(0, 2000);
    const stack = normalizeStack(input.error);
    const fingerprint = await fingerprintOf(input.source, message, stack);

    const now = Date.now();
    const last = sentAt.get(fingerprint) ?? 0;
    if (now - last < THROTTLE_MS) return;
    sentAt.set(fingerprint, now);

    await createLocalErrorReport({
      fingerprint,
      message,
      stack: stack ?? null,
      source: input.source,
      severity: input.severity ?? "error",
      route: input.route ?? window.location.pathname,
      url: window.location.href,
      user_agent: navigator.userAgent,
      http_status: input.httpStatus ?? null,
      context: JSON.stringify(input.context ?? {}),
    });
  } catch {
    // Never let the reporter itself throw.
  }
}

let installed = false;

/** Attach global handlers. Safe to call multiple times. */
export function installErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error ?? new Error((event as ErrorEvent).message);
    void reportError({
      error: err,
      source: "window_error",
      context: {
        filename: (event as ErrorEvent).filename,
        lineno: (event as ErrorEvent).lineno,
        colno: (event as ErrorEvent).colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    void reportError({
      error: (event as PromiseRejectionEvent).reason,
      source: "unhandled_rejection",
    });
  });
}
