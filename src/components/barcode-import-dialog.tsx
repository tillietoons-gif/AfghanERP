import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { Download } from "lucide-react";
import { mapApiErrorToForm } from "@/lib/error-handler";
import {
  createLocalBarcode,
  findLocalProductsByReferences,
  listLocalBarcodes,
  upsertLocalBarcode,
} from "@/lib/local-store";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

type Row = { product_ref: string; barcode: string; pack_size: number; label: string; line: number };
type DupMode = "skip" | "update";
type Conflict = {
  barcode: string;
  existingProduct: string;
  newProduct: string;
  pack_size: number;
  label: string;
};

function parseCsv(text: string): { rows: Row[]; error?: string } {
  const clean = text.replace(/^\ufeff/, "").trim();
  if (!clean) return { rows: [], error: "خالي فایل" };
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "لږترلږه یو صف او د معلوماتو یو کرښه" };
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === ",") {
          out.push(cur);
          cur = "";
        } else if (c === '"') q = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const iRef = header.indexOf("product_ref");
  const iBar = header.indexOf("barcode");
  const iPack = header.indexOf("pack_size");
  const iLabel = header.indexOf("label");
  if (iRef < 0 || iBar < 0) return { rows: [], error: "product_ref او barcode کالمونه اړین دي" };
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i]);
    const ref = (c[iRef] ?? "").trim();
    const barcode = (c[iBar] ?? "").trim();
    if (!ref || !barcode) continue;
    rows.push({
      product_ref: ref,
      barcode,
      pack_size: Math.max(1, Number(iPack >= 0 ? c[iPack] : 1) || 1),
      label: (iLabel >= 0 ? c[iLabel] : "") ?? "",
      line: i + 1,
    });
  }
  return { rows };
}

const SAMPLE_CSV = `product_ref,barcode,pack_size,label
SKU-001,6291001111111,1,ټوټه
SKU-001,6291001111112,6,شپږ ټوټې
SKU-002,6291002222222,12,کارتن
`;

