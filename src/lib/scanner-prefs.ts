// Scanner preferences + scan history, persisted in localStorage.

export interface ScannerPrefs {
  beep: boolean;
  vibrate: boolean;
  overlay: boolean;
  continuous: boolean;
  preferredCameraId: string;
  cooldownMs: number;
  autoOpenPos: boolean;
  autoOpenPurchase: boolean;
  repeatScanMode: "increment" | "pack";
  scanHistoryPersist: boolean;
  scanHistoryLimit: number;
}

const PREFS_KEY = "scanner.prefs.v1";
const HISTORY_KEY = "scanner.history.v1";
export const HISTORY_MAX = 10;

export const defaultPrefs: ScannerPrefs = {
  beep: true,
  vibrate: true,
  overlay: true,
  continuous: false,
  preferredCameraId: "",
  cooldownMs: 900,
  autoOpenPos: false,
  autoOpenPurchase: false,
  repeatScanMode: "pack",
  scanHistoryPersist: false,
  scanHistoryLimit: 50,
};

export function getScannerPrefs(): ScannerPrefs {
  if (typeof window === "undefined") return defaultPrefs;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs;
    return { ...defaultPrefs, ...(JSON.parse(raw) as Partial<ScannerPrefs>) };
  } catch {
    return defaultPrefs;
  }
}

export function setScannerPrefs(patch: Partial<ScannerPrefs>) {
  const next = { ...getScannerPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("scanner-prefs-change"));
  } catch {
    /* ignore */
  }
  return next;
}

export interface ScanHistoryEntry {
  code: string;
  matched: boolean;
  ts: number;
}

export function getScanHistory(): ScanHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScanHistoryEntry[];
  } catch {
    return [];
  }
}

export function pushScanHistory(entry: ScanHistoryEntry): ScanHistoryEntry[] {
  const cur = getScanHistory();
  // De-dupe consecutive identical codes; refresh timestamp + matched
  const filtered = cur[0]?.code === entry.code ? cur.slice(1) : cur;
  const next = [entry, ...filtered].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearScanHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
