import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent page header slot: kicker, title, subtitle, right-aligned action cluster.
 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4", className)}>
      <div className="min-w-0">
        {kicker && (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {kicker}
          </div>
        )}
        <h1 className="truncate font-display text-2xl font-bold leading-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </header>
  );
}
