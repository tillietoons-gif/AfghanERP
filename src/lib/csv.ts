// CSV export helper with UTF-8 BOM so Excel opens Pashto/Arabic correctly.

export type CsvColumn<T> = {
  key: keyof T | string;
  header: string;
  value?: (row: T) => unknown;
};

function escape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv<T extends Record<string, unknown>>(
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[],
) {
  const header = columns.map((c) => escape(c.header)).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => escape(c.value ? c.value(r) : (r as Record<string, unknown>)[c.key as string]))
        .join(","),
    )
    .join("\n");
  const csv = "\ufeff" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `${filename}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
