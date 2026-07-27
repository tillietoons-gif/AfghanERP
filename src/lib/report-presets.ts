// Small localStorage helper for saving/reusing report filter presets.
// Each ReportShell page can pass a unique `presetKey` plus a serializable
// filter state (date range, supplier/customer, status, groupBy, etc.).
//
// Cross-tab sync: mutations dispatch a same-tab CustomEvent AND rely on the
// browser's `storage` event for other tabs. Subscribers get notified either way.

const PREFIX = "report-presets:v1:";
const SAME_TAB_EVENT = "report-presets:changed";

export type ReportPreset<T = unknown> = {
  id: string;
  name: string;
  createdAt: string; // ISO
  updatedAt?: string;
  state: T;
};

export function loadPresets<T = unknown>(key: string): ReportPreset<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReportPreset<T>[]) : [];
  } catch {
    return [];
  }
}

function writePresets<T>(key: string, presets: ReportPreset<T>[]) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(presets));
    window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: { key: PREFIX + key } }));
  } catch {
    /* quota / private mode */
  }
}

export function savePreset<T>(key: string, name: string, state: T): ReportPreset<T> {
  const list = loadPresets<T>(key);
  const trimmed = name.trim() || new Date().toLocaleString();
  const existingIndex = list.findIndex((p) => p.name === trimmed);
  const now = new Date().toISOString();
  const preset: ReportPreset<T> = {
    id: existingIndex >= 0 ? list[existingIndex].id : `p_${Date.now().toString(36)}`,
    name: trimmed,
    createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
    updatedAt: now,
    state,
  };
  if (existingIndex >= 0) list[existingIndex] = preset;
  else list.unshift(preset);
  writePresets(key, list.slice(0, 20));
  return preset;
}

export function renamePreset(key: string, id: string, newName: string): boolean {
  const trimmed = newName.trim();
  if (!trimmed) return false;
  const list = loadPresets(key);
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  // Prevent duplicate names.
  if (list.some((p, i) => i !== idx && p.name === trimmed)) return false;
  list[idx] = { ...list[idx], name: trimmed, updatedAt: new Date().toISOString() };
  writePresets(key, list);
  return true;
}

export function deletePreset(key: string, id: string) {
  const list = loadPresets(key).filter((p) => p.id !== id);
  writePresets(key, list);
}

/**
 * Subscribe to preset changes for a given key.
 * Fires when: this tab mutates (via savePreset/rename/delete) OR another tab
 * writes to localStorage (native `storage` event).
 */
export function subscribePresets(key: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fullKey = PREFIX + key;
  const onStorage = (e: StorageEvent) => {
    if (e.key === fullKey || e.key === null) cb();
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<{ key?: string }>).detail;
    if (!detail || detail.key === fullKey) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_TAB_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_TAB_EVENT, onCustom);
  };
}
