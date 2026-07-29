import { useEffect, useRef } from "react";
import { getScannerPrefs } from "@/lib/scanner-prefs";

interface UseExternalBarcodeScannerOptions {
  enabled?: boolean;
  onScan: (code: string) => void | Promise<void>;
  ignoreWhen?: () => boolean;
  allowEditableTargets?: boolean;
}

type EditableSnapshot = {
  target: HTMLInputElement | HTMLTextAreaElement;
  value: string;
  restored: boolean;
};

const BURST_GAP_MS = 60;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function getTextInputTarget(target: EventTarget | null) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target;
  }
  return null;
}

function restoreInputValue(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(target) as HTMLInputElement | HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

export function useExternalBarcodeScanner({
  enabled = true,
  onScan,
  ignoreWhen,
  allowEditableTargets = false,
}: UseExternalBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const state = {
      buffer: "",
      lastAt: 0,
      idleTimer: 0 as number | undefined,
      editableSnapshot: null as EditableSnapshot | null,
    };

    const clearIdleTimer = () => {
      if (state.idleTimer) {
        window.clearTimeout(state.idleTimer);
        state.idleTimer = undefined;
      }
    };

    const reset = () => {
      state.buffer = "";
      state.lastAt = 0;
      state.editableSnapshot = null;
      clearIdleTimer();
    };

    const restoreEditableSnapshot = () => {
      const snapshot = state.editableSnapshot;
      if (!snapshot || snapshot.restored || !snapshot.target.isConnected) return;
      restoreInputValue(snapshot.target, snapshot.value);
      snapshot.restored = true;
    };

    const flush = () => {
      const prefs = getScannerPrefs();
      const code = state.buffer.trim();
      restoreEditableSnapshot();
      reset();
      if (code.length < Math.max(3, prefs.externalScannerMinLength)) return;
      void onScanRef.current(code);
    };

    const scheduleFlush = () => {
      const prefs = getScannerPrefs();
      clearIdleTimer();
      state.idleTimer = window.setTimeout(flush, Math.max(50, prefs.externalScannerIdleMs));
    };

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
        reset();
        return;
      }

      const prefs = getScannerPrefs();
      if (!prefs.externalScannerEnabled || ignoreWhen?.()) {
        reset();
        return;
      }

      const activeTextInput = getTextInputTarget(document.activeElement);
      const eventTextInput = getTextInputTarget(event.target);
      const hasEditableTarget =
        isEditableTarget(event.target) || isEditableTarget(document.activeElement);

      if (hasEditableTarget && !allowEditableTargets) {
        reset();
        return;
      }

      const suffixKey =
        prefs.externalScannerSubmitKey === "enter"
          ? "Enter"
          : prefs.externalScannerSubmitKey === "tab"
            ? "Tab"
            : null;

      if (suffixKey && event.key === suffixKey) {
        if (state.buffer) {
          event.preventDefault();
          event.stopPropagation();
          flush();
        }
        return;
      }

      if (event.key === "Backspace") {
        reset();
        return;
      }

      if (event.key.length !== 1) return;

      const now = performance.now();
      if (!state.buffer || now - state.lastAt > BURST_GAP_MS) {
        reset();
        state.buffer = event.key;
        const snapshotTarget = activeTextInput ?? eventTextInput;
        if (allowEditableTargets && snapshotTarget) {
          state.editableSnapshot = {
            target: snapshotTarget,
            value: snapshotTarget.value,
            restored: false,
          };
        }
      } else {
        state.buffer += event.key;
        event.preventDefault();
        event.stopPropagation();
        restoreEditableSnapshot();
      }
      state.lastAt = now;
      scheduleFlush();
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      reset();
      window.removeEventListener("keydown", handler, true);
    };
  }, [allowEditableTargets, enabled, ignoreWhen]);
}
