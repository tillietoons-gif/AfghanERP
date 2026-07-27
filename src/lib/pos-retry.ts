import type { NormalizedError } from "./error-handler";

/**
 * Retry descriptor persisted to localStorage so the POS incident banner can
 * still offer a "Retry" action after a page refresh. Only barcode-driven scan
 * retries survive a reload — save retries depend on the in-memory cart and
 * are intentionally not persisted.
 */
export type PosRetryDescriptor =
  { kind: "scan"; code: string; keepScannerOpen?: boolean } | { kind: "save" };

export interface PosPersistedIncident {
  descriptor: PosRetryDescriptor;
  error: NormalizedError;
  savedAt: number;
}

export const POS_INCIDENT_STORAGE_KEY = "pos.lastIncident.v1";
// After this window the persisted incident is treated as stale and ignored.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Storage abstraction so tests can inject an in-memory backend. The default
 * reader picks up `globalThis.localStorage` at call time — no browser env
 * required for tree-shaking or SSR.
 */
export interface PosIncidentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): PosIncidentStorage | null {
  try {
    const ls = (globalThis as { localStorage?: PosIncidentStorage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function loadPersistedIncident(
  storage?: PosIncidentStorage | null,
): PosPersistedIncident | null {
  const s = storage ?? defaultStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(POS_INCIDENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosPersistedIncident;
    if (!parsed?.descriptor || !parsed?.error?.incidentId) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      s.removeItem(POS_INCIDENT_STORAGE_KEY);
      return null;
    }
    // Only scan descriptors are meaningful after a reload — drop save descriptors.
    if (parsed.descriptor.kind !== "scan") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedIncident(
  input: { descriptor: PosRetryDescriptor; error: NormalizedError },
  storage?: PosIncidentStorage | null,
): void {
  const s = storage ?? defaultStorage();
  if (!s) return;
  // Only persist scan retries — save state cannot be reliably rehydrated.
  if (input.descriptor.kind !== "scan") return;
  try {
    const payload: PosPersistedIncident = { ...input, savedAt: Date.now() };
    s.setItem(POS_INCIDENT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / disabled — ignore */
  }
}

export function clearPersistedIncident(storage?: PosIncidentStorage | null): void {
  const s = storage ?? defaultStorage();
  if (!s) return;
  try {
    s.removeItem(POS_INCIDENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** In-memory Storage-shaped helper for tests. */
export function createMemoryStorage(): PosIncidentStorage & {
  snapshot: () => Record<string, string>;
} {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    snapshot: () => Object.fromEntries(map),
  };
}
