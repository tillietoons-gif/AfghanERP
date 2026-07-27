import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  POS_DIALOG_CONTENT,
  POS_DIALOG_HEADER,
  POS_DIALOG_BODY,
  POS_DIALOG_FOOTER,
} from "@/lib/dialog-classes";
import { usePosDialog } from "@/lib/pos-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, num } from "@/lib/format";
import { toast } from "sonner";
import { handleError } from "@/lib/error-handler";
import { createLocalPurchaseReturn, getLocalPurchaseItems } from "@/lib/local-store";

interface Line {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  cost: number;
  subtotal: number;
}

interface PurchaseReturnItem {
  id: string;
  product_id: string;
  quantity: number | string;
  cost: number | string;
  subtotal: number | string;
  products?: { name?: string | null } | null;
}

interface Props {
  purchaseId: string | null;
  invoiceNo?: string;
  onClose: () => void;
  onDone?: () => void;
}

export function PurchaseReturnDialog({ purchaseId, invoiceNo, onClose, onDone }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const { contentRef, bodyRef, scrollToFirstError, announce } = usePosDialog(!!purchaseId);

  useEffect(() => {
    if (!purchaseId) {
      setLines([]);
      setQty({});
      setReason("");
      return;
    }
    setLoading(true);
    (async () => {
      const items = await getLocalPurchaseItems(purchaseId);
      setLines(items);
      const initial: Record<string, string> = {};
      items.forEach((l) => {
        initial[l.product_id] = String(l.quantity);
      });
      setQty(initial);
      setLoading(false);
    })();
  }, [purchaseId]);

  const submit = async (mode: "full" | "partial") => {
    if (!purchaseId) return;
    setSubmitting(true);
    try {
      let items: { product_id: string; quantity: number }[] | null = null;
      if (mode === "partial") {
        items = lines
          .map((l) => ({ product_id: l.product_id, quantity: Number(qty[l.product_id] ?? 0) }))
          .filter((x) => x.quantity > 0);
        if (items.length === 0) {
          const firstId = lines[0]?.product_id ?? null;
          setInvalidField(firstId);
          setSubmitting(false);
          const msg = "لږترلږه یو توکی باید انتخاب شي";
          void scrollToFirstError(msg);
          announce(msg);
          toast.error(msg);
          return;
        }
      }
      await createLocalPurchaseReturn({
        purchase_id: purchaseId,
        notes: reason || null,
        items:
          mode === "full"
            ? lines.map((line) => ({ product_id: line.product_id, quantity: line.quantity }))
            : (items ?? []),
      });
      toast.success("د پېرود بېرته راګرځول ثبت شول");
      onDone?.();
      onClose();
    } catch (e) {
      handleError(e, { context: "purchase-return" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!purchaseId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        ref={contentRef}
        dir="rtl"
        className={POS_DIALOG_CONTENT + " sm:max-w-2xl"}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className={POS_DIALOG_HEADER}>
          <DialogTitle>
            د پېرود بېرته راګرځول —{" "}
            <span dir="ltr" className="font-mono text-sm">
              {invoiceNo}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div ref={bodyRef} className={POS_DIALOG_BODY}>
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">پورته کیږي…</div>
          ) : (
            <div className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">توکی</TableHead>
                    <TableHead className="text-right">پېرل شوی</TableHead>
                    <TableHead className="text-right">لګښت</TableHead>
                    <TableHead className="text-right">د بېرته راګرځېدو شمېر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, idx) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.product_name}</TableCell>
                      <TableCell>{num(l.quantity)}</TableCell>
                      <TableCell>{money(l.cost)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={l.quantity}
                          step="0.01"
                          dir="ltr"
                          className="h-8 w-24"
                          data-autofocus={idx === 0 ? "true" : undefined}
                          aria-invalid={invalidField === l.product_id || undefined}
                          value={qty[l.product_id] ?? ""}
                          onChange={(e) => {
                            if (invalidField) setInvalidField(null);
                            setQty((s) => ({ ...s, [l.product_id]: e.target.value }));
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="space-y-1">
                <Label>دلیل (اختیاري)</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="د بېرته راګرځېدو دلیل"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className={POS_DIALOG_FOOTER}>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            بندول
          </Button>
          <Button
            variant="secondary"
            onClick={() => submit("partial")}
            disabled={submitting || loading}
          >
            {submitting ? "…" : "برخه ییز بېرته راګرځول"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => submit("full")}
            disabled={submitting || loading}
          >
            {submitting ? "…" : "بشپړ بېرته راګرځول"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
