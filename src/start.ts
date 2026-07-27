import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";

// In-process fingerprint dedupe so a crash loop can't flood error_reports.
const RECENT_ERROR_WINDOW_MS = 60_000;
const recentErrorFingerprints = new Map<string, number>();

async function logServerError(error: unknown, request: Request | undefined) {
  try {
    const err = error as { message?: string; stack?: string; name?: string };
    const message = (err?.message || err?.name || String(error) || "Unknown server error").slice(
      0,
      2000,
    );
    const stack = (err?.stack ?? "").slice(0, 8000) || null;
    const topFrame = (stack ?? "").split("\n").slice(0, 3).join("|");
    const raw = `server_function::${message}::${topFrame}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
    const fingerprint = `srv_${(hash >>> 0).toString(16)}`;

    // Dedupe identical errors within a rolling window.
    const now = Date.now();
    for (const [fp, ts] of recentErrorFingerprints) {
      if (now - ts > RECENT_ERROR_WINDOW_MS) recentErrorFingerprints.delete(fp);
    }
    const lastSeen = recentErrorFingerprints.get(fingerprint);
    if (lastSeen && now - lastSeen < RECENT_ERROR_WINDOW_MS) return;
    recentErrorFingerprints.set(fingerprint, now);

    console.error("[server-error]", fingerprint, message, request?.url ?? "");
  } catch {
    // Never let the reporter itself throw.
  }
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    let req: Request | undefined;
    try {
      req = getRequest();
    } catch {
      /* not in request scope */
    }
    await logServerError(error, req);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
