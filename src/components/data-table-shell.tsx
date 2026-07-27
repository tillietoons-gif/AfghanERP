import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Unified data-table shell:
 *  - sticky toolbar (search/filter slot + actions slot)
 *  - optional bulk-action bar (appears when selectionCount > 0)
 *  - scrollable body with tokenized surface + hairline borders
 *  - footer/pagination slot
 *
 * Keeps the caller's existing table/query logic intact — this is presentation only.
 */
export function DataTableShell({
  toolbar,
  actions,
  bulk,
  selectionCount = 0,
  children,
  footer,
  className,
  loading,
  empty,
  isEmpty,
}: {
  toolbar?: ReactNode;
  actions?: ReactNode;
  bulk?: ReactNode;
  selectionCount?: number;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  loading?: boolean;
  empty?: ReactNode;
  isEmpty?: boolean;
}) {
  return (
    <div className={cn("panel overflow-hidden", className)}>
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border-hair bg-surface-2/85 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface-2/65">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {/* Bulk action bar */}
      {selectionCount > 0 && (
        <div
          role="region"
          aria-label="د ټاکل شویو کړنې"
          className="flex items-center justify-between gap-3 border-b border-border-hair bg-accent-soft/60 px-3 py-2 text-sm"
        >
          <span className="font-medium text-accent-foreground">{selectionCount} ټاکل شوي</span>
          <div className="flex flex-wrap items-center gap-2">{bulk}</div>
        </div>
      )}

      {/* Body */}
      <div className="relative">
        {loading && <div className="absolute inset-x-0 top-0 h-0.5 shimmer" aria-hidden="true" />}
        {isEmpty && !loading ? (
          <div className="grid place-items-center p-10 text-center text-sm text-muted-foreground">
            {empty ?? "کوم ډېټا نشته"}
          </div>
        ) : (
          children
        )}
      </div>

      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-hair bg-surface-1/60 px-3 py-2 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Slide-in inspector drawer wrapper.
 * The caller controls open state and content; this is just consistent chrome.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the drawer for keyboard users.
    const focusTarget = asideRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusTarget?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="تړل"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        tabIndex={-1}
      />
      <aside
        ref={asideRef}
        dir="rtl"
        className={cn(
          "absolute inset-y-0 end-0 flex w-full max-w-lg flex-col border-s border-border-hair bg-surface-2 shadow-float",
          "animate-in slide-in-from-right duration-200",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-hair px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-display text-base font-semibold text-foreground">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-3 hover:text-foreground"
              aria-label="تړل"
            >
              تړل ✕
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </aside>
    </div>
  );
}
