/**
 * Multi-draft POS store.
 *
 * Drafts live in localStorage so they survive full browser restarts (not
 * just an in-tab session). A single "active" draft id points at the draft
 * that /pos is currently editing; the rest are switchable saved carts
 * (e.g. one per customer or sale type).
 */
import type { CartLine } from "@/components/pos-cart";
import type { PaymentMethod } from "@/components/pos-payment-panel";

export type PosDraftData = {
  cart: CartLine[];
  invoiceDiscount: number;
  paymentMethod: PaymentMethod;
  customerId: string;
  amountPaid: number | "";
};

export type PosDraft = {
  id: string;
  name: string;
  updatedAt: number;
  /** Monotonic write counter, bumped on every persisted mutation.
   *  Used to detect cross-tab edits: if a tab last saw version N and the
   *  store now reports N+1 (or higher) with different data, another tab
   *  wrote the same draft and the local state is stale. */
  version: number;
  data: PosDraftData;
};

type Store = { activeId: string | null; drafts: PosDraft[] };

const KEY = "pos_drafts_v1";
const LEGACY_SESSION_KEY = "pos_draft_v1";
export const POS_DRAFTS_EVENT = "pos-drafts-change";

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(POS_DRAFTS_EVENT));
}

function empty(): Store {
  return { activeId: null, drafts: [] };
}

export function readStore(): Store {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && Array.isArray(parsed.drafts)) return parsed;
    }
    // One-time migration: promote the previous single-session draft.
    const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      const data = JSON.parse(legacy) as PosDraftData;
      const draft: PosDraft = {
        id: crypto.randomUUID(),
        name: "پخوانی مسوده",
        updatedAt: Date.now(),
        version: 1,
        data,
      };

      const store: Store = { activeId: draft.id, drafts: [draft] };
      localStorage.setItem(KEY, JSON.stringify(store));
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      return store;
    }
  } catch {
    /* ignore */
  }
  return empty();
}

function writeStore(s: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
  emit();
}

export function listDrafts(): PosDraft[] {
  return readStore().drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveDraft(): PosDraft | null {
  const s = readStore();
  return s.drafts.find((d) => d.id === s.activeId) ?? null;
}

export function getActiveId(): string | null {
  return readStore().activeId;
}

export function getDraft(id: string): PosDraft | null {
  return readStore().drafts.find((d) => d.id === id) ?? null;
}

/** Deep-equality check for two draft payloads (used for conflict detection). */
export function draftDataEquals(a: PosDraftData, b: PosDraftData): boolean {
  if (a.invoiceDiscount !== b.invoiceDiscount) return false;
  if (a.paymentMethod !== b.paymentMethod) return false;
  if (a.customerId !== b.customerId) return false;
  if (a.amountPaid !== b.amountPaid) return false;
  if (a.cart.length !== b.cart.length) return false;
  for (let i = 0; i < a.cart.length; i++) {
    const x = a.cart[i];
    const y = b.cart[i];
    if (
      x.product_id !== y.product_id ||
      x.quantity !== y.quantity ||
      x.price !== y.price ||
      x.discount !== y.discount
    )
      return false;
  }
  return true;
}

export function isDraftEmpty(d: PosDraftData): boolean {
  return (
    d.cart.length === 0 && !d.invoiceDiscount && d.amountPaid === "" && d.customerId === "walk-in"
  );
}

/** Upsert draft by id. If empty and id present, delete it. Returns active id. */
export function saveActiveDraft(
  data: PosDraftData,
  opts?: { id?: string; name?: string },
): string | null {
  const s = readStore();
  const id = opts?.id ?? s.activeId;
  if (isDraftEmpty(data)) {
    if (id) {
      const next: Store = {
        activeId: s.activeId === id ? null : s.activeId,
        drafts: s.drafts.filter((d) => d.id !== id),
      };
      writeStore(next);
      return next.activeId;
    }
    return s.activeId;
  }
  const now = Date.now();
  if (id && s.drafts.some((d) => d.id === id)) {
    const drafts = s.drafts.map((d) =>
      d.id === id
        ? { ...d, data, updatedAt: now, version: (d.version ?? 0) + 1, name: opts?.name ?? d.name }
        : d,
    );
    writeStore({ activeId: id, drafts });
    return id;
  }
  const newId = id ?? crypto.randomUUID();
  const draft: PosDraft = {
    id: newId,
    name: opts?.name ?? defaultName(),
    updatedAt: now,
    version: 1,
    data,
  };
  writeStore({ activeId: newId, drafts: [...s.drafts, draft] });
  return newId;
}

function defaultName(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `مسوده ${hh}:${mm}`;
}

export function setActive(id: string | null) {
  const s = readStore();
  if (id && !s.drafts.some((d) => d.id === id)) return;
  writeStore({ ...s, activeId: id });
}

export function renameDraft(id: string, name: string) {
  const s = readStore();
  const drafts = s.drafts.map((d) => (d.id === id ? { ...d, name: name.trim() || d.name } : d));
  writeStore({ ...s, drafts });
}

export function deleteDraft(id: string) {
  const s = readStore();
  writeStore({
    activeId: s.activeId === id ? null : s.activeId,
    drafts: s.drafts.filter((d) => d.id !== id),
  });
}

/** Deep-clone an existing draft under a new id, mark it active, return new id. */
export function duplicateDraft(id: string): string | null {
  const s = readStore();
  const src = s.drafts.find((d) => d.id === id);
  if (!src) return null;
  const newId = crypto.randomUUID();
  const clone: PosDraft = {
    id: newId,
    name: `${src.name} (کاپي)`,
    updatedAt: Date.now(),
    version: 1,
    data: {
      ...src.data,
      cart: src.data.cart.map((l) => ({ ...l })),
    },
  };
  writeStore({ activeId: newId, drafts: [...s.drafts, clone] });
  return newId;
}

export function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(POS_DRAFTS_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(POS_DRAFTS_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
