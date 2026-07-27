import type { NormalizedError } from "./error-handler";

/**
 * Rolling log of recent normalized incidents, persisted to localStorage so the
 * /incidents page can show a history across sessions.
 */
export interface IncidentRecord {
  incidentId: string;
  message: string;
  code?: string;
  status?: number;
  context?: string;
  fieldErrors?: Record<string, string>;
  at: number;
}

const KEY = "incident.history.v1";
const MAX = 100;

type Listener = (records: IncidentRecord[]) => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function listIncidents(): IncidentRecord[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IncidentRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordIncident(err: NormalizedError, context?: string): void {
  const s = storage();
  if (!s) return;
  const rec: IncidentRecord = {
    incidentId: err.incidentId,
    message: err.message,
    code: err.code,
    status: err.status,
    context,
    fieldErrors: err.fieldErrors,
    at: Date.now(),
  };
  const next = [rec, ...listIncidents().filter((r) => r.incidentId !== rec.incidentId)].slice(
    0,
    MAX,
  );
  try {
    s.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l(next));
}

export function clearIncidents(): void {
  const s = storage();
  if (s) {
    try {
      s.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l([]));
}

export function subscribeIncidents(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function formatIncidentDetails(rec: IncidentRecord): string {
  const lines: string[] = [
    `Incident: ${rec.incidentId}`,
    `When: ${new Date(rec.at).toISOString()}`,
    `Message: ${rec.message}`,
  ];
  if (rec.context) lines.push(`Context: ${rec.context}`);
  if (rec.code) lines.push(`Code: ${rec.code}`);
  if (rec.status != null) lines.push(`Status: ${rec.status}`);
  if (rec.fieldErrors && Object.keys(rec.fieldErrors).length) {
    lines.push("Fields:");
    for (const [k, v] of Object.entries(rec.fieldErrors)) lines.push(`  - ${k}: ${v}`);
  }
  return lines.join("\n");
}
