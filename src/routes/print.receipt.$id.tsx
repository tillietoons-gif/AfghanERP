import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, num, jalaliDateTime, toPashtoDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Printer, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  getLocalCustomer,
  getLocalSale,
  getLocalSaleItems,
  getLocalSalePayments,
  getLocalStoreSettings,
  markLocalReceiptPrinted,
} from "@/lib/local-store";

export const Route = createFileRoute("/print/receipt/$id")({
  component: () => (
    <ProtectedRoute bare>
      <ReceiptPage />
    </ProtectedRoute>
  ),
});

type PaperSize = "80mm" | "A4";

interface SaleData {
  id: string;
  invoice_no: string;
  sale_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  notes: string | null;
  customer_id: string | null;
  customers: { name?: string; phone?: string } | null;
  sale_items: {
    id: string;
    quantity: number;
    price: number;
    discount: number;
    subtotal: number;
    products: { name?: string } | null;
  }[];
  sale_payments: { method: string; amount: number; reference: string | null }[];
}

const DEFAULT_KEY = "receipt.paper";
const customerKey = (id: string | null) => `receipt.paper.customer.${id ?? "walkin"}`;

function readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function readInitialPaper(): PaperSize {
  if (typeof window === "undefined") return "80mm";
  const fromUrl = readUrlParam("paper");
  if (fromUrl === "80mm" || fromUrl === "A4") return fromUrl;
  return (localStorage.getItem(DEFAULT_KEY) as PaperSize) || "80mm";
}

function postToParent(msg: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage(msg, "*");
    }
  } catch {
    /* ignore */
  }
}

