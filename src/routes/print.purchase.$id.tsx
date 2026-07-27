import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, num, jalaliDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Printer, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  getLocalPurchase,
  getLocalPurchaseItems,
  getLocalStoreSettings,
  getLocalSupplier,
} from "@/lib/local-store";

export const Route = createFileRoute("/print/purchase/$id")({
  component: () => (
    <ProtectedRoute bare allowedRoles={["owner", "admin", "manager", "inventory_officer"]}>
      <PurchaseReceiptPage />
    </ProtectedRoute>
  ),
});

type PaperSize = "80mm" | "A4";

interface PurchaseData {
  id: string;
  invoice_no: string;
  supplier_invoice_no: string | null;
  purchase_date: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  notes: string | null;
  supplier_id: string | null;
  suppliers: { name?: string; phone?: string } | null;
  purchase_items: {
    id: string;
    quantity: number;
    cost: number;
    subtotal: number;
    products: { name?: string } | null;
  }[];
}

const DEFAULT_KEY = "purchase.paper";
const supplierKey = (id: string | null) => `purchase.paper.supplier.${id ?? "none"}`;

function readInitialPaper(): PaperSize {
  if (typeof window === "undefined") return "80mm";
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

function PurchaseReceiptPage() {
  const { id } = Route.useParams();
  const [p, setP] = useState<PurchaseData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [store, setStore] = useState<{
    store_name?: string;
    address?: string;
    phone?: string;
  } | null>(null);
  const [paper, setPaper] = useState<PaperSize>(readInitialPaper);
  const [paperLoaded, setPaperLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [autoPrinted, setAutoPrinted] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const purchase = await getLocalPurchase(id);
        if (!purchase) {
          setLoadError("دا د پېرود رسيد و نه موندل شو.");
          postToParent({ type: "receipt-error", message: "دا د پېرود رسيد و نه موندل شو." });
          return;
        }
        const [items, supplier, settings] = await Promise.all([
          getLocalPurchaseItems(id),
          purchase.supplier_id ? getLocalSupplier(purchase.supplier_id) : Promise.resolve(null),
          getLocalStoreSettings(),
        ]);
        setP({
          ...purchase,
          suppliers: supplier ? { name: supplier.name, phone: supplier.phone ?? undefined } : null,
          purchase_items: items.map((item) => ({ ...item, products: { name: item.product_name } })),
        });
        setStore({
          store_name: settings.store_name,
          address: settings.address ?? undefined,
          phone: settings.phone ?? undefined,
        });
        requestAnimationFrame(() => postToParent({ type: "receipt-ready" }));
      } catch (e) {
        const msg = (e as Error)?.message || "د پېرود رسيد بار کول ناکام شول.";
        setLoadError(msg);
        postToParent({ type: "receipt-error", message: msg });
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!p || paperLoaded) return;
    const perSup = localStorage.getItem(supplierKey(p.supplier_id));
    if (perSup === "80mm" || perSup === "A4") setPaper(perSup);
    setPaperLoaded(true);
  }, [p, paperLoaded]);

  useEffect(() => {
    if (!paperLoaded) return;
    localStorage.setItem(DEFAULT_KEY, paper);
    if (p) localStorage.setItem(supplierKey(p.supplier_id), paper);
  }, [paper, p, paperLoaded]);

  useEffect(() => {
    if (!p || autoPrinted) return;
    setAutoPrinted(true);
    const isPreview =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "1";
    if (!isPreview) setTimeout(() => window.print(), 500);
  }, [p, autoPrinted]);

  const downloadPdf = useCallback(async () => {
    if (!receiptRef.current || !p) return;
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
        const imgH = (canvas.height * pageW) / canvas.width;
        pdf.addImage(imgData, "PNG", 0, 0, pageW, Math.min(imgH, 297));
      } else {
        const widthMm = 80;
        const heightMm = (canvas.height * widthMm) / canvas.width;
        pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
        pdf.addImage(imgData, "PNG", 0, 0, widthMm, heightMm);
      }
      pdf.save(`purchase-${p.invoice_no}.pdf`);
      postToParent({ type: "download-pdf-done", invoice: p.invoice_no });
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg);
      postToParent({ type: "download-pdf-error", message: msg });
    } finally {
      setDownloading(false);
    }
  }, [paper, p]);

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

  if (loadError) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <div className="text-base font-semibold">د پېرود رسيد ښودل ناکام شول</div>
          <div className="text-sm text-muted-foreground">{loadError}</div>
        </div>
      </div>
    );
  }
  if (!p) return <div className="p-6 text-center">{t.loading}</div>;

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
            د {p.suppliers?.name || "دې عرضه کوونکي"} لپاره یاد کیږي
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
          <A4PurchaseReceipt p={p} store={store} />
        ) : (
          <ThermalPurchaseReceipt p={p} store={store} />
        )}
      </div>
    </div>
  );
}

