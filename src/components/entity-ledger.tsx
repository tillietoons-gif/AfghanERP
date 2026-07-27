import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, ArrowRight, Download, Loader2, Plus, Printer } from "lucide-react";
import { t } from "@/lib/i18n";
import { money, jalaliDateTime, num } from "@/lib/format";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";
import {
  getCustomerLedger,
  getLocalCustomer,
  getLocalSupplier,
  getSupplierLedger,
  recordLocalCustomerPayment,
  recordLocalSupplierPayment,
} from "@/lib/local-store";

export type LedgerKind = "customer" | "supplier";

type PayMethod = "cash" | "card" | "bank_transfer" | "mobile_money";

type Entry = {
  date: string;
  ref: string;
  description: string;
  debit: number;
  credit: number;
  txnId?: string;
};

// ── Strict per-kind config: literal types are pinned to the kind so the
// compiler rejects any customer_id / supplier_id or table-name mismatch. ──
interface CommonConfig {
  txnLabel: string;
  debitHeader: string;
  balanceStatLabel: string;
  totalDebitLabel: string;
  dialogTitle: string;
  csvPrefix: string;
}

interface CustomerConfig extends CommonConfig {
  kind: "customer";
  entityTable: "customers";
  txnTable: "sales";
  txnSelect: string;
  txnDateCol: "sale_date";
  txnFkCol: "customer_id";
  paymentsTable: "customer_payments";
  paymentRpc: "record_customer_payment";
  paymentRpcIdParam: "p_customer_id";
  backTo: "/customers";
  printRoute: "/print/receipt/$id";
  extraCityField: "province";
}

interface SupplierConfig extends CommonConfig {
  kind: "supplier";
  entityTable: "suppliers";
  txnTable: "purchases";
  txnSelect: string;
  txnDateCol: "purchase_date";
  txnFkCol: "supplier_id";
  paymentsTable: "supplier_payments";
  paymentRpc: "record_supplier_payment";
  paymentRpcIdParam: "p_supplier_id";
  backTo: "/suppliers";
  printRoute: "/print/purchase/$id";
  extraCityField: "city";
}

type LedgerConfig<K extends LedgerKind> = K extends "customer"
  ? CustomerConfig
  : K extends "supplier"
    ? SupplierConfig
    : never;

// `satisfies` enforces the discriminated shape at declaration time — swapping
// any literal (e.g. txnFkCol on customer to "supplier_id") is a compile error.
const CONFIGS = {
  customer: {
    kind: "customer",
    entityTable: "customers",
    txnTable: "sales",
    txnSelect: "id, invoice_no, sale_date, total, paid",
    txnDateCol: "sale_date",
    txnFkCol: "customer_id",
    paymentsTable: "customer_payments",
    paymentRpc: "record_customer_payment",
    paymentRpcIdParam: "p_customer_id",
    backTo: "/customers",
    printRoute: "/print/receipt/$id",
    extraCityField: "province",
    txnLabel: "پلور",
    debitHeader: "پور",
    balanceStatLabel: "اوسنی بیلانس",
    totalDebitLabel: "ټول پلور",
    dialogTitle: "د ورکړې ثبت",
    csvPrefix: "customer",
  },
  supplier: {
    kind: "supplier",
    entityTable: "suppliers",
    txnTable: "purchases",
    txnSelect: "id, invoice_no, supplier_invoice_no, purchase_date, total, paid",
    txnDateCol: "purchase_date",
    txnFkCol: "supplier_id",
    paymentsTable: "supplier_payments",
    paymentRpc: "record_supplier_payment",
    paymentRpcIdParam: "p_supplier_id",
    backTo: "/suppliers",
    printRoute: "/print/purchase/$id",
    extraCityField: "city",
    txnLabel: "پېرود",
    debitHeader: "بدهی",
    balanceStatLabel: "پاتې بدهی",
    totalDebitLabel: "ټول پېرود",
    dialogTitle: "عرضه کوونکي ته ورکړه",
    csvPrefix: "supplier",
  },
} as const satisfies { [K in LedgerKind]: LedgerConfig<K> };

