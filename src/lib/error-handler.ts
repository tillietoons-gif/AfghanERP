import { toast } from "sonner";
import { reportLovableError } from "./lovable-error-reporting";
import { recordIncident } from "./incident-history";

/**
 * Centralized error handling: normalizes local database / network / generic
 * errors into user-friendly Pashto messages and (optionally) shows a toast.
 */

type AnyErr =
  | Error
  | {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
      status?: number;
      statusCode?: number;
      name?: string;
      errors?: unknown;
      fieldErrors?: unknown;
    }
  | string
  | null
  | undefined;

const PG_CODE_MESSAGES: Record<string, string> = {
  "23505": "دا ریکارډ مخکې شتون لري (نقل)",
  "23503": "اړونده ریکارډ ونه موندل شو",
  "23502": "یو اړین ډګر خالي دی",
  "23514": "د معلوماتو ازموینه ناکامه شوه",
  "22001": "ارزښت له اجازه ورکړل شوي اوږدوالي څخه اوږد دی",
  "22P02": "د ارزښت بڼه ناسمه ده",
  "42501": "تاسو ته اجازه نشته",
  "42P01": "جدول ونه موندل شو",
  PGRST301: "تاسو ته اجازه نشته",
  PGRST116: "ریکارډ ونه موندل شو",
  P0001: "",
};

const HTTP_MESSAGES: Record<number, string> = {
  400: "غوښتنه ناسمه ده",
  401: "تاسو داخل شوي نه یاست",
  403: "تاسو ته اجازه نشته",
  404: "ونه موندل شو",
  408: "د غوښتنې وخت پای ته ورسید",
  409: "شخړه رامنځته شوه",
  422: "ورکړل شوي معلومات نه منل کیږي",
  429: "ډېرې غوښتنې — لږ وروسته بیا هڅه وکړئ",
  500: "د سرور دننه تېروتنه",
  502: "سرور بند دی",
  503: "خدمت شتون نلري",
  504: "د سرور ځواب نه راځي",
};

export interface NormalizedError {
  message: string;
  code?: string;
  status?: number;
  incidentId: string;
  fieldErrors?: Record<string, string>;
  original: unknown;
}

/** Short human-readable correlation id (e.g., ERR-K3F7-2A9X). */
export function generateIncidentId(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `ERR-${chunk(4)}-${chunk(4)}`;
}

/** Extract field-level errors from common validation shapes (Zod, PostgREST, API JSON). */
export function extractFieldErrors(err: unknown): Record<string, string> | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  const out: Record<string, string> = {};

  // Zod flatten shape: { fieldErrors: { field: string[] } }
  const flat = e.fieldErrors as Record<string, unknown> | undefined;
  if (flat && typeof flat === "object") {
    for (const [k, v] of Object.entries(flat)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "string") out[k] = v[0] as string;
      else if (typeof v === "string") out[k] = v;
    }
  }

  // Zod issues shape: { errors: [{ path: [...], message }] } or { issues: [...] }
  const issues = (e.errors ?? (e as { issues?: unknown }).issues) as unknown;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      if (!issue || typeof issue !== "object") continue;
      const i = issue as { path?: unknown; message?: unknown; field?: unknown };
      const pathArr = Array.isArray(i.path) ? i.path : i.field != null ? [i.field] : [];
      const key = pathArr.map(String).join(".");
      if (key && typeof i.message === "string" && !out[key]) out[key] = i.message;
    }
  }

  return Object.keys(out).length ? out : undefined;
}

export function normalizeError(err: AnyErr): NormalizedError {
  const incidentId = generateIncidentId();
  if (err == null) return { message: "نامعلومه تېروتنه", incidentId, original: err };
  if (typeof err === "string") return { message: err, incidentId, original: err };

  const e = err as Record<string, unknown>;
  const code = typeof e.code === "string" ? (e.code as string) : undefined;
  const status =
    (typeof e.status === "number" ? e.status : undefined) ??
    (typeof e.statusCode === "number" ? (e.statusCode as number) : undefined);
  const rawMessage =
    (typeof e.message === "string" && e.message) ||
    (typeof e.details === "string" && (e.details as string)) ||
    (typeof e.hint === "string" && (e.hint as string)) ||
    "";
  const fieldErrors = extractFieldErrors(err);

  const base = { code, status, incidentId, fieldErrors, original: err };

  if (rawMessage.includes("Failed to fetch") || rawMessage.includes("NetworkError")) {
    return { message: "د انټرنټ اړیکه نشته یا ټکنۍ ده", ...base };
  }
  if (code && PG_CODE_MESSAGES[code]) {
    return { message: PG_CODE_MESSAGES[code] || rawMessage || "تېروتنه رامنځته شوه", ...base };
  }
  if (rawMessage === "Invalid login credentials") {
    return { message: "ایمیل یا پټ نوم ناسم دی", ...base };
  }
  if (rawMessage.includes("Email not confirmed")) {
    return { message: "ایمیل تایید شوی نه دی", ...base };
  }
  if (rawMessage.includes("User already registered")) {
    return { message: "دا ایمیل مخکې راجستر شوی دی", ...base };
  }
  if (status && HTTP_MESSAGES[status]) {
    return { message: HTTP_MESSAGES[status], ...base };
  }
  return { message: rawMessage || "تېروتنه رامنځته شوه", ...base };
}

export interface HandleErrorOptions {
  context?: string;
  silent?: boolean;
  meta?: Record<string, unknown>;
  /** Show the incident details dialog instead of / in addition to a toast. */
  showDetails?: boolean;
  /** Optional retry handler wired into toast + details dialog. */
  onRetry?: () => void;
}

