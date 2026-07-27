import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";

export type Preset = "today" | "week" | "month" | "year" | "custom";

export function computeRange(
  preset: Preset,
  from: string,
  to: string,
): { from: string; to: string } {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = today.getMonth();
  const dd = today.getDate();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "week": {
      const start = new Date(yyyy, mm, dd - today.getDay());
      return { from: iso(start), to: iso(today) };
    }
    case "month":
      return { from: iso(new Date(yyyy, mm, 1)), to: iso(today) };
    case "year":
      return { from: iso(new Date(yyyy, 0, 1)), to: iso(today) };
    default:
      return { from, to };
  }
}

export function DateRangePreset({
  preset,
  from,
  to,
  onChange,
}: {
  preset: Preset;
  from: string;
  to: string;
  onChange: (p: Preset, from: string, to: string) => void;
}) {
  const presets: { key: Preset; label: string }[] = useMemo(
    () => [
      { key: "today", label: t.today },
      { key: "week", label: t.thisWeek },
      { key: "month", label: t.thisMonth },
      { key: "year", label: t.thisYear },
      { key: "custom", label: t.custom },
    ],
    [],
  );

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={preset === p.key ? "default" : "outline"}
            onClick={() => {
              const r = computeRange(p.key, from, to);
              onChange(p.key, r.from, r.to);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t.from}</Label>
          <Input
            type="date"
            dir="ltr"
            value={from}
            onChange={(e) => onChange("custom", e.target.value, to)}
            className="h-9 w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.to}</Label>
          <Input
            type="date"
            dir="ltr"
            value={to}
            onChange={(e) => onChange("custom", from, e.target.value)}
            className="h-9 w-40"
          />
        </div>
      </div>
    </div>
  );
}
