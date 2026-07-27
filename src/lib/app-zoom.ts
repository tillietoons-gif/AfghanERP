const ZOOM_KEY = "app.display.zoom.v1";
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 75;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;
const ZOOM_EVENT = "app:zoom-change";

function normalizeZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value / ZOOM_STEP) * ZOOM_STEP));
}

export function getAppZoom(): number {
  if (typeof window === "undefined") return DEFAULT_ZOOM;
  try {
    return normalizeZoom(Number(localStorage.getItem(ZOOM_KEY)) || DEFAULT_ZOOM);
  } catch {
    return DEFAULT_ZOOM;
  }
}

export function setAppZoom(value: number): number {
  const zoom = normalizeZoom(value);
  if (typeof document !== "undefined") {
    document.documentElement.style.removeProperty("zoom");
    document.documentElement.style.setProperty("--app-zoom", String(zoom / 100));
  }
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      /* Storage may be unavailable. */
    }
    window.dispatchEvent(new CustomEvent<number>(ZOOM_EVENT, { detail: zoom }));
  }
  return zoom;
}

export function installAppZoom(): () => void {
  setAppZoom(getAppZoom());

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const currentZoom = getAppZoom();
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setAppZoom(currentZoom + ZOOM_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setAppZoom(currentZoom - ZOOM_STEP);
    } else if (event.key === "0") {
      event.preventDefault();
      setAppZoom(DEFAULT_ZOOM);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

export const APP_ZOOM = { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, ZOOM_EVENT, ZOOM_STEP };