// Lightweight event bus so a global <ErrorDetailsHost /> can render the modal
// without every call site needing to plumb state.
type DetailsListener = (payload: {
  error: NormalizedError;
  context?: string;
  onRetry?: () => void;
}) => void;
const detailsListeners = new Set<DetailsListener>();
export function subscribeErrorDetails(fn: DetailsListener): () => void {
  detailsListeners.add(fn);
  return () => detailsListeners.delete(fn);
}
export function openErrorDetails(
  error: NormalizedError,
  opts: { context?: string; onRetry?: () => void } = {},
) {
  detailsListeners.forEach((l) => l({ error, ...opts }));
}

/** Broadcast that React Query has scheduled an automatic retry for a given incidentId. */
export type RetryScheduledPayload = { incidentId: string; delayMs: number; attempt: number };
type RetryScheduledListener = (p: RetryScheduledPayload) => void;
const retryScheduledListeners = new Set<RetryScheduledListener>();
export function subscribeRetryScheduled(fn: RetryScheduledListener): () => void {
  retryScheduledListeners.add(fn);
  return () => retryScheduledListeners.delete(fn);
}
export function emitRetryScheduled(p: RetryScheduledPayload) {
  retryScheduledListeners.forEach((l) => l(p));
}

export function handleError(err: unknown, opts: HandleErrorOptions = {}): NormalizedError {
  const n = normalizeError(err as AnyErr);
  // eslint-disable-next-line no-console
  console.error("[error]", n.incidentId, opts.context ?? "", n.message, n.original);
  reportLovableError(err, {
    context: opts.context,
    code: n.code,
    status: n.status,
    incidentId: n.incidentId,
    fieldErrors: n.fieldErrors,
    ...opts.meta,
  });
  try {
    recordIncident(n, opts.context);
  } catch {
    /* history is best-effort */
  }

  if (opts.showDetails && typeof window !== "undefined") {
    openErrorDetails(n, { context: opts.context, onRetry: opts.onRetry });
  } else if (!opts.silent && typeof window !== "undefined") {
    const msg = opts.context ? `${opts.context}: ${n.message}` : n.message;
    toast.error(msg, {
      description: `پېښه: ${n.incidentId}`,
      action: {
        label: "توضیحات",
        onClick: () => openErrorDetails(n, { context: opts.context, onRetry: opts.onRetry }),
      },
    });
  }
  return n;
}

/** Wrap an async op; returns [data, error]. Never throws. */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  opts: HandleErrorOptions = {},
): Promise<[T | null, NormalizedError | null]> {
  try {
    const data = await fn();
    return [data, null];
  } catch (err) {
    return [null, handleError(err, opts)];
  }
}

/* ------------------------------------------------------------------ */
/* Form error mapper                                                   */
/* ------------------------------------------------------------------ */

export interface FormErrorMapping {
  /** Field-level messages keyed by form field name. */
  fields: Record<string, string>;
  /** Non-field root-level message (validation summary or API failure). */
  formMessage?: string;
  /** The normalized error, useful for reporting / details dialog. */
  normalized: NormalizedError;
}

export interface MapApiErrorToFormOptions<TFieldName extends string = string> {
  /** Map API field name → form field name (e.g. { email_address: "email" }). */
  fieldMap?: Partial<Record<string, TFieldName>>;
  /** Restrict which fields may receive errors; unknowns fall into formMessage. */
  allowedFields?: readonly TFieldName[];
  /** Context label forwarded to handleError for logging + incident id. */
  context?: string;
  /** Show incident details dialog automatically when there are no field-level matches. */
  showDetailsOnGlobal?: boolean;
}

/**
 * Convert an API/validation error into per-field messages plus a form-level
 * message, while ALSO routing the error through the global error handler so
 * logging, reporting, and the incident id stay consistent.
 *
 * Typical react-hook-form usage:
 *
 *   const mapped = mapApiErrorToForm(err, { context: "پروفایل خوندي کول" });
 *   for (const [field, message] of Object.entries(mapped.fields)) {
 *     form.setError(field as never, { type: "server", message });
 *   }
 *   if (mapped.formMessage) form.setError("root.serverError", { message: mapped.formMessage });
 */
export function mapApiErrorToForm<TFieldName extends string = string>(
  err: unknown,
  opts: MapApiErrorToFormOptions<TFieldName> = {},
): FormErrorMapping {
  const normalized = handleError(err, {
    context: opts.context,
    // A form is already going to show inline errors — don't double-toast unless
    // we fall back to a global message.
    silent: true,
  });

  const raw = normalized.fieldErrors ?? {};
  const fields: Record<string, string> = {};
  const unmapped: string[] = [];

  for (const [apiKey, message] of Object.entries(raw)) {
    const mapped = (opts.fieldMap?.[apiKey] as string | undefined) ?? apiKey;
    if (opts.allowedFields && !opts.allowedFields.includes(mapped as TFieldName)) {
      unmapped.push(message);
      continue;
    }
    fields[mapped] = message;
  }

  const hasFieldErrors = Object.keys(fields).length > 0;
  const formMessage = hasFieldErrors && unmapped.length === 0 ? undefined : normalized.message;

  if (!hasFieldErrors && opts.showDetailsOnGlobal) {
    openErrorDetails(normalized, { context: opts.context });
  } else if (!hasFieldErrors) {
    // Surface a toast because the form itself has nothing to render.
    toast.error(opts.context ? `${opts.context}: ${normalized.message}` : normalized.message, {
      description: `پېښه: ${normalized.incidentId}`,
    });
  }

  return { fields, formMessage, normalized };
}
