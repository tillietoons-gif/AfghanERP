/**
 * Shared behavior for POS-style modals (sale, purchase, refund, purchase-return).
 *
 * All POS modals render inside Radix Dialog, which already ships:
 *  - Escape-key close without stealing focus from the currently-focused input.
 *  - Focus trap inside the dialog (FocusScope) until the dialog closes.
 *  - Return-focus to the trigger element on close.
 *
 * This hook layers on:
 *  - Autofocus of the first meaningful form input on open.
 *  - Adaptive height via ResizeObserver + visualViewport for iOS/Android chrome.
 *  - `scrollToFirstError()` — smooth-scrolls to the first invalid input and
 *    announces the failure through an aria-live region so screen readers hear
 *    it immediately after submit.
 *  - `announce(msg)` — imperative polite announcement (e.g. field becomes invalid).
 *  - Belt-and-suspenders focus restoration: saves the trigger element on open
 *    and restores focus to it on close, even when the dialog is opened via
 *    state instead of a Radix trigger.
 */
import { useCallback, useEffect, useRef } from "react";
import { announceError } from "@/lib/announce";

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([disabled]):not([readonly]),' +
  "select:not([disabled])," +
  "textarea:not([disabled]):not([readonly])," +
  "[data-autofocus]:not([disabled])";

const INVALID_SELECTOR = '[aria-invalid="true"], [data-invalid="true"]';

export function usePosDialog(open: boolean) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const announcerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // ---- Focus restoration: save opener, restore on close ----
  useEffect(() => {
    if (open) {
      if (typeof document !== "undefined") {
        previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
      }
      return;
    }
    const el = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    if (!el || typeof document === "undefined" || !document.contains(el)) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }, [open]);

  // ---- Autofocus first input on open ----
  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      const root = bodyRef.current ?? contentRef.current;
      if (!root) return;
      const preferred = root.querySelector<HTMLElement>("[data-autofocus]");
      const el = preferred ?? root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!el) return;
      try {
        el.focus({ preventScroll: false });
        if (el instanceof HTMLInputElement && el.type !== "number") {
          el.select?.();
        }
      } catch {
        /* ignore */
      }
    }, 50);
    return () => window.clearTimeout(handle);
  }, [open]);

  // ---- Adaptive max-height via ResizeObserver + visualViewport ----
  useEffect(() => {
    if (!open) return;
    const content = contentRef.current;
    if (!content || typeof window === "undefined") return;

    const compute = () => {
      const vv = window.visualViewport;
      const vh = vv?.height ?? window.innerHeight;
      const reserve = 32;
      const max = Math.max(240, Math.floor(vh - reserve));
      content.style.maxHeight = `${max}px`;
    };

    compute();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => compute());
      ro.observe(document.documentElement);
      ro.observe(content);
    }

    const vv = window.visualViewport;
    vv?.addEventListener("resize", compute);
    vv?.addEventListener("scroll", compute);
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);

    return () => {
      ro?.disconnect();
      vv?.removeEventListener("resize", compute);
      vv?.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [open]);

  // ---- aria-live announcer (mounted inside the dialog content) ----
  useEffect(() => {
    if (!open) return;
    const host = contentRef.current;
    if (!host) return;
    const node = document.createElement("div");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    node.className = "sr-only";
    node.style.position = "absolute";
    node.style.width = "1px";
    node.style.height = "1px";
    node.style.overflow = "hidden";
    node.style.clip = "rect(0 0 0 0)";
    host.appendChild(node);
    announcerRef.current = node;
    return () => {
      node.remove();
      announcerRef.current = null;
    };
  }, [open]);

  const announce = useCallback((message: string) => {
    if (!message) return;
    // Broadcast through the shared global announcer so sale/refund/return
    // callers share identical wording behaviour, and mirror to the dialog-
    // local region for AT that scope announcements to the modal.
    announceError(message);
    const local = announcerRef.current;
    if (local) {
      local.textContent = "";
      window.setTimeout(() => {
        local.textContent = message;
      }, 30);
    }
  }, []);

  // ---- Scroll to first validation error (+ announce it) ----
  const scrollToFirstError = useCallback(
    (message?: string) => {
      return new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          const root = bodyRef.current ?? contentRef.current;
          if (!root) return resolve(false);
          const invalid = root.querySelector<HTMLElement>(INVALID_SELECTOR);
          if (!invalid) {
            if (message) announce(message);
            return resolve(false);
          }
          scrollIntoViewWithStickyOffsets(invalid);
          const focusEl = invalid.matches("input, select, textarea, button")
            ? invalid
            : invalid.querySelector<HTMLElement>("input, select, textarea, button");
          try {
            focusEl?.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
          const msg =
            message ??
            invalid.getAttribute("data-error-message") ??
            invalid.getAttribute("aria-label") ??
            "لومړۍ ناسمه ساحه وګورئ";
          announce(msg);
          resolve(true);
        });
      });
    },
    [announce],
  );

  return { contentRef, bodyRef, scrollToFirstError, announce };
}

/**
 * Scrolls an element into view accounting for `position: sticky` neighbors
 * (e.g. sticky headers, sticky action bars) that would otherwise cover the
 * focus target. Any sticky element inside the scroll ancestor is measured;
 * additionally elements marked `data-sticky-top` / `data-sticky-bottom` (or
 * any element with `position: sticky`) reserve their bounding-box height.
 */
function scrollIntoViewWithStickyOffsets(el: HTMLElement) {
  const scroller = findScrollableAncestor(el);
  if (!scroller) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const sRect = scroller.getBoundingClientRect();
  let topPad = 0;
  let bottomPad = 0;
  scroller.querySelectorAll<HTMLElement>("*").forEach((child) => {
    const cs = getComputedStyle(child);
    if (cs.position !== "sticky") return;
    const r = child.getBoundingClientRect();
    // Sticky pinned to the top of the scroller if it is within a few px of it.
    if (Math.abs(r.top - sRect.top) < 4) topPad = Math.max(topPad, r.height);
    if (Math.abs(sRect.bottom - r.bottom) < 4) bottomPad = Math.max(bottomPad, r.height);
  });
  const gap = 16;
  const visibleTop = sRect.top + topPad + gap;
  const visibleBottom = sRect.bottom - bottomPad - gap;
  const eRect = el.getBoundingClientRect();
  let delta = 0;
  if (eRect.top < visibleTop) delta = eRect.top - visibleTop;
  else if (eRect.bottom > visibleBottom) delta = eRect.bottom - visibleBottom;
  if (delta !== 0) scroller.scrollBy({ top: delta, behavior: "smooth" });
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const cs = getComputedStyle(p);
    const oy = cs.overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}
