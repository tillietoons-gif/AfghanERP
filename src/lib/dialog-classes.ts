/**
 * Shared class strings for tall, scrollable dialogs (sale/purchase POS flows).
 * Standardizes behavior across breakpoints and iOS Safari / Android:
 * - Uses `dvh` so mobile browser chrome (URL bar) is accounted for
 * - Header + body + sticky footer via flex column
 * - Body scrolls, footer stays visible
 */
export const POS_DIALOG_CONTENT =
  "max-w-3xl w-[calc(100vw-1rem)] max-h-[90dvh] p-0 gap-0 overflow-hidden flex flex-col";

export const POS_DIALOG_HEADER = "shrink-0 border-b border-border/60 px-6 py-4";

export const POS_DIALOG_BODY =
  "flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-4";

/**
 * Sticky footer inside the scrollable dialog: primary actions remain visible
 * while the body scrolls, respecting iOS safe-area at the bottom.
 */
export const POS_DIALOG_FOOTER =
  "shrink-0 border-t border-border/60 bg-background/95 backdrop-blur px-6 py-3 gap-2 " +
  "[padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] sm:justify-end";