type CommonProps = {
  p: PurchaseData;
  store: { store_name?: string; address?: string; phone?: string } | null;
};

function ThermalPurchaseReceipt({ p, store }: CommonProps) {
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
        <div className="mt-1 text-[11px] font-bold">— د پېرود رسيد —</div>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between text-[11px]">
        <span>{t.invoice}:</span>
        <span dir="ltr">{p.invoice_no}</span>
      </div>
      {p.supplier_invoice_no && (
        <div className="flex justify-between text-[11px]">
          <span>د عرضه کوونکي رسید:</span>
          <span dir="ltr">{p.supplier_invoice_no}</span>
        </div>
      )}
      <div className="flex justify-between text-[11px]">
        <span>{t.date}:</span>
        <span>{jalaliDateTime(p.purchase_date)}</span>
      </div>
      {p.suppliers?.name && (
        <div className="flex justify-between text-[11px]">
          <span>عرضه کوونکی:</span>
          <span>{p.suppliers.name}</span>
        </div>
      )}
      {p.suppliers?.phone && (
        <div className="flex justify-between text-[11px]">
          <span>ټیلیفون:</span>
          <span dir="ltr">{p.suppliers.phone}</span>
        </div>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="pb-1 text-right">توکی</th>
            <th className="pb-1 text-center">شمېر</th>
            <th className="pb-1 text-left">لګښت</th>
          </tr>
        </thead>
        <tbody>
          {p.purchase_items.map((it) => (
            <tr key={it.id}>
              <td className="py-1">
                <div>{it.products?.name}</div>
                <div className="text-[10px] text-gray-600">
                  {money(it.cost)} × {num(it.quantity)}
                </div>
              </td>
              <td className="py-1 text-center">{num(it.quantity)}</td>
              <td className="py-1 text-left">{money(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="my-2 border-t border-dashed border-black" />
      <Line label={t.subtotal} value={money(p.subtotal)} />
      {Number(p.discount) > 0 && <Line label={t.discount} value={`- ${money(p.discount)}`} />}
      <div className="my-1 border-t border-dashed border-black" />
      <Line label={t.total} value={money(p.total)} bold />
      <Line label={t.paid} value={money(p.paid)} />
      <Line label={t.due} value={money(Number(p.total) - Number(p.paid))} />
      {p.notes && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="text-[11px]">{p.notes}</div>
        </>
      )}
    </div>
  );
}

function A4PurchaseReceipt({ p, store }: CommonProps) {
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
        </div>
        <div className="text-left">
          <div className="text-lg font-bold">د پېرود فاکتور</div>
          <div className="text-sm">
            شمېره:{" "}
            <span dir="ltr" className="font-mono">
              {p.invoice_no}
            </span>
          </div>
          {p.supplier_invoice_no && (
            <div className="text-sm">
              د عرضه کوونکي:{" "}
              <span dir="ltr" className="font-mono">
                {p.supplier_invoice_no}
              </span>
            </div>
          )}
          <div className="text-sm">نېټه: {jalaliDateTime(p.purchase_date)}</div>
        </div>
      </div>

      {p.suppliers?.name && (
        <div className="my-4 rounded border p-3">
          <div className="text-xs text-gray-500">عرضه کوونکی</div>
          <div className="font-semibold">{p.suppliers.name}</div>
          {p.suppliers.phone && (
            <div className="text-xs" dir="ltr">
              {p.suppliers.phone}
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
            <th className="border p-2 text-left">لګښت</th>
            <th className="border p-2 text-left">مجموعه</th>
          </tr>
        </thead>
        <tbody>
          {p.purchase_items.map((it, i) => (
            <tr key={it.id}>
              <td className="border p-2 text-right">{num(i + 1)}</td>
              <td className="border p-2">{it.products?.name}</td>
              <td className="border p-2 text-center">{num(it.quantity)}</td>
              <td className="border p-2 text-left">{money(it.cost)}</td>
              <td className="border p-2 text-left">{money(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <Row label={t.subtotal} value={money(p.subtotal)} />
        {Number(p.discount) > 0 && <Row label={t.discount} value={`- ${money(p.discount)}`} />}
        <div className="border-t border-black pt-1">
          <Row label={t.total} value={money(p.total)} bold />
        </div>
        <Row label={t.paid} value={money(p.paid)} />
        <Row label={t.due} value={money(Number(p.total) - Number(p.paid))} bold />
      </div>

      {p.notes && (
        <div className="mt-4 rounded bg-gray-50 p-3 text-sm">
          <span className="font-semibold">یاداښت: </span>
          {p.notes}
        </div>
      )}
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
