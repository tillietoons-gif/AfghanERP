import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";

import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ShoppingCart, Search, ScanLine, Zap, History, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { money, num } from "@/lib/format";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ScanHistoryPanel } from "@/components/scan-history-panel";
import { ScanFallbackDialog } from "@/components/scan-fallback-dialog";
import { recordScan } from "@/lib/scan-session";
import { getScannerPrefs } from "@/lib/scanner-prefs";
import { getQuickSalePrefs, type QuickSalePrefs } from "@/lib/quick-sale-prefs";
import { applyPosSaleError, type SaleFieldKey } from "@/lib/pos-errors";
import { type NormalizedError } from "@/lib/error-handler";
import {
  loadPersistedIncident,
  savePersistedIncident,
  clearPersistedIncident,
  type PosRetryDescriptor,
} from "@/lib/pos-retry";
import { SaleFieldError } from "@/components/sale-field-error";
import { announceError } from "@/lib/announce";
import { registerShortcut, isTypingTarget } from "@/lib/shortcuts-registry";
import { enqueuePos, registerPosRunner } from "@/lib/pos-queue";
import { PosCart, type CartLine } from "@/components/pos-cart";
import { PosQuickTally } from "@/components/pos-quick-tally";
import { PosPaymentPanel, type PaymentMethod } from "@/components/pos-payment-panel";
import { buildCreateSaleArgs } from "@/lib/pos-sale";
import { validateBarcode } from "@/lib/barcode-validation";
import { logPosEvent } from "@/lib/pos-audit";
import { openReceiptWithRetry } from "@/lib/pos-print";
import { useExternalBarcodeScanner } from "@/lib/external-barcode-scanner";
import { Printer } from "lucide-react";
import {
  getActiveDraft,
  getActiveId,
  getDraft,
  draftDataEquals,
  isDraftEmpty,
  listDrafts,
  saveActiveDraft,
  setActive as setActiveDraft,
  subscribe as subscribeDrafts,
  type PosDraft,
  type PosDraftData,
} from "@/lib/pos-drafts";
import { PosDraftsMenu } from "@/components/pos-drafts-menu";
import { validateDraftCart, type DraftIssue } from "@/lib/pos-draft-validation";
import { announce } from "@/lib/announce";
import { Check as CheckIcon, AlertTriangle, GitMerge } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createLocalSale,
  findLocalProductByCode,
  listLocalCustomers,
  listLocalProducts,
  listLocalTopProducts,
} from "@/lib/local-store";

