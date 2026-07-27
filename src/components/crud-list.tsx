import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Download,
  Printer,
} from "lucide-react";
import { t } from "@/lib/i18n";
import { money } from "@/lib/format";
import { toast } from "sonner";
import { mapApiErrorToForm, handleError } from "@/lib/error-handler";
import { DataTableShell, DetailDrawer } from "@/components/data-table-shell";
import { PageHeader } from "@/components/page-header";
import { exportCsv } from "@/lib/csv";
import {
  countLocalNamedList,
  countLocalCustomers,
  countLocalSuppliers,
  createLocalCustomer,
  createLocalSupplier,
  deleteLocalCustomers,
  deleteLocalNamedList,
  deleteLocalSuppliers,
  listLocalCustomersFull,
  listLocalNamedList,
  listLocalSuppliers,
  saveLocalNamedList,
  updateLocalCustomer,
  updateLocalSupplier,
} from "@/lib/local-store";

export interface CrudField {
  key: string;
  label: string;
  type?: "text" | "number";
  dir?: "ltr" | "rtl";
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
  createOnly?: boolean;
}
export interface CrudColumn {
  key: string;
  label: string;
  money?: boolean;
  ltr?: boolean;
  sortable?: boolean;
}

type Row = Record<string, unknown> & { id: string };

type LocalNamedList = "categories" | "brands" | "expense_categories";
type LocalEntity = LocalNamedList | "customers" | "suppliers";

function isLocalNamedList(table: string): table is LocalNamedList {
  return table === "categories" || table === "brands" || table === "expense_categories";
}

function isLocalEntity(table: string): table is LocalEntity {
  return isLocalNamedList(table) || table === "customers" || table === "suppliers";
}

