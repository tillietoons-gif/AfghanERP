import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { money, num, jalaliDateTime } from "@/lib/format";
import { Plus, Eye, Printer, FileText, FileDown, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ReceiptPreviewDialog } from "@/components/receipt-preview-dialog";
import { BatchReceiptsDialog } from "@/components/batch-receipts-dialog";
import { RefundDialog } from "@/components/refund-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth, hasAnyRole } from "@/hooks/use-auth";
import { countLocalSales, listLocalSales, markLocalReceiptPrinted } from "@/lib/local-store";

export const Route = createFileRoute("/sales")({
  component: () => (
    <ProtectedRoute>
      <SalesPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("پلور"),
});

function SalesPage() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [refundTarget, setRefundTarget] = useState<{ id: string; invoice_no: string } | null>(null);
  const { roles } = useAuth();
  const canRefund = hasAnyRole(roles, ["owner", "admin", "manager"]);
  const qc = useQueryClient();

  useEffect(() => {
    setPage(0);
  }, [showQuick]);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-list", showQuick, page],
    queryFn: async () => {
      const fromIdx = page * PAGE_SIZE;
      const [rows, count] = await Promise.all([
        listLocalSales("", PAGE_SIZE, fromIdx, showQuick),
        countLocalSales(showQuick),
      ]);
      return { rows, count };
    },
  });
  const sales = data?.rows;
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const reprintWalkIn = async (id: string, _invoice_no: string, _total: number) => {
    try {
      await markLocalReceiptPrinted(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.saleFailed);
      return;
    }
    qc.invalidateQueries({ queryKey: ["sales-list"] });
    window.open(`/print/receipt/${id}`, "_blank");
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.sales}</h1>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showQuick}
              onChange={(e) => setShowQuick(e.target.checked)}
            />
            {t.showQuickSales}
          </label>
          <Button variant="outline" onClick={() => setBatchOpen(true)}>
            <FileDown className="ml-1 h-4 w-4" />
            ډله ییز PDF
          </Button>
          <Link to="/pos">
            <Button>
              <Plus className="ml-1 h-4 w-4" />
              {t.newSale}
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{t.invoice}</TableHead>
              <TableHead className="text-right">{t.date}</TableHead>
              <TableHead className="text-right">{t.customer}</TableHead>
              <TableHead className="text-right">{t.total}</TableHead>
              <TableHead className="text-right">{t.status}</TableHead>
              <TableHead className="text-right">{t.printedAt}</TableHead>
              <TableHead className="text-right">{t.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center">
                  {t.loading}
                </TableCell>
              </TableRow>
            )}
            {sales?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs" dir="ltr">
                  {s.invoice_no}
                  {s.is_quick_sale && (
                    <Badge variant="outline" className="mr-2 text-[10px]">
                      {t.quickSale}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{jalaliDateTime(s.sale_date)}</TableCell>
                <TableCell>{s.customer_name ?? t.walkIn}</TableCell>
                <TableCell className="font-semibold">{money(s.total)}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "refunded" ? "destructive" : "secondary"}>
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {s.receipt_printed_at ? jalaliDateTime(s.receipt_printed_at) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="مخکتنه"
                      onClick={() => setPreviewId(s.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {s.is_quick_sale && !s.receipt_printed && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t.reprintWalkIn}
                        onClick={() => reprintWalkIn(s.id, s.invoice_no, Number(s.total))}
                      >
                        <RotateCcw className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                    <Link to="/print/receipt/$id" params={{ id: s.id }} target="_blank">
                      <Button size="icon" variant="ghost" title="بیا چاپ">
                        <Printer className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link to="/print/receipt/$id" params={{ id: s.id }} target="_blank">
                      <Button size="icon" variant="ghost" title="PDF">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </Link>
                    {canRefund && s.status !== "refunded" && !s.is_quick_sale && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="بېرته ورکړه"
                        onClick={() => setRefundTarget({ id: s.id, invoice_no: s.invoice_no })}
                      >
                        <Undo2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (!sales || sales.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {t.noData}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t p-2 text-xs">
          <div className="text-muted-foreground">
            ټول: {num(totalCount)} — مخ {num(page + 1)} / {num(totalPages)}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              مخکینی
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              راتلونکی
            </Button>
          </div>
        </div>
      </Card>
      <ReceiptPreviewDialog
        open={!!previewId}
        onClose={() => setPreviewId(null)}
        url={previewId ? `/print/receipt/${previewId}` : null}
      />
      <BatchReceiptsDialog open={batchOpen} onClose={() => setBatchOpen(false)} />
      <RefundDialog
        saleId={refundTarget?.id ?? null}
        invoiceNo={refundTarget?.invoice_no}
        onClose={() => setRefundTarget(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["sales-list"] })}
      />
    </div>
  );
}
