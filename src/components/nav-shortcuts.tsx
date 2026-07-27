import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { registerShortcut, isTypingTarget } from "@/lib/shortcuts-registry";

/**
 * Global "g then X" navigation shortcuts. Press `g` (leader), then a route
 * key within 1.2s to jump. Ignored while typing in inputs.
 *
 *   g d → /            (dashboard)
 *   g p → /pos
 *   g i → /products    (inventory)
 *   g r → /reports
 *   g c → /customers
 *   g s → /suppliers
 *   g u → /purchases
 *   g x → /expenses
 *   g a → /audit
 *   g z → /z-report
 */
const ROUTES: Record<string, { to: string; label: string }> = {
  d: { to: "/", label: "ډشبورډ" },
  p: { to: "/pos", label: "پلور (POS)" },
  i: { to: "/products", label: "انبار" },
  r: { to: "/reports", label: "راپورونه" },
  c: { to: "/customers", label: "پیرودونکي" },
  s: { to: "/suppliers", label: "عرضه کوونکي" },
  u: { to: "/purchases", label: "پیرودل" },
  x: { to: "/expenses", label: "لګښتونه" },
  a: { to: "/audit", label: "د پېښو ثبت" },
  z: { to: "/z-report", label: "Z راپور" },
};

export function NavShortcuts() {
  const navigate = useNavigate();
  const leaderRef = useRef<number | null>(null);

  useEffect(() => {
    const cleanups = Object.entries(ROUTES).map(([k, v]) =>
      registerShortcut({
        id: `nav.g.${k}`,
        combo: `g ${k}`,
        scope: "global",
        description: `ناوبري: ${v.label}`,
      }),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // Awaiting a route key after leader?
      if (leaderRef.current != null) {
        const entry = ROUTES[key];
        window.clearTimeout(leaderRef.current);
        leaderRef.current = null;
        if (entry) {
          e.preventDefault();
          navigate({ to: entry.to as string });
        }
        return;
      }

      if (key === "g" && !e.shiftKey) {
        e.preventDefault();
        leaderRef.current = window.setTimeout(() => {
          leaderRef.current = null;
        }, 1200);
        toast.message("g …", {
          description: "بل کیلي فشار کړئ: d p i r c s u x a z",
          duration: 1200,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (leaderRef.current != null) window.clearTimeout(leaderRef.current);
      cleanups.forEach((c) => c());
    };
  }, [navigate]);

  return null;
}