export function CrudListPage({
  table,
  title,
  fields,
  columns,
  extraRowActions,
}: {
  table: "suppliers" | "customers" | "categories" | "brands" | "expense_categories";
  title: string;
  fields: CrudField[];
  columns: CrudColumn[];
  extraRowActions?: (row: Row) => ReactNode;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspected, setInspected] = useState<Row | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [debounced, sortKey, sortAsc]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const selectCols = useMemo(() => {
    const keys = new Set<string>(["id"]);
    fields.forEach((f) => keys.add(f.key));
    columns.forEach((c) => keys.add(c.key));
    return Array.from(keys).join(", ");
  }, [fields, columns]);

  const { data, isLoading } = useQuery({
    queryKey: [table, debounced, page, sortKey, sortAsc, selectCols],
    queryFn: async () => {
      const fromIdx = page * PAGE_SIZE;
      if (isLocalNamedList(table)) {
        const [rows, count] = await Promise.all([
          listLocalNamedList(table, debounced, PAGE_SIZE, fromIdx, sortKey, sortAsc),
          countLocalNamedList(table, debounced),
        ]);
        return { rows: rows as Row[], count };
      }
      const [rows, count] =
        table === "customers"
          ? await Promise.all([
              listLocalCustomersFull(debounced, PAGE_SIZE, fromIdx),
              countLocalCustomers(debounced),
            ])
          : await Promise.all([
              listLocalSuppliers(debounced, PAGE_SIZE, fromIdx),
              countLocalSuppliers(debounced),
            ]);
      return { rows: rows as unknown as Row[], count };
    },
  });
  const rows = data?.rows;
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const allChecked = !!rows && rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someChecked = !!rows && rows.some((r) => selectedIds.has(r.id)) && !allChecked;

  const toggleAll = () => {
    if (!rows) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (row?: Row) => {
    setForm(row ?? {});
    setOpen(true);
  };

  const clearErrors = () => {
    setFieldErrors({});
    setFormError(null);
  };

  const onSave = async () => {
    clearErrors();
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      if (form.id && f.createOnly) continue;
      const v = form[f.key];
      if (v === undefined || v === "") payload[f.key] = null;
      else if (f.type === "number") payload[f.key] = Number(v);
      else payload[f.key] = v;
    }
    const localErrors: Record<string, string> = {};
    for (const f of fields) {
      if (
        f.required &&
        (payload[f.key] === null || payload[f.key] === undefined || payload[f.key] === "")
      ) {
        localErrors[f.key] = `${f.label} اړین دی`;
      }
    }
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setFormError("مهرباني وکړئ اړین ډګرونه ډک کړئ");
      return;
    }
    const id = form.id as string | undefined;
    if (isLocalNamedList(table)) {
      try {
        await saveLocalNamedList(table, { id, name: String(payload.name ?? "") });
      } catch (error) {
        setFormError(
          error instanceof Error && error.message === "name_required" ? "نوم اړین دی" : title,
        );
        return;
      }
      toast.success(id ? "سم شو" : "زیات شو");
      setOpen(false);
      setForm({});
      qc.invalidateQueries({ queryKey: [table] });
      return;
    }
    try {
      if (table === "customers") {
        const input = {
          name: String(payload.name ?? ""),
          phone: payload.phone as string | null,
          address: payload.address as string | null,
          opening_balance: Number(payload.opening_balance ?? 0),
        };
        if (id) await updateLocalCustomer(id, input);
        else await createLocalCustomer(input);
      } else if (table === "suppliers") {
        const input = {
          name: String(payload.name ?? ""),
          phone: payload.phone as string | null,
          address: payload.address as string | null,
          opening_balance: Number(payload.opening_balance ?? 0),
        };
        if (id) await updateLocalSupplier(id, input);
        else await createLocalSupplier(input);
      }
    } catch (error) {
      const mapped = mapApiErrorToForm(error, {
        context: title,
        allowedFields: fields.map((field) => field.key),
      });
      setFieldErrors(mapped.fields);
      setFormError(mapped.formMessage ?? null);
      return;
    }
    toast.success(id ? "سم شو" : "زیات شو");
    setOpen(false);
    setForm({});
    qc.invalidateQueries({ queryKey: [table] });
  };

  const onDelete = async (id: string) => {
    if (!confirm(t.areYouSure)) return;
    if (isLocalNamedList(table)) {
      await deleteLocalNamedList(table, [id]);
      toast.success("ړنګ شو");
      setSelectedIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
      qc.invalidateQueries({ queryKey: [table] });
      return;
    }
    if (table === "customers") await deleteLocalCustomers([id]);
    else await deleteLocalSuppliers([id]);
    toast.success("ړنګ شو");
    setSelectedIds((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    qc.invalidateQueries({ queryKey: [table] });
  };

  const onBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} توکي به ړنګ شي. ډاډه یاست؟`)) return;
    const ids = Array.from(selectedIds);
    if (isLocalNamedList(table)) {
      await deleteLocalNamedList(table, ids);
      toast.success(`${ids.length} توکي ړنګ شول`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: [table] });
      return;
    }
    if (table === "customers") await deleteLocalCustomers(ids);
    else await deleteLocalSuppliers(ids);
    toast.success(`${ids.length} توکي ړنګ شول`);
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: [table] });
  };

  const doExport = (which: "page" | "selected") => {
    const source =
      which === "selected" ? (rows ?? []).filter((r) => selectedIds.has(r.id)) : (rows ?? []);
    if (source.length === 0) {
      toast.info(t.noData);
      return;
    }
    exportCsv<Row>(
      title,
      columns.map((c) => ({
        key: c.key,
        header: c.label,
        value: (r) => (c.money ? Number(r[c.key] ?? 0) : (r[c.key] ?? "")),
      })),
      source,
    );
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title={title}
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) {
                setForm({});
                clearErrors();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => startEdit()}>
                <Plus className="ml-1 h-4 w-4" />
                {t.add}
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl" className="max-w-xl">
              <DialogHeader>
                <DialogTitle>
                  {form.id ? t.edit : t.add} — {title}
                </DialogTitle>
              </DialogHeader>
              {formError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {fields
                  .filter((field) => !form.id || !field.createOnly)
                  .map((f) => {
                    const err = fieldErrors[f.key];
                    const inputId = `crud-${f.key}`;
                    const errId = `crud-${f.key}-err`;
                    return (
                      <div
                        key={f.key}
                        className={f.textarea ? "md:col-span-2 space-y-1" : "space-y-1"}
                      >
                        <Label htmlFor={inputId}>
                          {f.label}
                          {f.required && <span className="text-destructive"> *</span>}
                        </Label>
                        {f.textarea ? (
                          <Textarea
                            id={inputId}
                            value={(form[f.key] as string) ?? ""}
                            onChange={(e) => {
                              setForm({ ...form, [f.key]: e.target.value });
                              if (err)
                                setFieldErrors((p) => {
                                  const n = { ...p };
                                  delete n[f.key];
                                  return n;
                                });
                            }}
                            dir={f.dir}
                            aria-invalid={!!err}
                            aria-describedby={err ? errId : undefined}
                            className={
                              err ? "border-destructive focus-visible:ring-destructive" : undefined
                            }
                          />
                        ) : (
                          <Input
                            id={inputId}
                            type={f.type ?? "text"}
                            dir={f.dir}
                            placeholder={f.placeholder}
                            value={(form[f.key] as string | number | null | undefined) ?? ""}
                            onChange={(e) => {
                              setForm({ ...form, [f.key]: e.target.value });
                              if (err)
                                setFieldErrors((p) => {
                                  const n = { ...p };
                                  delete n[f.key];
                                  return n;
                                });
                            }}
                            aria-invalid={!!err}
                            aria-describedby={err ? errId : undefined}
                            className={
                              err ? "border-destructive focus-visible:ring-destructive" : undefined
                            }
                          />
                        )}
                        {err && (
                          <p id={errId} role="alert" className="text-xs text-destructive">
                            {err}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    clearErrors();
                  }}
                >
                  {t.cancel}
                </Button>
                <Button onClick={onSave}>{t.save}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <DataTableShell
        loading={isLoading}
        isEmpty={!isLoading && (!rows || rows.length === 0)}
        selectionCount={selectedIds.size}
        toolbar={
          <div className="relative w-full max-w-md">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              className="pr-10"
              data-shortcut="filter"
              aria-keyshortcuts="Control+F"
            />
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => doExport("page")}
              data-shortcut="export"
            >
              <Download className="ml-1 h-4 w-4" />
              {t.export} CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="ml-1 h-4 w-4" />
              چاپ
            </Button>
          </>
        }
        bulk={
          <>
            <Button size="sm" variant="outline" onClick={() => doExport("selected")}>
              <Download className="ml-1 h-4 w-4" />
              CSV د ټاکل شویو
            </Button>
            <Button size="sm" variant="destructive" onClick={onBulkDelete}>
              <Trash2 className="ml-1 h-4 w-4" />
              ړنګول
            </Button>
          </>
        }
        footer={
          <>
            <span>
              {totalCount > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} / ${totalCount}`
                : "—"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                مخکینی
              </Button>
              <span className="text-xs">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                راتلونکی
              </Button>
            </div>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="ټول وټاکئ"
                />
              </TableHead>
              {columns.map((c) => {
                const active = sortKey === c.key;
                const Icon = active ? (sortAsc ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead key={c.key} className="text-right">
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.label}
                        <Icon
                          className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/60"}`}
                        />
                      </button>
                    ) : (
                      c.label
                    )}
                  </TableHead>
                );
              })}
              <TableHead className="text-right">{t.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((r) => (
              <TableRow
                key={r.id}
                data-state={selectedIds.has(r.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button,input,[role=checkbox],a")) return;
                  setInspected(r);
                }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(r.id)}
                    onCheckedChange={() => toggleOne(r.id)}
                    aria-label="وټاکئ"
                  />
                </TableCell>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    dir={c.ltr ? "ltr" : undefined}
                    className={c.ltr ? "text-right" : ""}
                  >
                    {c.money
                      ? money(r[c.key] as number)
                      : ((r[c.key] as string | number | null) ?? "—")}
                  </TableCell>
                ))}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    {extraRowActions?.(r)}
                    <Button size="icon" variant="ghost" onClick={() => startEdit(r)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>

      <DetailDrawer
        open={!!inspected}
        onClose={() => setInspected(null)}
        title={(inspected?.name as string) ?? title}
        subtitle={
          inspected?.id ? (
            <span dir="ltr" className="font-mono">
              {String(inspected.id)}
            </span>
          ) : undefined
        }
        actions={
          inspected && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const r = inspected;
                setInspected(null);
                startEdit(r);
              }}
            >
              <Edit className="ml-1 h-4 w-4" />
              {t.edit}
            </Button>
          )
        }
      >
        {inspected && (
          <dl className="space-y-3 text-sm">
            {fields.map((f) => {
              const v = inspected[f.key];
              return (
                <div key={f.key} className="border-b border-border-hair pb-2">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap break-words" dir={f.dir}>
                    {v === null || v === undefined || v === "" ? "—" : String(v)}
                  </dd>
                </div>
              );
            })}
            {columns
              .filter((c) => !fields.some((f) => f.key === c.key))
              .map((c) => {
                const v = inspected[c.key];
                return (
                  <div key={c.key} className="border-b border-border-hair pb-2">
                    <dt className="text-xs text-muted-foreground">{c.label}</dt>
                    <dd className="mt-0.5 font-medium">
                      {c.money
                        ? money(Number(v ?? 0))
                        : v === null || v === undefined || v === ""
                          ? "—"
                          : String(v)}
                    </dd>
                  </div>
                );
              })}
          </dl>
        )}
      </DetailDrawer>
    </div>
  );
}