interface TxnRowRaw {
  id: string;
  invoice_no: string;
  supplier_invoice_no?: string | null;
  total: number | string | null;
  paid: number | string | null;
  sale_date?: string;
  purchase_date?: string;
}
interface PaymentRowRaw {
  id: string;
  payment_date: string;
  amount: number | string;
  method: string;
  reference: string | null;
  notes: string | null;
}
interface EntityRow {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  balance?: number | string | null;
  province?: string | null;
  city?: string | null;
}

interface Props {
  kind: LedgerKind;
  id: string;
  initialFrom?: string;
  initialTo?: string;
}

export function EntityLedger({ kind, id, initialFrom, initialTo }: Props) {
  // Widen to the union so field access below type-checks against both shapes,
  // but the actual runtime value is still the pinned per-kind config.
  const cfg: CustomerConfig | SupplierConfig = CONFIGS[kind];
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");

  const entityQ = useQuery({
    queryKey: [cfg.kind, id],
    queryFn: async (): Promise<EntityRow | null> =>
      kind === "customer" ? await getLocalCustomer(id) : await getLocalSupplier(id),
  });

  const ledgerQ = useQuery({
    queryKey: [`${cfg.kind}-ledger`, id],
    queryFn: () => (kind === "customer" ? getCustomerLedger(id) : getSupplierLedger(id)),
  });

  const isLoading = entityQ.isLoading || ledgerQ.isLoading;
  const failedQuery = entityQ.isError ? entityQ : ledgerQ.isError ? ledgerQ : null;
  const retryAll = () => {
    void entityQ.refetch();
    void ledgerQ.refetch();
  };

  const entries = useMemo<Entry[]>(() => {
    return (ledgerQ.data ?? []).map((entry) => ({
      date: entry.date,
      ref: "—",
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      txnId: entry.id,
    }));
  }, [ledgerQ.data]);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (from && new Date(e.date) < new Date(from)) return false;
        if (to && new Date(e.date) > new Date(to + "T23:59:59")) return false;
        return true;
      }),
    [entries, from, to],
  );

  const totals = useMemo(() => {
    let debit = 0,
      credit = 0;
    filtered.forEach((e) => {
      debit += e.debit;
      credit += e.credit;
    });
    return { debit, credit, net: debit - credit };
  }, [filtered]);

  const withBalance = useMemo(() => {
    let running = 0;
    return filtered.map((e) => {
      running += e.debit - e.credit;
      return { ...e, balance: running };
    });
  }, [filtered]);

  const savePayment = async () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      toast.error("ناسمه اندازه");
      return;
    }
    try {
      if (kind === "customer") {
        await recordLocalCustomerPayment({
          customer_id: id,
          amount: amt,
          method: payMethod,
          reference: payRef || null,
        });
      } else {
        await recordLocalSupplierPayment({
          supplier_id: id,
          amount: amt,
          method: payMethod,
          reference: payRef || null,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ورکړه ثبت نه شوه");
      return;
    }
    toast.success("ورکړه ثبت شوه");
    setPayOpen(false);
    setPayAmount("");
    setPayRef("");
    setPayNotes("");
    setPayMethod("cash");
    qc.invalidateQueries({ queryKey: [cfg.kind, id] });
    qc.invalidateQueries({ queryKey: [`${cfg.kind}-ledger`, id] });
  };

  const entity = entityQ.data ?? null;

  const doExport = () => {
    exportCsv<(Entry & { balance: number }) & Record<string, unknown>>(
      `${cfg.csvPrefix}-${entity?.name ?? id}-ledger`,
      [
        { key: "date", header: "نېټه", value: (r) => new Date(r.date).toISOString() },
        { key: "ref", header: "رسید" },
        { key: "description", header: "تفصیل" },
        { key: "debit", header: cfg.debitHeader },
        { key: "credit", header: "ورکړه" },
        { key: "balance", header: "روان بیلانس" },
      ],
      withBalance as ((Entry & { balance: number }) & Record<string, unknown>)[],
    );
  };

  const balance = Number(entity?.balance ?? 0);
  const name = entity?.name ?? (isLoading ? t.loading : t.entityNotFound);
  const phone = entity?.phone ?? undefined;
  const cityVal = cfg.extraCityField === "province" ? entity?.province : entity?.city;
  const address = entity?.address ?? undefined;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Link to={cfg.backTo}>
              <Button size="icon" variant="ghost">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">{name}</h1>
          </div>
          <div className="mr-11 mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {phone && <span dir="ltr">☎ {phone}</span>}
            {cityVal && <span>{cityVal}</span>}
            {address && <span>{address}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={doExport}
            disabled={filtered.length === 0}
            data-shortcut="export"
          >
            <Download className="ml-1 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="ml-1 h-4 w-4" />
            چاپ
          </Button>
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ml-1 h-4 w-4" />د ورکړې ثبت
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-md">
              <DialogHeader>
                <DialogTitle>{cfg.dialogTitle}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>اندازه</Label>
                  <Input
                    type="number"
                    dir="ltr"
                    value={payAmount}
                    onChange={(e) =>
                      setPayAmount(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>طریقه</Label>
                  <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PayMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقد</SelectItem>
                      <SelectItem value="card">کارت</SelectItem>
                      <SelectItem value="bank_transfer">بانکي انتقال</SelectItem>
                      <SelectItem value="mobile_money">موبایل پیسې</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>مرجع (اختیاري)</Label>
                  <Input dir="ltr" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t.notes}</Label>
                  <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayOpen(false)}>
                  {t.cancel}
                </Button>
                <Button onClick={savePayment}>{t.save}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {failedQuery && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>
              {t.loadFailed}
              {failedQuery.error instanceof Error ? ` — ${failedQuery.error.message}` : ""}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={retryAll}>
            {t.retry}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label={cfg.balanceStatLabel}
          value={money(balance)}
          highlight={balance > 0 ? "warn" : balance < 0 ? "ok" : undefined}
        />
        <StatCard label={cfg.totalDebitLabel} value={money(totals.debit)} />
        <StatCard label="ټولې ورکړې" value={money(totals.credit)} />
        <StatCard label="د دورې خالص" value={money(totals.net)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>د حساب کتابچه ({num(filtered.length, 0)})</span>
            <div className="flex flex-wrap items-center gap-2 text-xs font-normal">
              <Label className="text-xs">له:</Label>
              <Input
                type="date"
                className="h-8 w-40"
                dir="ltr"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <Label className="text-xs">تر:</Label>
              <Input
                type="date"
                className="h-8 w-40"
                dir="ltr"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              {(from || to) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                >
                  پاکول
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">نېټه</TableHead>
                <TableHead className="text-right">رسید</TableHead>
                <TableHead className="text-right">تفصیل</TableHead>
                <TableHead className="text-right">{cfg.debitHeader}</TableHead>
                <TableHead className="text-right">ورکړه</TableHead>
                <TableHead className="text-right">بیلانس</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t.loadingLedger}
                    </span>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !failedQuery && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    {entries.length === 0 ? t.noLedgerEntries : t.noData}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && failedQuery && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <span>{t.loadFailed}</span>
                      <Button size="sm" variant="outline" onClick={retryAll}>
                        {t.retry}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {withBalance.map((e, i) => (
                <TableRow key={`${e.ref}-${i}`}>
                  <TableCell className="whitespace-nowrap">{jalaliDateTime(e.date)}</TableCell>
                  <TableCell dir="ltr" className="font-mono text-xs text-right">
                    {e.txnId ? (
                      <Link
                        to={cfg.printRoute}
                        params={{ id: e.txnId }}
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        {e.ref}
                      </Link>
                    ) : (
                      e.ref
                    )}
                  </TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className="text-destructive">
                    {e.debit ? money(e.debit) : "—"}
                  </TableCell>
                  <TableCell className="text-emerald-600">
                    {e.credit ? money(e.credit) : "—"}
                  </TableCell>
                  <TableCell className="font-semibold">{money(e.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "ok" | "warn";
}) {
  const color =
    highlight === "warn" ? "text-destructive" : highlight === "ok" ? "text-emerald-600" : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
