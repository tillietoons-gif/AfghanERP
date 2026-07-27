import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Slim top progress bar shown while:
 *  - the router is transitioning to a new route (loader running), or
 *  - there is any in-flight TanStack Query fetch/mutation.
 *
 * Idle → hidden. Active → animated fill.
 */
export function TopProgressBar() {
  const routerStatus = useRouterState({ select: (s) => s.status });
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const busy = routerStatus === "pending" || isFetching > 0 || isMutating > 0;

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    if (busy) {
      setVisible(true);
      setProgress((p) => (p < 10 ? 10 : p));
      interval = setInterval(() => {
        setProgress((p) => (p >= 90 ? 90 : p + Math.max(1, (90 - p) * 0.08)));
      }, 200);
    } else if (visible) {
      setProgress(100);
      hideTimer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 350);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [busy, visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-0.5 bg-transparent print:hidden"
    >
      <div
        className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary shadow-[0_0_10px_hsl(var(--primary))] transition-[width,opacity] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