export const Route = createFileRoute("/pos")({
  component: () => (
    <ProtectedRoute>
      <PosPage />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent("POS"),
});

const QUICK_KEY = "pos_quick_sale_mode";

function PosPage() {
  const navigate = useNavigate();
  const initialDraft = useMemo(() => getActiveDraft(), []);
  const initialData = initialDraft?.data;
  const [activeDraftId, setActiveDraftId] = useState<string | null>(() => getActiveId());
  const [resumedBanner, setResumedBanner] = useState<{ name: string; count: number } | null>(() => {
    if (!initialDraft || isDraftEmpty(initialDraft.data)) return null;
    const count = initialDraft.data.cart.reduce((s, l) => s + l.quantity, 0);
    return { name: initialDraft.name, count };
  });
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>(initialData?.cart ?? []);
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(initialData?.invoiceDiscount ?? 0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialData?.paymentMethod ?? "cash",
  );
  const [customerId, setCustomerId] = useState<string>(initialData?.customerId ?? "walk-in");
  const [amountPaid, setAmountPaid] = useState<number | "">(initialData?.amountPaid ?? "");

  const [scannerOpen, setScannerOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem("scanner.prefs.v1");
      return raw ? Boolean(JSON.parse(raw)?.autoOpenPos) : false;
    } catch {
      return false;
    }
  });
  const [saving, setSaving] = useState(false);
  const [quickMode, setQuickMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(QUICK_KEY) === "1";
  });

  const searchRef = useRef<HTMLInputElement>(null);
  const [qsPrefs, setQsPrefs] = useState<QuickSalePrefs>(() => getQuickSalePrefs());
  const [lastSaleId, setLastSaleId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("pos_last_sale_id");
  });
  const [reprinting, setReprinting] = useState(false);

  const reprintLastReceipt = useCallback(async () => {
    if (!lastSaleId) return;
    setReprinting(true);
    try {
      const ok = await openReceiptWithRetry(`/print/receipt/${lastSaleId}?preview=1`, lastSaleId);
      if (ok) toast.success(t.receiptPrinted);
    } finally {
      setReprinting(false);
    }
  }, [lastSaleId]);

  useEffect(() => {
    const onChange = () => setQsPrefs(getQuickSalePrefs());
    window.addEventListener("quick-sale-prefs-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("quick-sale-prefs-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Persist working cart across navigation AND browser restarts (localStorage).
  // Also syncs to the multi-draft store under the active draft id.
  const draftDirty =
    cart.length > 0 || !!invoiceDiscount || amountPaid !== "" || customerId !== "walk-in";
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    () => initialDraft?.updatedAt ?? null,
  );
  const [lastSeenVersion, setLastSeenVersion] = useState<number>(() => initialDraft?.version ?? 0);
  const [savedTick, setSavedTick] = useState(0);
  const [conflict, setConflict] = useState<PosDraft | null>(null);

  // ---- Undo / Redo stacks (for conflict-accept / draft-switch / duplicate) ----
  // Persisted to sessionStorage so recent undo history survives a page refresh.
  // Cap at 20 entries per stack so storage stays bounded.
  type UndoSnapshot = {
    prevActiveId: string | null;
    prevData: PosDraftData;
    prevSavedAt: number | null;
    prevSeenVer: number;
    label?: string;
    at: number;
  };
  const UNDO_KEY = "pos_undo_stack_v1";
  const REDO_KEY = "pos_redo_stack_v1";
  const MAX_HISTORY = 20;
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const redoStackRef = useRef<UndoSnapshot[]>([]);
  const [undoTop, setUndoTop] = useState<{ label: string; at: number; depth: number } | null>(null);
  const [redoTop, setRedoTop] = useState<{ label: string; at: number; depth: number } | null>(null);
  const persistStacks = useCallback(() => {
    try {
      sessionStorage.setItem(UNDO_KEY, JSON.stringify(undoStackRef.current));
      sessionStorage.setItem(REDO_KEY, JSON.stringify(redoStackRef.current));
    } catch {
      /* ignore */
    }
    const u = undoStackRef.current;
    const r = redoStackRef.current;
    setUndoTop(
      u.length
        ? { label: u[u.length - 1].label ?? "پخوانی حالت", at: u[u.length - 1].at, depth: u.length }
        : null,
    );
    setRedoTop(
      r.length
        ? {
            label: r[r.length - 1].label ?? "بېرته پلي کول",
            at: r[r.length - 1].at,
            depth: r.length,
          }
        : null,
    );
  }, []);
  // Rehydrate stacks on mount.
  useEffect(() => {
    try {
      const u = sessionStorage.getItem(UNDO_KEY);
      const r = sessionStorage.getItem(REDO_KEY);
      if (u)
        undoStackRef.current = (JSON.parse(u) as UndoSnapshot[]).filter((s) => s && s.prevData);
      if (r)
        redoStackRef.current = (JSON.parse(r) as UndoSnapshot[]).filter((s) => s && s.prevData);
      persistStacks();
    } catch {
      /* ignore */
    }
  }, [persistStacks]);
  const currentSnapshot = useCallback(
    (label?: string): UndoSnapshot => ({
      prevActiveId: activeDraftId,
      prevData: { cart, invoiceDiscount, paymentMethod, customerId, amountPaid },
      prevSavedAt: lastSavedAt,
      prevSeenVer: lastSeenVersion,
      label,
      at: Date.now(),
    }),
    [
      activeDraftId,
      cart,
      invoiceDiscount,
      paymentMethod,
      customerId,
      amountPaid,
      lastSavedAt,
      lastSeenVersion,
    ],
  );
  const applySnapshot = useCallback((snap: UndoSnapshot) => {
    setConflict(null);
    setActiveDraft(snap.prevActiveId);
    setActiveDraftId(snap.prevActiveId);
    setCart(snap.prevData.cart);
    setInvoiceDiscount(snap.prevData.invoiceDiscount);
    setPaymentMethod(snap.prevData.paymentMethod);
    setCustomerId(snap.prevData.customerId);
    setAmountPaid(snap.prevData.amountPaid);
    setLastSavedAt(snap.prevSavedAt);
    setLastSeenVersion(snap.prevSeenVer);
  }, []);
  const captureUndo = useCallback(
    (label?: string) => {
      const snap = currentSnapshot(label);
      undoStackRef.current = [...undoStackRef.current, snap].slice(-MAX_HISTORY);
      // Any new action invalidates the redo stack.
      redoStackRef.current = [];
      persistStacks();
    },
    [currentSnapshot, persistStacks],
  );
  const performUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1];
    // Push current state onto redo so we can re-apply.
    redoStackRef.current = [...redoStackRef.current, currentSnapshot(snap.label)].slice(
      -MAX_HISTORY,
    );
    undoStackRef.current = stack.slice(0, -1);
    applySnapshot(snap);
    persistStacks();
    announce(
      `پخوانی حالت بېرته راستون شو${undoStackRef.current.length ? ` (${undoStackRef.current.length} نور شته)` : ""}`,
    );
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [applySnapshot, currentSnapshot, persistStacks]);
  const performRedo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const snap = stack[stack.length - 1];
    undoStackRef.current = [...undoStackRef.current, currentSnapshot(snap.label)].slice(
      -MAX_HISTORY,
    );
    redoStackRef.current = stack.slice(0, -1);
    applySnapshot(snap);
    persistStacks();
    announce("بېرته پلي شو");
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [applySnapshot, currentSnapshot, persistStacks]);
  const offerUndo = useCallback(
    (label: string) => {
      toast.success(label, {
        action: { label: "بېرته راګرځول", onClick: performUndo },
        duration: 8000,
      });
    },
    [performUndo],
  );

  // Debounced autosave: coalesce rapid edits into a single write ~600ms
  // after the last change so we're not thrashing localStorage on every
  // keystroke. The saved-at chip updates only when the write actually
  // lands, so the timestamp always reflects real disk state.
  const AUTOSAVE_MS = 600;
  const autosaveTimer = useRef<number | null>(null);
  const [autosavePending, setAutosavePending] = useState(false);
  const commitAutosave = useCallback(() => {
    const data: PosDraftData = { cart, invoiceDiscount, paymentMethod, customerId, amountPaid };
    const id = saveActiveDraft(data, { id: activeDraftId ?? undefined });
    if (id !== activeDraftId) setActiveDraftId(id);
    if (id) {
      const d = getDraft(id);
      setLastSavedAt(d?.updatedAt ?? Date.now());
      setLastSeenVersion(d?.version ?? 0);
    } else {
      setLastSavedAt(null);
      setLastSeenVersion(0);
    }
    setAutosavePending((wasPending) => {
      if (wasPending) announce("مسوده خوندي شوه");
      return false;
    });
  }, [cart, invoiceDiscount, paymentMethod, customerId, amountPaid, activeDraftId]);
  const saveNow = useCallback(() => {
    if (autosaveTimer.current != null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    commitAutosave();
  }, [commitAutosave]);
  useEffect(() => {
    if (conflict) return;
    if (autosaveTimer.current != null) window.clearTimeout(autosaveTimer.current);
    setAutosavePending((prev) => {
      if (!prev) announce("د خوندي کولو په حال کې…");
      return true;
    });
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      commitAutosave();
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [commitAutosave, conflict]);
  // Flush any pending debounced write on unmount so nothing is lost.
  const flushRef = useRef(commitAutosave);
  flushRef.current = commitAutosave;
  useEffect(
    () => () => {
      if (autosaveTimer.current != null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
        flushRef.current();
      }
    },
    [],
  );

  // Keyboard shortcuts: Alt+U undo, Alt+Shift+U (or Alt+R) redo.
  useEffect(() => {
    const cleanups = [
      registerShortcut({
        id: "pos.undo",
        combo: "Alt+U",
        scope: "pos",
        description: "بېرته راګرځول (Undo)",
      }),
      registerShortcut({
        id: "pos.redo",
        combo: "Alt+Shift+U",
        scope: "pos",
        description: "بیا کارول (Redo)",
      }),
      registerShortcut({
        id: "pos.redo.alt",
        combo: "Alt+R",
        scope: "pos",
        description: "بیا کارول (Redo)",
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "u") {
        if (e.shiftKey) {
          e.preventDefault();
          performRedo();
        } else {
          e.preventDefault();
          performUndo();
        }
      } else if (k === "r") {
        e.preventDefault();
        performRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cleanups.forEach((c) => c());
    };
  }, [performUndo, performRedo]);

  // Tick the "saved X ago" label every 15s.
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = window.setInterval(() => setSavedTick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, [lastSavedAt]);

  // Cross-tab conflict detection: `storage` fires only when another tab
  // writes to localStorage. Same-tab writes use POS_DRAFTS_EVENT and are
  // ignored here so our own autosave doesn't self-trigger.
  useEffect(() => {
    if (!activeDraftId) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "pos_drafts_v1" && e.key !== null) return;
      const remote = getDraft(activeDraftId);
      if (!remote) return;
      if ((remote.version ?? 0) <= lastSeenVersion) return;
      const local: PosDraftData = { cart, invoiceDiscount, paymentMethod, customerId, amountPaid };
      if (draftDataEquals(local, remote.data)) {
        // Remote content matches ours (e.g. rename only). Absorb silently.
        setLastSeenVersion(remote.version ?? 0);
        setLastSavedAt(remote.updatedAt);
        return;
      }
      setConflict(remote);
      announce("د بلې کړکۍ لخوا مسوده بدله شوه", "assertive");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [
    activeDraftId,
    lastSeenVersion,
    cart,
    invoiceDiscount,
    paymentMethod,
    customerId,
    amountPaid,
  ]);

  // Browser-restart / tab-close warning while a draft is active.
  useEffect(() => {
    if (!draftDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draftDirty]);

  // In-app navigation guard.
  useBlocker({
    shouldBlockFn: ({ next }) => draftDirty && next.pathname !== "/pos",
    withResolver: false,
    enableBeforeUnload: false,
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(QUICK_KEY, quickMode ? "1" : "0");
    if (quickMode) {
      if (qsPrefs.forceCash) setPaymentMethod("cash");
      setCustomerId("walk-in");
      if (!qsPrefs.allowDiscounts) setInvoiceDiscount(0);
      setAmountPaid("");
    }
  }, [quickMode, qsPrefs.forceCash, qsPrefs.allowDiscounts]);

  // ---- Draft validation (unavailable / out-of-stock / price changed) ----
  const [draftIssues, setDraftIssues] = useState<DraftIssue[] | null>(null);
  const [issuesDismissed, setIssuesDismissed] = useState(false);
  const runValidation = useCallback(async (lines: CartLine[]) => {
    if (lines.length === 0) {
      setDraftIssues(null);
      return;
    }
    const { issues, fresh } = await validateDraftCart(lines);
    setDraftIssues(issues.length ? issues : null);
    setIssuesDismissed(false);
    setCart((prev) =>
      prev.map((l) => {
        const f = fresh.get(l.product_id);
        return f ? { ...l, stock: f.stock } : l;
      }),
    );
  }, []);
  useEffect(() => {
    if (initialDraft && initialDraft.data.cart.length > 0) {
      void runValidation(initialDraft.data.cart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const applyPriceUpdates = useCallback(() => {
    if (!draftIssues) return;
    const priceMap = new Map<string, number>();
    for (const i of draftIssues)
      if (i.kind === "price_changed") priceMap.set(i.product_id, i.newPrice);
    setCart((prev) =>
      prev.map((l) =>
        priceMap.has(l.product_id) ? { ...l, price: priceMap.get(l.product_id)! } : l,
      ),
    );
    setDraftIssues((prev) => (prev ? prev.filter((i) => i.kind !== "price_changed") : prev));
    toast.success("قیمتونه تازه شول");
  }, [draftIssues]);
  const removeUnavailable = useCallback(() => {
    if (!draftIssues) return;
    const badIds = new Set(
      draftIssues.filter((i) => i.kind === "unavailable").map((i) => i.product_id),
    );
    if (badIds.size === 0) return;
    setCart((prev) => prev.filter((l) => !badIds.has(l.product_id)));
    setDraftIssues((prev) => (prev ? prev.filter((i) => i.kind !== "unavailable") : prev));
    toast.success("نامعلومې توکي لرې شول");
  }, [draftIssues]);

  // Switch to a different saved draft (or clear to a fresh one).
  const switchToDraft = useCallback(
    (id: string | null) => {
      // Snapshot current state so the user can undo an accidental switch/duplicate.
      captureUndo(id === null ? "نوې مسوده پیل شوه" : "د مسودې بدلون");
      setConflict(null);
      setActiveDraft(id);
      setActiveDraftId(id);
      setResumedBanner(null);
      if (!id) {
        setCart([]);
        setInvoiceDiscount(0);
        setPaymentMethod("cash");
        setCustomerId("walk-in");
        setAmountPaid("");
        setDraftIssues(null);
        setLastSavedAt(null);
        setLastSeenVersion(0);
        announce("نوې مسوده پیل شوه");
        offerUndo("نوې مسوده پیل شوه");
        setTimeout(() => searchRef.current?.focus(), 30);
        return;
      }
      const d = getActiveDraft();
      if (!d) return;
      setCart(d.data.cart);
      setInvoiceDiscount(d.data.invoiceDiscount);
      setPaymentMethod(d.data.paymentMethod);
      setCustomerId(d.data.customerId);
      setAmountPaid(d.data.amountPaid);
      setLastSavedAt(d.updatedAt);
      setLastSeenVersion(d.version ?? 0);
      offerUndo(`مسوده "${d.name}" پرانستل شوه`);
      announce(`مسوده ${d.name} پرانستل شوه`);
      setTimeout(() => searchRef.current?.focus(), 30);
      if (d.data.cart.length > 0) void runValidation(d.data.cart);
    },
    [runValidation, captureUndo, offerUndo],
  );

  // Start a fresh draft, keeping the current one saved under its id.
  const startNewDraft = useCallback(() => {
    setConflict(null);
    setActiveDraft(null);
    setActiveDraftId(null);
    setResumedBanner(null);
    setCart([]);
    setInvoiceDiscount(0);
    setPaymentMethod("cash");
    setCustomerId("walk-in");
    setAmountPaid("");
    setDraftIssues(null);
    setLastSavedAt(null);
    setLastSeenVersion(0);
    toast.success("نوې مسوده پیل شوه");
    announce("نوې مسوده پیل شوه");
    setTimeout(() => searchRef.current?.focus(), 30);
  }, []);

  // ---- Conflict resolvers (multi-tab) ----
  const acceptRemoteConflict = useCallback(() => {
    if (!conflict) return;
    captureUndo("د بلې کړکۍ نسخه بارول شوه");
    setCart(conflict.data.cart);
    setInvoiceDiscount(conflict.data.invoiceDiscount);
    setPaymentMethod(conflict.data.paymentMethod);
    setCustomerId(conflict.data.customerId);
    setAmountPaid(conflict.data.amountPaid);
    setLastSavedAt(conflict.updatedAt);
    setLastSeenVersion(conflict.version ?? 0);
    setConflict(null);
    offerUndo("د بلې کړکۍ نسخه بارول شوه");
    announce("د بلې کړکۍ نسخه بارول شوه");
    if (conflict.data.cart.length > 0) void runValidation(conflict.data.cart);
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [conflict, runValidation, captureUndo, offerUndo]);
  const keepLocalConflict = useCallback(() => {
    if (!conflict) return;
    // Accept the remote version number so our next save wins the version race.
    setLastSeenVersion(conflict.version ?? 0);
    setConflict(null);
    // Force a save immediately with current state so the store reflects ours.
    const data: PosDraftData = { cart, invoiceDiscount, paymentMethod, customerId, amountPaid };
    const id = saveActiveDraft(data, { id: activeDraftId ?? undefined });
    if (id) {
      const d = getDraft(id);
      setLastSavedAt(d?.updatedAt ?? Date.now());
      setLastSeenVersion(d?.version ?? 0);
    }
    toast.success("ستاسو نسخه وساتل شوه");
    announce("ستاسو نسخه وساتل شوه");
    setTimeout(() => searchRef.current?.focus(), 30);
  }, [conflict, cart, invoiceDiscount, paymentMethod, customerId, amountPaid, activeDraftId]);

  // ---- Draft keyboard shortcuts ----
  // Alt+D toggles the drafts menu. Alt+1..9 switches to the Nth draft (by
  // menu order, most-recently-updated first). Alt+[ / Alt+] cycle drafts.
  const draftsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [draftsMenuOpen, setDraftsMenuOpen] = useState(false);
  const [allDrafts, setAllDrafts] = useState(() => listDrafts());
  useEffect(() => subscribeDrafts(() => setAllDrafts(listDrafts())), []);
  useEffect(() => {
    const cleanups = [
      registerShortcut({
        id: "pos.drafts.menu",
        combo: "Alt+D",
        scope: "pos",
        description: "د مسودې منو خلاصول",
      }),
      registerShortcut({
        id: "pos.drafts.prev",
        combo: "Alt+[",
        scope: "pos",
        description: "پخوانۍ مسوده",
      }),
      registerShortcut({
        id: "pos.drafts.next",
        combo: "Alt+]",
        scope: "pos",
        description: "راتلونکې مسوده",
      }),
      registerShortcut({
        id: "pos.drafts.switch",
        combo: "Alt+1..9",
        scope: "pos",
        description: "مسوده انتخاب",
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setDraftsMenuOpen((v) => !v);
        return;
      }
      if (e.key === "[" || e.key === "]") {
        if (allDrafts.length === 0) return;
        e.preventDefault();
        const idx = allDrafts.findIndex((d) => d.id === activeDraftId);
        const step = e.key === "]" ? 1 : -1;
        const nextIdx = idx === -1 ? 0 : (idx + step + allDrafts.length) % allDrafts.length;
        switchToDraft(allDrafts[nextIdx].id);
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < allDrafts.length) {
          e.preventDefault();
          switchToDraft(allDrafts[i].id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cleanups.forEach((c) => c());
    };
  }, [allDrafts, activeDraftId, switchToDraft]);

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SaleFieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<NormalizedError | null>(null);
  const clearErrors = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
    setLastError(null);
    clearPersistedIncident();
  }, []);
  const setFieldError = useCallback((key: SaleFieldKey, msg: string) => {
    setFieldErrors((p) => ({ ...p, [key]: msg }));
    toast.error(msg);
    announceError(msg);
  }, []);

  useEffect(() => {
    setFieldErrors((p) => ({ ...p, cart: undefined, scan: undefined }));
  }, [cart.length]);
  useEffect(() => {
    setFieldErrors((p) => ({ ...p, customer: undefined }));
  }, [customerId]);
  useEffect(() => {
    setFieldErrors((p) => ({ ...p, payment: undefined, amountPaid: undefined }));
  }, [paymentMethod, amountPaid]);

  const { data: products } = useQuery({
    queryKey: ["pos-products", query],
    queryFn: () => listLocalProducts(query),
  });

  const { data: topProducts } = useQuery({
    queryKey: ["pos-top-products"],
    enabled: quickMode,
    queryFn: listLocalTopProducts,
  });

  const { data: customers } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: listLocalCustomers,
  });

  const addToCart = (
    p: { id: string; name: string; sale_price: number; stock: number },
    qty = 1,
  ) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        const nextQty = next[idx].quantity + qty;
        if (nextQty > next[idx].stock) {
          toast.error(`${t.insufficientStock}: ${p.name} (${num(next[idx].stock)})`);
          return prev;
        }
        next[idx] = { ...next[idx], quantity: nextQty };
        return next;
      }
      if (Number(p.stock) <= 0) {
        toast.error(`${t.insufficientStock}: ${p.name}`);
        return prev;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          price: Number(p.sale_price),
          quantity: Math.min(qty, Number(p.stock)),
          discount: 0,
          stock: Number(p.stock),
        },
      ];
    });
  };

  const updateLine = (idx: number, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const merged = { ...l, ...patch };
        if (patch.quantity !== undefined && patch.quantity > l.stock) {
          toast.error(`${t.insufficientStock}: ${l.name} (${num(l.stock)})`);
          return { ...merged, quantity: l.stock };
        }
        return merged;
      }),
    );
  };

  const removeLine = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const [fallbackCode, setFallbackCode] = useState<string | null>(null);
  const lastActionRef = useRef<(() => Promise<void> | void) | null>(null);
  const lastDescriptorRef = useRef<PosRetryDescriptor | null>(null);
  const [copiedIncident, setCopiedIncident] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);

  const applySaleError = useCallback((err: unknown, context: string) => {
    const mapped = applyPosSaleError(err, context);
    setFieldErrors((prev) => ({
      ...prev,
      ...(mapped.fields as Partial<Record<SaleFieldKey, string>>),
    }));
    setFormError(mapped.formMessage ?? null);
    setLastError(mapped.normalized);
    return mapped;
  }, []);

  const copyIncident = useCallback(async () => {
    if (!lastError) return;
    const payload = [
      `Incident: ${lastError.incidentId}`,
      lastError.code ? `Code: ${lastError.code}` : null,
      lastError.status ? `Status: ${lastError.status}` : null,
      `Message: ${lastError.message}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedIncident(true);
      toast.success("پېښه کاپي شوه");
      window.setTimeout(() => setCopiedIncident(false), 1500);
    } catch {
      toast.error("کاپي ونه شو");
    }
  }, [lastError]);

  const retryLastAction = useCallback(async () => {
    const action = lastActionRef.current;
    if (!action) return;
    setRetrying(true);
    const prevIncidentId = lastError?.incidentId ?? null;
    try {
      await action();
    } finally {
      setRetrying(false);
    }
    setLastError((curr) => {
      if (curr === null && prevIncidentId !== null) {
        toast.success("بیا هڅه بریالۍ شوه — ستاسو اطلاعات ساتل شوي دي");
      }
      return curr;
    });
  }, [lastError]);

  useEffect(() => {
    const persisted = loadPersistedIncident();
    if (!persisted || persisted.descriptor.kind !== "scan") return;
    const code = persisted.descriptor.code;
    const keep = persisted.descriptor.keepScannerOpen;
    setLastError(persisted.error);
    setFormError(persisted.error.message);
    lastDescriptorRef.current = persisted.descriptor;
    lastActionRef.current = () => {
      void lookupBarcode(code, { keepScannerOpen: keep });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastError && retryButtonRef.current) retryButtonRef.current.focus();
  }, [lastError?.incidentId]);

  const lookupBarcode = async (
    code: string,
    opts?: { keepScannerOpen?: boolean },
  ): Promise<boolean> => {
    const validation = validateBarcode(code);
    if (!validation.ok) {
      const mapped = applySaleError(
        { message: validation.message, fieldErrors: { scan: validation.message } },
        t.saleFailed,
      );
      recordScan("pos", { code: code.trim() || "(empty)", matched: false });
      void logPosEvent({
        action: "barcode_rejected",
        metadata: {
          code: code.trim(),
          reason: validation.reason,
          incidentId: mapped.normalized.incidentId,
        },
      });
      toast.error(validation.message);
      return false;
    }
    const trimmed = validation.code;
    setQuery(trimmed);
    let hit;
    try {
      hit = await findLocalProductByCode(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.saleFailed;
      const mapped = applySaleError({ message, fieldErrors: { scan: message } }, t.saleFailed);
      recordScan("pos", { code: trimmed, matched: false });
      const descriptor: PosRetryDescriptor = {
        kind: "scan",
        code: trimmed,
        keepScannerOpen: opts?.keepScannerOpen,
      };
      lastDescriptorRef.current = descriptor;
      lastActionRef.current = () => {
        void lookupBarcode(trimmed, opts);
      };
      savePersistedIncident({ descriptor, error: mapped.normalized });
      return false;
    }
    if (hit) {
      const packQty = Math.max(1, Number(hit.pack_size) || 1);
      const mode = getScannerPrefs().repeatScanMode;
      const alreadyInCart = cart.some((l) => l.product_id === hit.id);
      const addQty = mode === "increment" && alreadyInCart ? 1 : packQty;
      addToCart(hit, addQty);
      recordScan("pos", {
        code: trimmed,
        matched: true,
        productName: hit.name,
        quantityAdded: addQty,
      });
      toast.success(`${hit.name}${addQty > 1 ? ` ×${addQty}` : ""} — زیات شو`);
      setQuery("");
      setFieldErrors((p) => ({ ...p, scan: undefined, cart: undefined }));
      if (lastDescriptorRef.current?.kind === "scan") {
        lastDescriptorRef.current = null;
        lastActionRef.current = null;
        setFormError(null);
        setLastError(null);
        clearPersistedIncident();
      }
      if (!opts?.keepScannerOpen) searchRef.current?.focus();
      return true;
    }
    recordScan("pos", { code: trimmed, matched: false });
    setFallbackCode(trimmed);
    return false;
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookupBarcode(query);
  };

  useExternalBarcodeScanner({
    enabled: !scannerOpen,
    allowEditableTargets: true,
    onScan: async (code) => {
      await lookupBarcode(code);
    },
  });

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.price * l.quantity - l.discount, 0),
    [cart],
  );
  const total = Math.max(0, subtotal - invoiceDiscount);
  const paidNum = amountPaid === "" ? total : Number(amountPaid);
  const change = paymentMethod === "cash" ? Math.max(0, paidNum - total) : 0;

  const handleSave = useCallback(async () => {
    clearErrors();
    if (cart.length === 0) {
      setFieldError("cart", t.emptyCartError);
      return;
    }
    for (const l of cart) {
      if (l.quantity > l.stock) {
        setFieldError("cart", `${t.insufficientStock}: ${l.name} (${t.stock}: ${num(l.stock)})`);
        return;
      }
    }
    if (!quickMode && paymentMethod === "credit" && customerId === "walk-in") {
      setFieldError("customer", t.creditRequiresCustomer);
      return;
    }
    if (!quickMode && paymentMethod === "cash" && amountPaid !== "" && Number(amountPaid) < total) {
      setFieldError("amountPaid", t.insufficientPayment);
      return;
    }

    setSaving(true);
    const saleArgs = buildCreateSaleArgs({
      cart,
      clientRequestId: crypto.randomUUID(),
      quickMode,
      paymentMethod,
      customerId,
      invoiceDiscount,
      qsPrefs,
    });
    let saleId: string;
    try {
      saleId = await createLocalSale(saleArgs);
    } catch (error) {
      setSaving(false);
      const mapped = applySaleError(error, t.saleFailed);
      lastDescriptorRef.current = { kind: "save" };
      lastActionRef.current = () => {
        void handleSave();
      };
      void logPosEvent({
        action: quickMode ? "quick_sale_failed" : "sale_failed",
        metadata: {
          incidentId: mapped.normalized.incidentId,
          code: mapped.normalized.code,
          message: mapped.normalized.message,
          itemCount: cart.length,
          total,
          paymentMethod,
        },
      });
      return;
    }
    setSaving(false);
    void logPosEvent({
      action: quickMode ? "quick_sale_success" : "sale_success",
      entityId: saleId,
      metadata: { itemCount: cart.length, total, paymentMethod, quickMode },
    });
    setLastSaleId(saleId);
    try {
      localStorage.setItem("pos_last_sale_id", saleId);
    } catch {
      /* ignore */
    }
    setCart([]);
    setInvoiceDiscount(0);
    setAmountPaid("");
    setCustomerId("walk-in");
    // Retire the completed draft so it doesn't reappear as a resume banner.
    setActiveDraft(null);
    setActiveDraftId(null);
    setResumedBanner(null);

    clearErrors();
    if (quickMode) {
      toast.success(t.quickSaleSaved);
      if (qsPrefs.showPreviewLater && saleId) {
        void openReceiptWithRetry(`/print/receipt/${saleId}?preview=1`, saleId);
      }
      setTimeout(() => searchRef.current?.focus(), 30);
    } else {
      toast.success(t.saleSaved);
      navigate({ to: "/print/receipt/$id", params: { id: saleId } });
    }
  }, [
    cart,
    quickMode,
    paymentMethod,
    customerId,
    amountPaid,
    invoiceDiscount,
    total,
    navigate,
    qsPrefs,
    clearErrors,
    setFieldError,
    applySaleError,
  ]);

  useEffect(() => {
    registerPosRunner(async (d) => {
      if (d.kind !== "scan") return false;
      return await lookupBarcode(d.code, { keepScannerOpen: d.keepScannerOpen });
    });
    return () => {
      registerPosRunner(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useEffect(() => {
    if (!quickMode) return;
    const cleanup = registerShortcut({
      id: "pos.quicksave",
      combo: "F9",
      scope: "pos",
      description: "چټک پلور خوندي کول",
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F9") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      handleSave();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cleanup();
    };
  }, [quickMode, handleSave]);

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
  useEffect(() => {
    if (!quickMode || cart.length === 0 || saving) return;
    if (qsPrefs.autoCommitItemCount > 0 && cartCount >= qsPrefs.autoCommitItemCount) {
      toast.info(t.autoCommitted);
      handleSave();
      return;
    }
    if (qsPrefs.autoCommitMinutes > 0) {
      const ms = qsPrefs.autoCommitMinutes * 60 * 1000;
      const timer = window.setTimeout(() => {
        toast.info(t.autoCommitted);
        handleSave();
      }, ms);
      return () => window.clearTimeout(timer);
    }
  }, [
    quickMode,
    cart,
    cartCount,
    saving,
    qsPrefs.autoCommitItemCount,
    qsPrefs.autoCommitMinutes,
    handleSave,
  ]);

  const retryDescriptorLabel =
    lastDescriptorRef.current?.kind === "scan"
      ? `د بارکوډ ${lastDescriptorRef.current.code} بیا هڅه وکړئ (Alt+R)`
      : "د پلور بیا هڅه وکړئ (Alt+R)";

  const HISTORY_KEY = "pos.scan_history_open";
  const [historyOpen, setHistoryOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(HISTORY_KEY) === "1";
  });
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, historyOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [historyOpen]);
  useEffect(() => {
    const cleanups = [
      registerShortcut({
        id: "pos.history",
        combo: "Alt+H",
        scope: "pos",
        description: "د سکن تاریخچه",
      }),
      registerShortcut({
        id: "pos.newdraft",
        combo: "Alt+N",
        scope: "pos",
        description: "نوې مسوده",
      }),
      registerShortcut({ id: "pos.clear", combo: "Alt+X", scope: "pos", description: "سبد پاکول" }),
      registerShortcut({ id: "pos.pay", combo: "Alt+P", scope: "pos", description: "تسویه/پلور" }),
      registerShortcut({
        id: "pos.customer",
        combo: "Alt+C",
        scope: "pos",
        description: "د پیرودونکي فوکس",
      }),
      registerShortcut({
        id: "pos.cartline.move",
        combo: "Alt+ArrowUp/Down",
        scope: "pos",
        description: "د سبد کرښې حرکت",
      }),
      registerShortcut({
        id: "pos.cartline.plus",
        combo: "+",
        scope: "pos",
        description: "شمیر ډېرول (فوکس شوې کرښه)",
      }),
      registerShortcut({
        id: "pos.cartline.minus",
        combo: "-",
        scope: "pos",
        description: "شمیر کمول (فوکس شوې کرښه)",
      }),
      registerShortcut({
        id: "pos.cartline.del",
        combo: "Delete",
        scope: "pos",
        description: "کرښه لرې کول",
      }),
    ];
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);

      // ---- POS action shortcuts (Alt+*) ----
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (typing) return;
        // Alt+H toggle scan-history panel
        if (k === "h") {
          e.preventDefault();
          setHistoryOpen((v) => !v);
          return;
        }
        // Alt+N new draft
        if (k === "n") {
          e.preventDefault();
          startNewDraft();
          return;
        }
        // Alt+X clear cart
        if (k === "x") {
          e.preventDefault();
          if (cart.length === 0) return;
          captureUndo("سبد پاک شو");
          setCart([]);
          setInvoiceDiscount(0);
          setAmountPaid("");
          toast.success("سبد پاک شو");
          announce("سبد پاک شو");
          return;
        }
        // Alt+P pay/checkout
        if (k === "p") {
          e.preventDefault();
          const btn = document.querySelector<HTMLButtonElement>(
            '[data-shortcut="checkout"]:not([disabled])',
          );
          btn?.click();
          return;
        }
        // Alt+C focus customer select
        if (k === "c") {
          e.preventDefault();
          const trg = document.querySelector<HTMLButtonElement>('[data-shortcut="customer"]');
          trg?.focus();
          return;
        }
        // Alt+ArrowUp / Alt+ArrowDown move focus between cart lines
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          const lines = Array.from(document.querySelectorAll<HTMLElement>("[data-cart-line]"));
          if (lines.length === 0) return;
          e.preventDefault();
          const active = document.activeElement as HTMLElement | null;
          const curIdx = active
            ? lines.indexOf(active.closest("[data-cart-line]") as HTMLElement)
            : -1;
          const step = e.key === "ArrowDown" ? 1 : -1;
          const nextIdx = curIdx === -1 ? 0 : (curIdx + step + lines.length) % lines.length;
          lines[nextIdx]?.focus();
          return;
        }
      }

      // ---- Focused cart-line quick edits: +, -, Delete ----
      // Only fires when a cart-line element (not an input inside it) has focus.
      const active = document.activeElement as HTMLElement | null;
      const line = active?.closest("[data-cart-line]") as HTMLElement | null;
      const focusIsCartLine = !!line && active === line;
      if (focusIsCartLine && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const idx = Number(line!.getAttribute("data-cart-index"));
        if (Number.isFinite(idx)) {
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            const l = cart[idx];
            if (l) updateLine(idx, { quantity: l.quantity + 1 });
            return;
          }
          if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            const l = cart[idx];
            if (l) updateLine(idx, { quantity: Math.max(1, l.quantity - 1) });
            return;
          }
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            captureUndo("د سبد کرښه لرې شوه");
            removeLine(idx);
            setTimeout(() => {
              const lines = document.querySelectorAll<HTMLElement>("[data-cart-line]");
              (lines[Math.min(idx, lines.length - 1)] ?? searchRef.current)?.focus();
            }, 30);
            return;
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cleanups.forEach((c) => c());
    };
  }, [cart, startNewDraft, captureUndo, updateLine, removeLine]);

  return (
    <div
      className="grid gap-4 p-4 md:grid-cols-[1fr_400px] md:p-6"
      style={{
        // Full-viewport POS: use the entire dynamic viewport height and let
        // the two columns manage their own internal scroll.
        minHeight: "100dvh",
        maxHeight: "100dvh",
      }}
    >
      <div className="flex min-h-0 flex-col gap-3">
        <div
          className={`panel flex flex-wrap items-center justify-between gap-3 px-3 py-2 ${
            quickMode ? "border-accent/60 shadow-gold-glow" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`grid h-8 w-8 place-items-center rounded-lg ${quickMode ? "gradient-gold text-accent-foreground shadow-gold-glow" : "bg-surface-3 text-muted-foreground"}`}
            >
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <Label
                htmlFor="quick-mode"
                className="cursor-pointer font-display text-sm font-semibold"
              >
                {t.quickSaleMode}
              </Label>
              <div className="text-[11px] text-muted-foreground">
                {quickMode ? t.quickSaleHint : "F9 د چټک ذخیره، F2 سکنر"}
              </div>
            </div>
            <Switch id="quick-mode" checked={quickMode} onCheckedChange={setQuickMode} />
          </div>
          <div className="flex items-center gap-2">
            <span className="chip">
              <span className="opacity-60">سبد:</span>{" "}
              <span className="font-mono">{num(cartCount, 0)}</span>
            </span>
            <SavedIndicator lastSavedAt={lastSavedAt} tick={savedTick} pending={autosavePending} />
            {autosavePending && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={saveNow}
                title="اوس خوندي کړئ"
                aria-label="اوس خوندي کړئ"
                className="h-7 gap-1 px-2 text-[11px]"
              >
                اوس خوندي کړئ
              </Button>
            )}
            {undoTop && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={performUndo}
                    aria-label={`بېرته راګرځول: ${undoTop.label} (Alt+U)`}
                    aria-keyshortcuts="Alt+U"
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    <GitMerge className="h-3 w-3" aria-hidden="true" />
                    بېرته راګرځول{undoTop.depth > 1 ? ` (${undoTop.depth})` : ""}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">
                  <div className="flex items-center gap-2">
                    <span>{undoTop.label}</span>
                    <kbd className="rounded border border-border/60 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                      Alt+U
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {redoTop && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={performRedo}
                    aria-label={`بېرته پلي کول: ${redoTop.label} (Alt+Shift+U یا Alt+R)`}
                    aria-keyshortcuts="Alt+Shift+U Alt+R"
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    بېرته پلي کول{redoTop.depth > 1 ? ` (${redoTop.depth})` : ""}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px]">
                  <div className="flex items-center gap-2">
                    <span>{redoTop.label}</span>
                    <kbd className="rounded border border-border/60 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                      Alt+Shift+U
                    </kbd>
                    <span className="opacity-60">یا</span>
                    <kbd className="rounded border border-border/60 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                      Alt+R
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            <PosDraftsMenu
              ref={draftsTriggerRef}
              activeId={activeDraftId}
              onSwitch={switchToDraft}
              onNewDraft={startNewDraft}
              currentCartCount={cartCount}
              open={draftsMenuOpen}
              onOpenChange={setDraftsMenuOpen}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!lastSaleId || reprinting}
              onClick={reprintLastReceipt}
              title={t.reprintWalkIn}
              aria-label={t.reprintWalkIn}
            >
              <Printer className="ml-1 h-4 w-4" />
              {t.reprintWalkIn}
            </Button>
            <Button
              type="button"
              variant={historyOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setHistoryOpen((v) => !v)}
              title="د سکن تاریخچه (Alt+H)"
              aria-label="د سکن تاریخچه (Alt+H)"
              aria-keyshortcuts="Alt+H"
              aria-pressed={historyOpen}
            >
              <History className="ml-1 h-4 w-4" />
              تاریخچه
            </Button>
          </div>
        </div>

        {resumedBanner && (
          <div
            role="status"
            className="panel flex items-center gap-3 border-primary/40 bg-primary/5 px-3 py-2 text-sm"
          >
            <ShoppingCart className="h-4 w-4 text-primary" />
            <div className="flex-1">
              مسوده <span className="font-semibold">"{resumedBanner.name}"</span> بیرته راوستل شوه —{" "}
              <span className="font-mono">{num(resumedBanner.count, 0)}</span> توکي
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => switchToDraft(null)}>
              پاک کړئ
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setResumedBanner(null)}
              aria-label="بند کړئ"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {conflict && (
          <div
            role="alertdialog"
            aria-live="assertive"
            aria-labelledby="pos-conflict-title"
            aria-describedby="pos-conflict-desc"
            onKeyDown={(e) => {
              // Small focus trap between the two action buttons + Esc keeps mine.
              if (e.key === "Escape") {
                e.preventDefault();
                keepLocalConflict();
                return;
              }
              if (e.key !== "Tab") return;
              const root = e.currentTarget;
              const targets = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
              if (targets.length < 2) return;
              const first = targets[0],
                last = targets[targets.length - 1];
              const active = document.activeElement as HTMLElement | null;
              if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
              }
            }}
            className="panel flex flex-col gap-2 border-orange-500/50 bg-orange-500/10 px-3 py-2 text-sm"
          >
            <div className="flex items-start gap-2">
              <GitMerge className="mt-0.5 h-4 w-4 text-orange-500" />
              <div className="flex-1">
                <div
                  id="pos-conflict-title"
                  className="font-semibold text-orange-900 dark:text-orange-300"
                >
                  دا مسوده په بله کړکۍ کې بدله شوې
                </div>
                <div id="pos-conflict-desc" className="mt-0.5 text-xs text-muted-foreground">
                  د بلې کړکۍ نسخه {new Date(conflict.updatedAt).toLocaleTimeString()} کې خوندي شوه —{" "}
                  {conflict.data.cart.reduce((s, l) => s + l.quantity, 0)} توکي. ستاسو موجوده
                  بدلونونه لا خوندي شوي نه دي. (Esc = زما نسخه وساتئ)
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                autoFocus
                onClick={acceptRemoteConflict}
              >
                د بلې کړکۍ نسخه وباروئ
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={keepLocalConflict}>
                زما نسخه وساتئ
              </Button>
            </div>
          </div>
        )}

        {draftIssues && !issuesDismissed && (
          <div
            role="alert"
            className="panel flex flex-col gap-2 border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900 dark:text-amber-300">
                  د دې مسودې ځینې توکي بدل شوي دي
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {draftIssues.slice(0, 6).map((i, idx) => (
                    <li key={idx} className="text-muted-foreground">
                      {i.kind === "unavailable" && (
                        <>
                          • <span className="font-medium">{i.name}</span> — نشته یا ناپیل شوی
                        </>
                      )}
                      {i.kind === "out_of_stock" && (
                        <>
                          • <span className="font-medium">{i.name}</span> — ذخیره {num(i.stock, 0)}{" "}
                          / غوښتنه {num(i.requested, 0)}
                        </>
                      )}
                      {i.kind === "price_changed" && (
                        <>
                          • <span className="font-medium">{i.name}</span> — قیمت {money(i.oldPrice)}{" "}
                          → <span className="text-primary">{money(i.newPrice)}</span>
                        </>
                      )}
                    </li>
                  ))}
                  {draftIssues.length > 6 && (
                    <li className="text-muted-foreground">+ {draftIssues.length - 6} نور…</li>
                  )}
                </ul>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setIssuesDismissed(true)}
                aria-label="بند کړئ"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draftIssues.some((i) => i.kind === "price_changed") && (
                <Button type="button" size="sm" variant="outline" onClick={applyPriceUpdates}>
                  نوي قیمتونه ومنئ
                </Button>
              )}
              {draftIssues.some((i) => i.kind === "unavailable") && (
                <Button type="button" size="sm" variant="outline" onClick={removeUnavailable}>
                  نامعلومې لرې کړئ
                </Button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.scanOrSearch}
              className="pr-10 text-base"
              autoFocus
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setScannerOpen(true)}
            title="بارکوډ سکین کړئ"
          >
            <ScanLine className="h-4 w-4" />
          </Button>
        </form>
        <SaleFieldError field="scan" message={fieldErrors.scan} />

        <BarcodeScanner
          open={scannerOpen}
          continuous
          onClose={() => {
            setScannerOpen(false);
            searchRef.current?.focus();
          }}
          onDetected={(code) => lookupBarcode(code, { keepScannerOpen: true })}
        />
        <ScanFallbackDialog
          open={!!fallbackCode}
          code={fallbackCode ?? ""}
          onClose={() => setFallbackCode(null)}
          onMapped={(p) => {
            const packQty = Math.max(1, p.pack_size);
            addToCart(
              { id: p.id, name: p.name, sale_price: p.sale_price, stock: p.stock },
              packQty,
            );
            toast.success(`${p.name} ×${packQty} — زیات شو`);
            searchRef.current?.focus();
          }}
        />
        {historyOpen && <ScanHistoryPanel context="pos" onRetry={(code) => lookupBarcode(code)} />}

        {quickMode && !query && (
          <PosQuickTally products={topProducts ?? []} onPick={(p) => addToCart(p)} />
        )}

        <div className="grid flex-1 auto-rows-max grid-cols-2 gap-2 overflow-auto sm:grid-cols-3 lg:grid-cols-4">
          {products?.map((p) => (
            <ProductPickerCard key={p.id} product={p} cart={cart} onPick={addToCart} />
          ))}
          {products?.length === 0 && (
            <div className="col-span-full grid place-items-center gap-2 rounded-xl border border-dashed border-border-hair bg-surface-1/60 py-10 text-center text-sm text-muted-foreground">
              <Search className="h-6 w-6 opacity-40" />
              {t.noData}
            </div>
          )}
          {!products && (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="panel h-24 shimmer" />
              ))}
            </>
          )}
        </div>
      </div>

      <Card className={`flex min-h-0 flex-col ${quickMode ? "border-primary" : ""}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-5 w-5" />
            {t.cart}
            {quickMode && (
              <span className="ml-auto rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {t.quickSale}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
          <div className="flex-1 space-y-2 overflow-auto">
            <PosCart cart={cart} onUpdate={updateLine} onRemove={removeLine} />
          </div>
          <SaleFieldError field="cart" message={fieldErrors.cart} />

          <PosPaymentPanel
            quickMode={quickMode}
            qsPrefs={{ forceCash: qsPrefs.forceCash, allowDiscounts: qsPrefs.allowDiscounts }}
            customers={customers}
            customerId={customerId}
            onCustomerChange={setCustomerId}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            invoiceDiscount={invoiceDiscount}
            onInvoiceDiscountChange={setInvoiceDiscount}
            amountPaid={amountPaid}
            onAmountPaidChange={setAmountPaid}
            subtotal={subtotal}
            total={total}
            change={change}
            saving={saving}
            cartCount={cart.length}
            fieldErrors={fieldErrors}
            formError={formError}
            lastError={lastError}
            copiedIncident={copiedIncident}
            retrying={retrying}
            hasRetry={!!lastActionRef.current}
            retryDescriptorLabel={retryDescriptorLabel}
            retryButtonRef={retryButtonRef}
            onCopyIncident={copyIncident}
            onRetry={retryLastAction}
            onSave={handleSave}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ProductPickerCard({
  product,
  cart,
  onPick,
}: {
  product: { id: string; name: string; sale_price: number; stock: number };
  cart: CartLine[];
  onPick: (product: { id: string; name: string; sale_price: number; stock: number }) => void;
}) {
  const selectedQuantity = cart.find((line) => line.product_id === product.id)?.quantity ?? 0;
  const remainingStock = Math.max(0, Number(product.stock) - selectedQuantity);

  return (
    <button
      onClick={() => onPick(product)}
      disabled={remainingStock <= 0}
      className="panel hover-lift group flex flex-col items-start gap-1 p-3 text-right transition hover:border-accent/40 hover:shadow-float disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold">{product.name}</div>
      <div className="chip !h-5 !text-[10px]">پاتې ذخیره: {num(remainingStock, 0)}</div>
      <div className="mt-auto font-display text-sm font-bold text-primary">{money(product.sale_price)}</div>
    </button>
  );
}

function SavedIndicator({
  lastSavedAt,
  tick,
  pending,
}: {
  lastSavedAt: number | null;
  tick: number;
  pending?: boolean;
}) {
  // Re-render when tick changes to refresh the "X ago" label.
  void tick;
  const pendingChip = pending ? (
    <span
      className="chip !border-amber-500/30 !text-amber-700 dark:!text-amber-300"
      role="status"
      aria-live="polite"
      aria-label="د خوندي کولو په حال کې…"
      title="د خوندي کولو په حال کې…"
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
      />
      <span aria-hidden="true" className="text-[10px]">
        خوندي کیږي…
      </span>
    </span>
  ) : null;
  if (!lastSavedAt) {
    return (
      <>
        {pendingChip}
        <span
          className="chip !text-muted-foreground"
          title="لا خوندي نه ده"
          role="status"
          aria-live="polite"
          aria-label="مسوده: نوې، لا خوندي شوې نه ده"
        >
          <span aria-hidden="true" className="opacity-60">
            مسوده:
          </span>{" "}
          نوې
        </span>
      </>
    );
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - lastSavedAt) / 1000));
  let label: string;
  if (diffSec < 5) label = "همدا اوس خوندي شوه";
  else if (diffSec < 60) label = `${diffSec} ثانیې مخکې خوندي شوه`;
  else if (diffSec < 3600) label = `${Math.floor(diffSec / 60)} دقیقې مخکې خوندي شوه`;
  else label = new Date(lastSavedAt).toLocaleTimeString();
  return (
    <>
      {pendingChip}
      <span
        className="chip !border-emerald-500/30 !text-emerald-700 dark:!text-emerald-300"
        title={new Date(lastSavedAt).toLocaleString()}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`مسوده — ${label}`}
      >
        <CheckIcon aria-hidden="true" className="h-3 w-3" />
        <span aria-hidden="true" className="text-[10px]">
          {label}
        </span>
      </span>
    </>
  );
}
