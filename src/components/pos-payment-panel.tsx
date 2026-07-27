import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Copy, Info, RotateCcw } from "lucide-react";
import { SaleFieldError } from "@/components/sale-field-error";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { SaleFieldKey } from "@/lib/pos-errors";
import type { NormalizedError } from "@/lib/error-handler";
import { openErrorDetails } from "@/lib/error-handler";
import type { RefObject } from "react";

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_money" | "credit";

export interface QuickPrefsSlice {
  forceCash: boolean;
  allowDiscounts: boolean;
}

interface Props {
  quickMode: boolean;
  qsPrefs: QuickPrefsSlice;
  customers: Array<{ id: string; name: string }> | undefined;
  customerId: string;
  onCustomerChange: (id: string) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  invoiceDiscount: number;
  onInvoiceDiscountChange: (n: number) => void;
  amountPaid: number | "";
  onAmountPaidChange: (v: number | "") => void;
  subtotal: number;
  total: number;
  change: number;
  saving: boolean;
  cartCount: number;
  fieldErrors: Partial<Record<SaleFieldKey, string>>;
  formError: string | null;
  lastError: NormalizedError | null;
  copiedIncident: boolean;
  retrying: boolean;
  hasRetry: boolean;
  retryDescriptorLabel: string;
  retryButtonRef: RefObject<HTMLButtonElement | null>;
  onCopyIncident: () => void;
  onRetry: () => void;
  onSave: () => void;
}

/** Right-hand payment/checkout panel for POS: customer, payment, totals, error banner, save. */
export function PosPaymentPanel(props: Props) {
  const {
    quickMode,
    qsPrefs,
    customers,
    customerId,
    onCustomerChange,
    paymentMethod,
    onPaymentMethodChange,
    invoiceDiscount,
    onInvoiceDiscountChange,
    amountPaid,
    onAmountPaidChange,
    subtotal,
    total,
    change,
    saving,
    cartCount,
    fieldErrors,
    formError,
    lastError,
    copiedIncident,
    retrying,
    hasRetry,
    retryDescriptorLabel,
    retryButtonRef,
    onCopyIncident,
    onRetry,
    onSave,
  } = props;

  return (
    <div className="space-y-2 border-t pt-3">
      {!quickMode && (
        <div>
          <Label className="text-xs">{t.customer}</Label>
          <Select value={customerId} onValueChange={onCustomerChange}>
            <SelectTrigger data-shortcut="customer" aria-keyshortcuts="Alt+C">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="walk-in">{t.walkIn}</SelectItem>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SaleFieldError field="customer" message={fieldErrors.customer} />
        </div>
      )}

      {(!quickMode || !qsPrefs.forceCash) && (
        <div>
          <Label className="text-xs">{t.paymentMethod}</Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => onPaymentMethodChange(v as PaymentMethod)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(t.payMethods).map(([k, label]) => (
                <SelectItem key={k} value={k} disabled={quickMode && k === "credit"}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SaleFieldError field="payment" message={fieldErrors.payment} />
        </div>
      )}

      {(!quickMode || qsPrefs.allowDiscounts) && (
        <div>
          <Label className="text-xs">{t.invoiceDiscount}</Label>
          <Input
            type="number"
            min={0}
            value={invoiceDiscount}
            onChange={(e) => onInvoiceDiscountChange(Number(e.target.value) || 0)}
            dir="ltr"
          />
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{t.subtotal}</span>
        <span>{money(subtotal)}</span>
      </div>
      <div className="flex justify-between border-t pt-2 text-lg font-bold">
        <span>{t.total}</span>
        <span className="text-primary">{money(total)}</span>
      </div>

      {!quickMode && paymentMethod === "cash" && (
        <>
          <div>
            <Label className="text-xs">{t.amountPaid}</Label>
            <Input
              type="number"
              min={0}
              value={amountPaid}
              onChange={(e) =>
                onAmountPaidChange(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder={String(total)}
              dir="ltr"
            />
            <SaleFieldError field="amountPaid" message={fieldErrors.amountPaid} />
          </div>
          {change > 0 && (
            <div className="flex justify-between text-sm font-semibold text-green-600">
              <span>{t.change}</span>
              <span>{money(change)}</span>
            </div>
          )}
        </>
      )}

      {formError && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          aria-labelledby="pos-form-error-title"
          aria-describedby={lastError ? "pos-form-error-incident" : undefined}
          data-testid="pos-form-error"
          className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive focus-within:ring-2 focus-within:ring-destructive/40"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (!e.altKey) return;
            if (e.key === "r" || e.key === "R") {
              e.preventDefault();
              if (hasRetry && !retrying && !saving) onRetry();
            } else if (e.key === "c" || e.key === "C") {
              e.preventDefault();
              onCopyIncident();
            } else if (e.key === "d" || e.key === "D") {
              e.preventDefault();
              if (lastError) openErrorDetails(lastError, { context: t.saleFailed, onRetry });
            }
          }}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span id="pos-form-error-title" className="flex-1">
              {formError}
            </span>
          </div>
          {lastError && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-destructive/20 pt-2">
              <code
                id="pos-form-error-incident"
                className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[11px]"
                dir="ltr"
                data-testid="pos-form-error-incident"
                aria-label={`د پېښې پېژندنمبر ${lastError.incidentId}`}
              >
                {lastError.incidentId}
              </code>
              <div role="toolbar" aria-label="د تېروتنې کړنې" className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px] focus-visible:ring-2 focus-visible:ring-destructive"
                  onClick={onCopyIncident}
                  aria-label={
                    copiedIncident
                      ? "د پېښې پېژند کاپي شو"
                      : `د پېښې پېژند کاپي کړئ (Alt+C): ${lastError.incidentId}`
                  }
                  aria-pressed={copiedIncident}
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  {copiedIncident ? "کاپي شو" : "کاپي پېښه"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px] focus-visible:ring-2 focus-visible:ring-destructive"
                  onClick={() => openErrorDetails(lastError, { context: t.saleFailed, onRetry })}
                  aria-label="د تېروتنې بشپړ توضیحات وګورئ (Alt+D)"
                >
                  <Info className="h-3 w-3" aria-hidden="true" />
                  توضیحات
                </Button>
                {hasRetry && (
                  <Button
                    ref={retryButtonRef}
                    type="button"
                    size="sm"
                    className="h-7 gap-1 text-[11px] focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={onRetry}
                    disabled={saving || retrying}
                    aria-label={retryDescriptorLabel}
                    aria-busy={retrying}
                  >
                    <RotateCcw
                      className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    {retrying ? "روان دی…" : "بیا هڅه"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <Button
        className={`h-14 w-full text-base ${quickMode ? "bg-primary" : ""}`}
        onClick={onSave}
        disabled={saving || cartCount === 0}
        data-shortcut="checkout"
        aria-keyshortcuts="Alt+P"
      >
        {saving ? t.loading : quickMode ? t.finishSale : t.saveSale}
      </Button>
    </div>
  );
}
