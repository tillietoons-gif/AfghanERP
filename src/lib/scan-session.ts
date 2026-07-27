// Scan session log per context ("pos" | "purchase").
// Optionally persists to localStorage when scannerPrefs.scanHistoryPersist is on,
// capped by scannerPrefs.scanHistoryLimit.
import { useEffect, useState } from "react";
import { getScannerPrefs } from "./scanner-prefs";

export type ScanContext = "pos" | "purchase";

export interface ScanEvent {
  id: string;
  code: string;
  matched: boolean;
  productName?: string;
  quantityAdded?: number;
  ts: number;
}

const STORAGE_PREFIX = "scan.session.v1.";
const DEFAULT_MAX = 20;

const stores: Record<ScanContext, ScanEvent[]> = { pos: load("pos"), purchase: load("purchase") };
const listeners: Record<ScanContext, Set<() => void>> = { pos: new Set(), purchase: new Set() };

function load(ctx: ScanContext): ScanEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const prefs = getScannerPrefs();
    if (!prefs.scanHistoryPersist) return [];
    const raw = localStorage.getItem(STORAGE_PREFIX + ctx);
    if (!raw) return [];
    return JSON.parse(raw) as ScanEvent[];
  } catch {
    return [];
  }
}

function persist(ctx: ScanContext) {
  if (typeof window === "undefined") return;
  try {
    const prefs = getScannerPrefs();
    if (!prefs.scanHistoryPersist) {
      localStorage.removeItem(STORAGE_PREFIX + ctx);
      return;
    }
    localStorage.setItem(STORAGE_PREFIX + ctx, JSON.stringify(stores[ctx]));
  } catch {
    /* ignore */
  }
}

function emit(ctx: ScanContext) {
  listeners[ctx].forEach((l) => l());
}

function getMax(): number {
  try {
    const prefs = getScannerPrefs();
    const lim = Number(prefs.scanHistoryLimit) || DEFAULT_MAX;
    return Math.max(5, Math.min(500, lim));
  } catch {
    return DEFAULT_MAX;
  }
}

export function recordScan(ctx: ScanContext, ev: Omit<ScanEvent, "id" | "ts">) {
  const entry: ScanEvent = { ...ev, id: Math.random().toString(36).slice(2), ts: Date.now() };
  stores[ctx] = [entry, ...stores[ctx]].slice(0, getMax());
  persist(ctx);
  emit(ctx);
}

export function clearScanSession(ctx: ScanContext) {
  stores[ctx] = [];
  persist(ctx);
  emit(ctx);
}

export function getScanSession(ctx: ScanContext): ScanEvent[] {
  return stores[ctx];
}

export function useScanSession(ctx: ScanContext): ScanEvent[] {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners[ctx].add(l);
    // React to prefs changes (toggling persistence should reload from storage).
    const onPrefs = () => {
      stores[ctx] = load(ctx);
      // Also re-cap under new limit
      stores[ctx] = stores[ctx].slice(0, getMax());
      persist(ctx);
      l();
    };
    window.addEventListener("scanner-prefs-change", onPrefs);
    return () => {
      listeners[ctx].delete(l);
      window.removeEventListener("scanner-prefs-change", onPrefs);
    };
  }, [ctx]);
  return stores[ctx];
}
