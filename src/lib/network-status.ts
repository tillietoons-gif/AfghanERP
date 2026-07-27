import { useEffect, useState } from "react";

/**
 * Thin wrapper around `navigator.onLine` + the `online`/`offline` events with
 * an SSR-safe React hook. All app-level offline UI (banner, POS queue) reads
 * from here so there's one source of truth.
 */
type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let installed = false;

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("online", () => listeners.forEach((l) => l(true)));
  window.addEventListener("offline", () => listeners.forEach((l) => l(false)));
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function subscribeOnline(fn: Listener): () => void {
  install();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => isOnline());
  useEffect(() => subscribeOnline(setOnline), []);
  return online;
}

/** True if a normalized/raw error is a browser network failure. */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === "string"
      ? err
      : typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : "";
  return /Failed to fetch|NetworkError|network|offline|ECONN|ETIMEDOUT/i.test(msg);
}
