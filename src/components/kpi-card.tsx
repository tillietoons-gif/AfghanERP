import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AnimatedNumber } from "./animated-number";
import { cn } from "@/lib/utils";

export type KpiTone = "primary" | "success" | "warning" | "danger" | "info" | "gold";

const tones: Record<KpiTone, { icon: string; ring: string; glow: string }> = {
  primary: {
    icon: "text-primary bg-primary/12",
    ring: "ring-primary/20",
    glow: "before:bg-primary/10",
  },
  success: {
    icon: "text-success bg-success/12",
    ring: "ring-success/20",
    glow: "before:bg-success/10",
  },
  warning: {
    icon: "text-warning-foreground bg-accent/40",
    ring: "ring-accent/30",
    glow: "before:bg-accent/15",
  },
  danger: {
    icon: "text-destructive bg-destructive/12",
    ring: "ring-destructive/20",
    glow: "before:bg-destructive/10",
  },
  info: {
    icon: "text-chart-4 bg-chart-4/12",
    ring: "ring-chart-4/20",
    glow: "before:bg-chart-4/10",
  },
  gold: {
    icon: "text-accent-foreground bg-accent/40",
    ring: "ring-accent/30",
    glow: "before:bg-accent/20",
  },
};

export function KpiCard({
  title,
  value,
  format = (v) => String(v),
  icon: Icon,
  tone = "primary",
  delta,
  hint,
  to,
  className,
}: {
  title: string;
  value: number | undefined | null;
  format?: (n: number) => string;
  icon: LucideIcon;
  tone?: KpiTone;
  delta?: number; // percent
  hint?: string;
  to?: string;
  className?: string;
}) {
  const styles = tones[tone];
  const isNum = typeof value === "number";
  const positive = (delta ?? 0) >= 0;

  const inner = (
    <div
      className={cn(
        "group relative isolate overflow-hidden rounded-xl border border-border-hair bg-card p-4 shadow-crisp",
        "hover-lift hover:border-border-strong hover:shadow-float",
        "before:pointer-events-none before:absolute before:-right-8 before:-top-8 before:h-32 before:w-32 before:rounded-full before:opacity-0 before:blur-2xl before:transition-opacity before:duration-500 group-hover:before:opacity-100",
        styles.glow,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1",
            styles.icon,
            styles.ring,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        {typeof delta === "number" && (
          <span className={cn("chip", positive ? "text-success" : "text-destructive")}>
            {positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 font-display text-2xl font-bold leading-tight text-foreground">
        {isNum ? (
          <AnimatedNumber value={value as number} format={format} />
        ) : (
          <span className="opacity-40">—</span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}

      {/* Gold hairline at bottom */}
      <span
        aria-hidden="true"
        className="absolute inset-x-4 bottom-0 h-px opacity-40 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent) 60%, transparent), transparent)",
        }}
      />
    </div>
  );

  if (to)
    return (
      <Link to={to} className="block outline-none focus-visible:ring-focus">
        {inner}
      </Link>
    );
  return inner;
}
