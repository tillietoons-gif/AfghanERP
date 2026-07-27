/**
 * Lightweight form-input preservation for route error retries.
 *
 * A global listener snapshots `<input>/<textarea>/<select>` values under the
 * current route into sessionStorage on every change, and records the last
 * focused control. When a route errors, `RouteErrorPage`'s Retry button
 * re-runs the loader and then calls `restorePreservedInputs()` which:
 *   1. Waits for the new route DOM to mount.
 *   2. Dispatches React-compatible `input` / `change` events on each
 *      matching control so component state re-hydrates.
 *   3. Restores focus (and caret position when possible) to the last
 *      focused control.
 *
 * We key snapshots by pathname + `name || id` — the two attributes shadcn's
 * inputs already carry. Fields without either are simply ignored.
 */

const SNAPSHOT_KEY = "form.snapshot.v1";
const FOCUS_KEY = "form.focus.v1";

interface Snapshot {
  path: string;
  values: Record<string, string>;
  at: number;
}
interface FocusRecord {
  path: string;
  selector: string;
  selectionStart?: number;
  selectionEnd?: number;
  at: number;
}

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function ss(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function currentPath(): string {
  return typeof window !== "undefined" ? window.location.pathname : "";
}

function fieldKey(el: Element): string | null {
  const name = el.getAttribute("name");
  const id = el.getAttribute("id");
  const key = name ?? id;
  return key && key.trim() ? key : null;
}

function isFormControl(
  el: EventTarget | null,
): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el || !(el as HTMLElement).tagName) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return false;
  const type = (el as HTMLInputElement).type;
  // Never snapshot sensitive/one-off inputs.
  if (type === "password" || type === "file" || type === "hidden") return false;
  return true;
}

function readSnapshot(): Snapshot | null {
  const s = ss();
  if (!s) return null;
  try {
    const raw = s.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    if (parsed.path !== currentPath()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(next: Snapshot): void {
  const s = ss();
  if (!s) return;
  try {
    s.setItem(SNAPSHOT_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

function readFocus(): FocusRecord | null {
  const s = ss();
  if (!s) return null;
  try {
    const raw = s.getItem(FOCUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FocusRecord;
    if (!parsed) return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    if (parsed.path !== currentPath()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeFocus(next: FocusRecord): void {
  const s = ss();
  if (!s) return;
  try {
    s.setItem(FOCUS_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

function selectorFor(el: Element): string | null {
  const id = el.getAttribute("id");
  if (id) return `#${CSS.escape(id)}`;
  const name = el.getAttribute("name");
  if (name) return `[name="${CSS.escape(name)}"]`;
  return null;
}

/** Install once at app boot; safe to call multiple times. */
let installed = false;
export function installFormPreservation(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const onInput = (e: Event) => {
    const el = e.target;
    if (!isFormControl(el)) return;
    const key = fieldKey(el);
    if (!key) return;
    const path = currentPath();
    const cur = readSnapshot();
    const values = cur && cur.path === path ? { ...cur.values } : {};
    values[key] = el.value;
    writeSnapshot({ path, values, at: Date.now() });
  };

  const onFocusIn = (e: Event) => {
    const el = e.target;
    if (!isFormControl(el)) return;
    const sel = selectorFor(el);
    if (!sel) return;
    const rec: FocusRecord = {
      path: currentPath(),
      selector: sel,
      selectionStart: (el as HTMLInputElement).selectionStart ?? undefined,
      selectionEnd: (el as HTMLInputElement).selectionEnd ?? undefined,
      at: Date.now(),
    };
    writeFocus(rec);
  };

  window.addEventListener("input", onInput, true);
  window.addEventListener("change", onInput, true);
  window.addEventListener("focusin", onFocusIn, true);
}

/**
 * Set a native input's value in a way React's synthetic event system picks up
 * (React overrides the property setter on the prototype).
 */
function setReactValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = desc?.set;
  if (setter) setter.call(el, value);
  else (el as { value: string }).value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Call after a route retry finishes rehydrating. Restores form values that
 * were captured under the current path and focuses the last-focused control.
 */
export function restorePreservedInputs(options?: { attempts?: number; intervalMs?: number }): void {
  if (typeof window === "undefined") return;
  const attempts = options?.attempts ?? 8;
  const intervalMs = options?.intervalMs ?? 60;
  let tries = 0;

  const run = () => {
    tries += 1;
    const snap = readSnapshot();
    const focus = readFocus();
    let restored = 0;

    if (snap) {
      for (const [key, value] of Object.entries(snap.values)) {
        const escaped = CSS.escape(key);
        const el =
          (document.querySelector(`[name="${escaped}"]`) as
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) ??
          (document.getElementById(key) as
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null);
        if (el && el.value !== value) {
          setReactValue(el, value);
          restored += 1;
        }
      }
    }

    if (focus) {
      const el = document.querySelector(focus.selector) as HTMLElement | null;
      if (el && typeof el.focus === "function") {
        el.focus();
        const asInput = el as HTMLInputElement;
        if (
          typeof asInput.setSelectionRange === "function" &&
          focus.selectionStart != null &&
          focus.selectionEnd != null
        ) {
          try {
            asInput.setSelectionRange(focus.selectionStart, focus.selectionEnd);
          } catch {
            /* not supported for this input type */
          }
        }
      }
    }

    // The route may still be streaming in — retry a few times.
    if (restored === 0 && tries < attempts) {
      window.setTimeout(run, intervalMs);
    }
  };

  window.setTimeout(run, intervalMs);
}

/** Test-only reset. */
export function _resetFormPreservationForTests(): void {
  installed = false;
  const s = ss();
  if (s) {
    s.removeItem(SNAPSHOT_KEY);
    s.removeItem(FOCUS_KEY);
  }
}