function ReceiptPage() {
  const { id } = Route.useParams();
  const [sale, setSale] = useState<SaleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [store, setStore] = useState<{
    store_name?: string;
    address?: string;
    phone?: string;
    receipt_footer?: string;
    tax_number?: string;
  } | null>(null);
  const [paper, setPaper] = useState<PaperSize>(readInitialPaper);
  const [paperLoaded, setPaperLoaded] = useState(false);
  const [autoPrinted, setAutoPrinted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const localSale = await getLocalSale(id);
        if (!localSale) {
          setLoadError("دا رسيد و نه موندل شو.");
          postToParent({ type: "receipt-error", message: "دا رسيد و نه موندل شو." });
          return;
        }
        const [items, payments, customer, settings] = await Promise.all([
          getLocalSaleItems(id),
          getLocalSalePayments(id),
          localSale.customer_id ? getLocalCustomer(localSale.customer_id) : Promise.resolve(null),
          getLocalStoreSettings(),
        ]);
        setSale({
          ...localSale,
          customers: customer ? { name: customer.name, phone: customer.phone ?? undefined } : null,
          sale_items: items.map((item) => ({ ...item, products: { name: item.product_name } })),
          sale_payments: payments,
        });
        setStore({
          store_name: settings.store_name,
          address: settings.address ?? undefined,
          phone: settings.phone ?? undefined,
          receipt_footer: settings.receipt_footer ?? undefined,
          tax_number: settings.tax_number ?? undefined,
        });
        // Signal readiness on next paint
        requestAnimationFrame(() => postToParent({ type: "receipt-ready" }));
      } catch (e) {
        const msg = (e as Error)?.message || "د رسيد بار کول ناکام شول.";
        setLoadError(msg);
        postToParent({ type: "receipt-error", message: msg });
      }
    })();
  }, [id]);

  // Load per-customer paper preference once sale is available (URL param overrides).
  useEffect(() => {
    if (!sale || paperLoaded) return;
    const fromUrl = readUrlParam("paper");
    if (fromUrl !== "80mm" && fromUrl !== "A4") {
      const perCust = localStorage.getItem(customerKey(sale.customer_id));
      if (perCust === "80mm" || perCust === "A4") setPaper(perCust);
    }
    setPaperLoaded(true);
  }, [sale, paperLoaded]);

  useEffect(() => {
    if (sale && !autoPrinted) {
      setAutoPrinted(true);
      const isPreview = readUrlParam("preview") === "1";
      const isAutoPdf = readUrlParam("autoPdf") === "1";
      if (!isPreview && !isAutoPdf) setTimeout(() => window.print(), 500);
      // Mark receipt as printed via RPC so the flag update + audit row commit together.
      if (!isPreview) {
        void markLocalReceiptPrinted(sale.id);
      }
    }
  }, [sale, autoPrinted]);

  // Persist paper choice both globally and per customer (unless overridden by URL)
  useEffect(() => {
    if (!paperLoaded) return;
    if (readUrlParam("paper")) return;
    localStorage.setItem(DEFAULT_KEY, paper);
    if (sale) localStorage.setItem(customerKey(sale.customer_id), paper);
  }, [paper, sale, paperLoaded]);

  const downloadPdf = useCallback(async () => {
    if (!receiptRef.current || !sale) return false;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      let pdf: import("jspdf").jsPDF;
      if (paper === "A4") {
        pdf = new jsPDF({ unit: "mm", format: "a4" });
        const pageW = 210;
        const pageH = 297;
        const imgH = (canvas.height * pageW) / canvas.width;
        pdf.addImage(imgData, "PNG", 0, 0, pageW, Math.min(imgH, pageH));
      } else {
        const widthMm = 80;
        const heightMm = (canvas.height * widthMm) / canvas.width;
        pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
        pdf.addImage(imgData, "PNG", 0, 0, widthMm, heightMm);
      }
      pdf.save(`receipt-${sale.invoice_no}.pdf`);
      postToParent({ type: "download-pdf-done", invoice: sale.invoice_no });
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg);
      postToParent({ type: "download-pdf-error", message: msg });
      return false;
    } finally {
      setDownloading(false);
    }
  }, [paper, sale]);

  // Allow parent preview dialog to trigger PDF download via postMessage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (
        e.data &&
        typeof e.data === "object" &&
        (e.data as { type?: string }).type === "download-pdf"
      ) {
        void downloadPdf();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [downloadPdf]);

  // Auto-PDF mode (used by batch export): download once, then notify parent frame.
  const [autoPdfDone, setAutoPdfDone] = useState(false);
  useEffect(() => {
    if (!sale || autoPdfDone) return;
    if (readUrlParam("autoPdf") !== "1") return;
    setAutoPdfDone(true);
    // Give the DOM a tick to paint the receipt before rasterizing.
    setTimeout(async () => {
      const ok = await downloadPdf();
      try {
        window.parent?.postMessage(
          { type: "batch-pdf-done", id: sale.id, invoice: sale.invoice_no, ok },
          "*",
        );
      } catch {
        /* ignore */
      }
    }, 400);
  }, [sale, autoPdfDone, downloadPdf]);

  const totals = useMemo(() => {
    if (!sale) return null;
    const lineDiscounts = sale.sale_items.reduce((s, it) => s + Number(it.discount || 0), 0);
    const gross = sale.sale_items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
    const paid = Number(sale.paid || 0);
    const balance = Number(sale.total) - paid;
    return { gross, lineDiscounts, paid, balance };
  }, [sale]);

  if (loadError) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <div className="text-base font-semibold">د رسيد ښودل ناکام شول</div>
          <div className="text-sm text-muted-foreground">{loadError}</div>
        </div>
      </div>
    );
  }
  if (!sale || !totals) return <div className="p-6 text-center">{t.loading}</div>;

  const isA4 = paper === "A4";

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: ${isA4 ? "A4" : "80mm auto"}; margin: ${isA4 ? "12mm" : "0"}; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="no-print mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">د پاڼې اندازه:</span>
          <Select value={paper} onValueChange={(v) => setPaper(v as PaperSize)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="80mm">80mm (تھرمل)</SelectItem>
              <SelectItem value="A4">A4 (رسمي)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">
            د {sale.customers?.name || "دې پیرودونکي"} لپاره یاد کیږي
          </span>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>
            <Printer className="ml-1 h-4 w-4" />
            {t.print}
          </Button>
          <Button variant="secondary" disabled={downloading} onClick={downloadPdf}>
            <FileDown className="ml-1 h-4 w-4" />
            {downloading ? t.loading : "PDF ډاونلوډ"}
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            بېرته
          </Button>
        </div>
      </div>

      <div ref={receiptRef}>
        {isA4 ? (
          <A4Receipt sale={sale} store={store} totals={totals} />
        ) : (
          <ThermalReceipt sale={sale} store={store} totals={totals} />
        )}
      </div>
    </div>
  );
}