function downloadSample() {
  const blob = new Blob(["\ufeff" + SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "barcode-mappings-sample.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BarcodeImportDialog({ open, onClose, onImported }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [parseError, setParseError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dupMode, setDupMode] = useState<DupMode>("skip");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [csvDupes, setCsvDupes] = useState<string[]>([]);
  const [result, setResult] = useState<{ ok: number; updated: number; skipped: string[] } | null>(
    null,
  );

  const reset = () => {
    setRows([]);
    setParseError("");
    setFieldErrors({});
    setResult(null);
    setConflicts([]);
    setCsvDupes([]);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const onFile = async (f: File) => {
    reset();
    const text = await f.text();
    const parsed = parseCsv(text);
    if (parsed.error) setParseError(parsed.error);
    setRows(parsed.rows);
    if (parsed.rows.length === 0) return;

    // Detect duplicates within the CSV itself (same barcode listed multiple times)
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const r of parsed.rows) {
      const c = seen.get(r.barcode) ?? 0;
      seen.set(r.barcode, c + 1);
      if (c === 1) dupes.push(r.barcode);
    }
    setCsvDupes(dupes);

    // Detect existing mappings in DB
    const codes = [...seen.keys()];
    const existing = await listLocalBarcodes();
    const existMap = new Map<string, { product_id: string; name: string }>();
    existing
      .filter((entry) => codes.includes(entry.barcode))
      .forEach((entry) =>
        existMap.set(entry.barcode, {
          product_id: entry.product_id,
          name: entry.products?.name ?? "—",
        }),
      );

    // Resolve product_ref for the new rows to get "new product" display name
    const refs = [...new Set(parsed.rows.map((row) => row.product_ref).filter(Boolean))];
    const products = await findLocalProductsByReferences(refs);
    const refToName = new Map<string, string>();
    products.forEach((p) => {
      if (p.sku) refToName.set(p.sku, p.name);
      if (p.barcode) refToName.set(p.barcode, p.name);
    });

    const cf: Conflict[] = [];
    for (const r of parsed.rows) {
      const ex = existMap.get(r.barcode);
      if (ex)
        cf.push({
          barcode: r.barcode,
          existingProduct: ex.name,
          newProduct: refToName.get(r.product_ref) ?? r.product_ref,
          pack_size: r.pack_size,
          label: r.label,
        });
    }
    setConflicts(cf);
  };

  const doImport = async () => {
    setFieldErrors({});
    if (rows.length === 0) {
      const mapped = mapApiErrorToForm(
        { fieldErrors: { file: "لومړی د CSV فایل غوره کړئ" } },
        { context: "د بارکوډونو واردول", allowedFields: ["file"] as const },
      );
      setFieldErrors(mapped.fields);
      return;
    }
    setBusy(true);
    const refs = [...new Set(rows.map((row) => row.product_ref).filter(Boolean))];
    let products: Awaited<ReturnType<typeof findLocalProductsByReferences>>;
    let existing: Awaited<ReturnType<typeof listLocalBarcodes>>;
    try {
      [products, existing] = await Promise.all([
        findLocalProductsByReferences(refs),
        listLocalBarcodes(),
      ]);
    } catch (error) {
      setBusy(false);
      setFieldErrors({ file: error instanceof Error ? error.message : "د محصولاتو لټون ناکام شو" });
      return;
    }
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.sku) map.set(p.sku, p.id);
      if (p.barcode) map.set(p.barcode, p.id);
    });

    const skipped: string[] = [];
    let ok = 0;
    let updated = 0;
    const seenInThisRun = new Set<string>();

    for (const r of rows) {
      if (seenInThisRun.has(r.barcode)) {
        skipped.push(`صف ${r.line}: نقل په CSV کې (${r.barcode})`);
        continue;
      }
      seenInThisRun.add(r.barcode);

      const pid = map.get(r.product_ref);
      if (!pid) {
        skipped.push(`صف ${r.line}: محصول ونه موندل شو (${r.product_ref})`);
        continue;
      }

      const payload = {
        product_id: pid,
        barcode: r.barcode,
        pack_size: r.pack_size,
        label: r.label.trim() || null,
      };
      const exists = existing.some((entry) => entry.barcode === r.barcode);
      if (exists && dupMode === "skip") {
        skipped.push(`${r.barcode}: مخکې ثبت شوی — پرېښودل شو`);
        continue;
      }
      try {
        if (exists) {
          await upsertLocalBarcode(payload);
          updated++;
        } else {
          await createLocalBarcode(payload);
          ok++;
        }
      } catch (error) {
        skipped.push(`${r.barcode}: ${error instanceof Error ? error.message : "ناکام"}`);
      }
    }

    setBusy(false);
    setResult({ ok, updated, skipped });
    if (ok > 0) toast.success(`${ok} نوي ثبت شول`);
    if (updated > 0) toast.success(`${updated} تازه شول`);
    if (skipped.length) toast.warning(`${skipped.length} پرېښودل شول`);
    onImported?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>د CSV له لارې د بارکوډونو واردول</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded border bg-muted p-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-semibold">د CSV بڼه:</div>
              <Button type="button" size="sm" variant="outline" onClick={downloadSample}>
                <Download className="ml-1 h-3 w-3" />
                نمونه CSV ډاونلوډ
              </Button>
            </div>
            <code dir="ltr" className="mt-1 block font-mono text-[11px]">
              product_ref,barcode,pack_size,label
            </code>
            <div className="mt-1 text-muted-foreground">
              <code dir="ltr">product_ref</code> = د محصول SKU یا اصلي بارکوډ.{" "}
              <code dir="ltr">pack_size</code> او <code dir="ltr">label</code> اختیاري دي.
            </div>
          </div>
          <div className="space-y-1">
            <Label>د CSV فایل</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              aria-invalid={!!fieldErrors.file}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            {fieldErrors.file && <p className="text-xs text-destructive">{fieldErrors.file}</p>}
          </div>
          {parseError && (
            <div className="rounded border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
              {parseError}
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded border p-2 text-xs">
              <div className="mb-1 font-semibold">مخکتنه: {rows.length} کرښې</div>
              <div className="max-h-32 overflow-auto">
                {rows.slice(0, 5).map((r) => (
                  <div key={r.line} dir="ltr" className="font-mono text-[11px]">
                    {r.product_ref} → {r.barcode} × {r.pack_size} {r.label && `(${r.label})`}
                  </div>
                ))}
                {rows.length > 5 && (
                  <div className="text-muted-foreground">… او {rows.length - 5} نور</div>
                )}
              </div>
            </div>
          )}

          {csvDupes.length > 0 && (
            <div className="rounded border border-yellow-500 bg-yellow-500/10 p-2 text-xs">
              <div className="font-semibold">په CSV کې نقل بارکوډونه: {csvDupes.length}</div>
              <div dir="ltr" className="font-mono text-[11px]">
                {csvDupes.slice(0, 6).join(", ")}
                {csvDupes.length > 6 ? " …" : ""}
              </div>
              <div className="text-muted-foreground">هر یو بارکوډ به یوازې لومړی ځل بررسي شي.</div>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="rounded border border-orange-500 bg-orange-500/10 p-2 text-xs">
              <div className="mb-1 font-semibold">
                شته نقشې چې د دې CSV سره ټکر لري: {conflicts.length}
              </div>
              <div className="max-h-32 overflow-auto">
                {conflicts.slice(0, 6).map((c) => (
                  <div key={c.barcode} className="border-b py-1 last:border-0">
                    <div dir="ltr" className="font-mono text-[11px]">
                      {c.barcode}
                    </div>
                    <div className="text-muted-foreground">
                      اوسنی: <b>{c.existingProduct}</b> ← نوی: <b>{c.newProduct}</b>
                    </div>
                  </div>
                ))}
                {conflicts.length > 6 && (
                  <div className="text-muted-foreground">… او {conflicts.length - 6} نور</div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Label className="text-xs">د نقلونو حالت:</Label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    checked={dupMode === "skip"}
                    onChange={() => setDupMode("skip")}
                  />
                  پرېښودل (Skip)
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    checked={dupMode === "update"}
                    onChange={() => setDupMode("update")}
                  />
                  تازه کول (Update)
                </label>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-1 rounded border p-2 text-xs">
              <div>
                نوي: <b>{result.ok}</b> · تازه شول: <b>{result.updated}</b> · پرېښودل شول:{" "}
                <b>{result.skipped.length}</b>
              </div>
              {result.skipped.length > 0 && (
                <div className="max-h-24 overflow-auto text-destructive">
                  {result.skipped.map((s, i) => (
                    <div key={i}>{s}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t.cancel}
          </Button>
          <Button onClick={doImport} disabled={rows.length === 0 || busy}>
            {busy ? "لېږل..." : "واردول"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
