import { AlertCircle } from "lucide-react";

/**
 * Inline field-level error renderer used across the POS surface. Extracted so
 * unit tests can assert rendering (aria-live + destructive styling) without
 * needing to mount the full POS route.
 */
export function SaleFieldError({ message, field }: { message?: string; field: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      aria-live="polite"
      data-testid={`sale-error-${field}`}
      className="mt-1 flex items-center gap-1 text-xs text-destructive"
    >
      <AlertCircle className="h-3 w-3" />
      {message}
    </p>
  );
}