type CommonProps = {
  sale: SaleData;
  store: {
    store_name?: string;
    address?: string;
    phone?: string;
    receipt_footer?: string;
    tax_number?: string;
  } | null;
  totals: { gross: number; lineDiscounts: number; paid: number; balance: number };
};

function ThermalReceipt({ sale, store, totals }: CommonProps) {
  return (
    <div className="receipt mx-auto w-[80mm] bg-white p-3 font-mono text-[12px] leading-tight text-black shadow print:shadow-none">
      <div className="text-center">
        <div className="text-base font-bold">{store?.store_name || t.appName}</div>
        {store?.address && <div className="text-[11px]">{store.address}</div>}
        {store?.phone && (
          <div className="text-[11px]" dir="ltr">
            {store.phone}
          </div>
        )}
        {store?.tax_number && (
          <div className="text-[10px]">
            TIN: <span dir="ltr">{store.tax_number}</span>
          </div>
        )}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between text-[11px]">
        <span>{t.invoice}:</span>
        <span dir="ltr">{sale.invoice_no}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span>{t.date}:</span>
        <span>{jalaliDateTime(sale.sale_date)}</span>
      </div>
      {sale.customers?.name && (
        <div className="flex justify-between text-[11px]">
          <span>{t.customer}:</span>
          <span>{sale.customers.name}</span>
        </div>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="pb-1 text-right">توکی</th>
            <th className="pb-1 text-center">شمېر</th>
            <th className="pb-1 text-left">قیمت</th>
          </tr>
        </thead>
        <tbody>
          {sale.sale_items.map((it) => (
            <tr key={it.id}>
              <td className="py-1">
                <div>{it.products?.name}</div>
                <div className="text-[10px] text-gray-600">
                  {money(it.price)} × {num(it.quantity)}
                  {Number(it.discount) > 0 && <> • تخفیف {money(it.discount)}</>}
                </div>
              </td>
              <td className="py-1 text-center">{num(it.quantity)}</td>
              <td className="py-1 text-left">{money(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-2 border-t border-dashed border-black" />
      <Line label="مجموعه (ناخالص)" value={money(totals.gross)} />
      {totals.lineDiscounts > 0 && (
        <Line label="د لاینونو تخفیف" value={`- ${money(totals.lineDiscounts)}`} />
      )}
      <Line label={t.subtotal} value={money(sale.subtotal)} />
      {Number(sale.discount) > 0 && (
        <Line label={`${t.discount} (فاکتور)`} value={`- ${money(sale.discount)}`} />
      )}
      {Number(sale.tax) > 0 && <Line label={t.tax} value={money(sale.tax)} />}
      <div className="my-1 border-t border-dashed border-black" />
      <Line label={t.total} value={money(sale.total)} bold />
      <div className="my-2 border-t border-dashed border-black" />
      {sale.sale_payments.map((p, i) => (
        <Line key={i} label={t.payMethods[p.method] ?? p.method} value={money(p.amount)} />
      ))}
      <Line label="ورکړ شوی" value={money(totals.paid)} />
      {totals.balance !== 0 && (
        <Line
          label={totals.balance > 0 ? "پاتې پور" : "بېرته ورکړه"}
          value={money(Math.abs(totals.balance))}
          bold
        />
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="text-center text-[11px]">{store?.receipt_footer || "مننه چې راغلاست!"}</div>
      <div className="mt-1 text-center text-[10px] text-gray-600">
        {toPashtoDigits(new Date().toLocaleTimeString("en-GB"))}
      </div>
    </div>
  );
}

function A4Receipt({ sale, store, totals }: CommonProps) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black shadow print:shadow-none">
      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold">{store?.store_name || t.appName}</h1>
          {store?.address && <div className="text-sm text-gray-700">{store.address}</div>}
          {store?.phone && (
            <div className="text-sm text-gray-700" dir="ltr">
              {store.phone}
            </div>
          )}
          {store?.tax_number && (
            <div className="text-xs text-gray-600">
              TIN: <span dir="ltr">{store.tax_number}</span>
            </div>
          )}
        </div>
        <div className="text-left">
          <div className="text-lg font-bold">د پلور فاکتور</div>
          <div className="text-sm">
            شمېره:{" "}
            <span dir="ltr" className="font-mono">
              {sale.invoice_no}
            </span>
          </div>
          <div className="text-sm">نېټه: {jalaliDateTime(sale.sale_date)}</div>
        </div>
      </div>

      {sale.customers?.name && (
        <div className="my-4 rounded border p-3">
          <div className="text-xs text-gray-500">{t.customer}</div>
          <div className="font-semibold">{sale.customers.name}</div>
          {sale.customers.phone && (
            <div className="text-xs" dir="ltr">
              {sale.customers.phone}
            </div>
          )}
        </div>
      )}

      <table className="my-4 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-right">#</th>
            <th className="border p-2 text-right">توکی</th>
            <th className="border p-2 text-center">شمېر</th>
            <th className="border p-2 text-left">قیمت</th>
            <th className="border p-2 text-left">تخفیف</th>
            <th className="border p-2 text-left">مجموعه</th>
          </tr>
        </thead>
        <tbody>
          {sale.sale_items.map((it, i) => (
            <tr key={it.id}>
              <td className="border p-2 text-right">{num(i + 1)}</td>
              <td className="border p-2">{it.products?.name}</td>
              <td className="border p-2 text-center">{num(it.quantity)}</td>
              <td className="border p-2 text-left">{money(it.price)}</td>
              <td className="border p-2 text-left">{money(it.discount)}</td>
              <td className="border p-2 text-left">{money(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <Row label="مجموعه (ناخالص)" value={money(totals.gross)} />
        {totals.lineDiscounts > 0 && (
          <Row label="د لاینونو تخفیف" value={`- ${money(totals.lineDiscounts)}`} />
        )}
        <Row label={t.subtotal} value={money(sale.subtotal)} />
        {Number(sale.discount) > 0 && (
          <Row label={`${t.discount} (فاکتور)`} value={`- ${money(sale.discount)}`} />
        )}
        {Number(sale.tax) > 0 && <Row label={t.tax} value={money(sale.tax)} />}
        <div className="border-t border-black pt-1">
          <Row label={t.total} value={money(sale.total)} bold />
        </div>
        <Row label="ورکړ شوی" value={money(totals.paid)} />
        {totals.balance !== 0 && (
          <Row
            label={totals.balance > 0 ? "پاتې پور" : "بېرته ورکړه"}
            value={money(Math.abs(totals.balance))}
            bold
          />
        )}
      </div>

      <div className="mt-6 border-t pt-3">
        <div className="mb-2 text-sm font-semibold">د تادیې طریقې</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="border p-1 text-right">طریقه</th>
              <th className="border p-1 text-right">حواله</th>
              <th className="border p-1 text-left">اندازه</th>
            </tr>
          </thead>
          <tbody>
            {sale.sale_payments.map((p, i) => (
              <tr key={i}>
                <td className="border p-1">{t.payMethods[p.method] ?? p.method}</td>
                <td className="border p-1 text-xs" dir="ltr">
                  {p.reference || "—"}
                </td>
                <td className="border p-1 text-left">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sale.notes && (
        <div className="mt-4 rounded bg-gray-50 p-3 text-sm">
          <span className="font-semibold">یاداښت: </span>
          {sale.notes}
        </div>
      )}

      <div className="mt-8 flex items-end justify-between border-t pt-6 text-xs text-gray-700">
        <div className="text-center">
          <div className="mb-8">_______________</div>
          <div>د پیرودونکي لاسلیک</div>
        </div>
        <div className="text-center">{store?.receipt_footer || "مننه چې راغلاست!"}</div>
        <div className="text-center">
          <div className="mb-8">_______________</div>
          <div>د پلورونکي لاسلیک</div>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-sm font-bold" : "text-[11px]"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
