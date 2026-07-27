import { useEffect, useRef, useState } from "react";

/**
 * Animated count-up for KPI values. Respects prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number | undefined | null;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const target = Number(value ?? 0);
  const [display, setDisplay] = useState(target);
  const raf = useRef<number | null>(null);
  const from = useRef(target);
  const start = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) {
      setDisplay(target);
      return;
    }
    from.current = display;
    start.current = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start.current) / duration);
      // easeOutExpo
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setDisplay(from.current + (target - from.current) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(display)}
    </span>
  );
}
