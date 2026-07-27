/**
 * Global keyboard-shortcut registry.
 *
 * Handlers register their combos so we can:
 *   - detect duplicate bindings across the app (same combo + overlapping scope)
 *   - power the "shortcuts overlay" with a live list of active bindings
 *   - centralize the "is the user typing?" guard so shortcuts don't fire
 *     while focus is inside inputs, textareas, or contenteditable regions
 *
 * The registry is intentionally lightweight — it doesn't dispatch handlers.
 * Existing keydown listeners keep their logic; they just call
 * `registerShortcut` on mount and `isTypingTarget` inside their handler.
 */
import { toast } from "sonner";

export type ShortcutScope = "global" | "pos" | "reports" | "dialog";

export interface ShortcutBinding {
  id: string;
  combo: string; // canonical "Alt+U", "Ctrl+F", "g d", "F9"
  scope: ShortcutScope;
  description?: string;
}

type Entry = ShortcutBinding & { registeredAt: number };

const bindings = new Map<string, Entry[]>(); // key = `${scope}::${combo}`
const seenConflicts = new Set<string>();

function keyFor(combo: string, scope: ShortcutScope) {
  return `${scope}::${combo.toLowerCase()}`;
}

/** Return the current list of bindings across every scope. */
export function listShortcuts(): ShortcutBinding[] {
  return Array.from(bindings.values()).flat();
}

/**
 * Register a shortcut binding. Returns a cleanup function.
 * If a colliding binding is registered — same combo in the same scope, or
 * either side declared `global` — a dev-visible warning + one-shot toast fire.
 */
export function registerShortcut(b: ShortcutBinding): () => void {
  const entry: Entry = { ...b, registeredAt: Date.now() };
  const scopes: ShortcutScope[] = b.scope === "global" ? ["global"] : ["global", b.scope];

  // Look for conflicts against every relevant scope key.
  for (const s of scopes) {
    const k = keyFor(b.combo, s);
    const existing = bindings.get(k) ?? [];
    for (const other of existing) {
      if (other.id === b.id) continue;
      const conflictKey = [b.combo, other.id, b.id].sort().join("|");
      if (seenConflicts.has(conflictKey)) continue;
      seenConflicts.add(conflictKey);
      const msg = `Shortcut conflict: "${b.combo}" is bound by both "${other.id}" (${other.scope}) and "${b.id}" (${b.scope}).`;
      // eslint-disable-next-line no-console
      console.warn("[shortcuts]", msg, { existing: other, incoming: b });
      if (import.meta.env.DEV) {
        toast.warning("د کیبورډ شارټکټ ټکر", {
          description: `"${b.combo}" — ${other.description ?? other.id} ↔ ${b.description ?? b.id}`,
          duration: 6000,
        });
      }
    }
  }

  const primaryKey = keyFor(b.combo, b.scope);
  const list = bindings.get(primaryKey) ?? [];
  list.push(entry);
  bindings.set(primaryKey, list);

  return () => {
    const cur = bindings.get(primaryKey);
    if (!cur) return;
    const next = cur.filter((e) => e.id !== b.id);
    if (next.length === 0) bindings.delete(primaryKey);
    else bindings.set(primaryKey, next);
  };
}

/**
 * True when the event target is an input-like surface where typing should
 * take precedence over global shortcuts. Also treats `role="textbox"`,
 * `combobox`, and elements with `data-shortcut-typing="true"` as typing.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  if (el.getAttribute?.("data-shortcut-typing") === "true") return true;
  return false;
}
