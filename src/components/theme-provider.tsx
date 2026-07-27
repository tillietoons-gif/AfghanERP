import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type Ctx = {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "app_theme_v1";

function readSystem(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDom(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Hydration-safe read: run once after mount
  useEffect(() => {
    let saved: Theme = "system";
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "light" || raw === "dark" || raw === "system") saved = raw;
    } catch {
      /* ignore */
    }
    setThemeState(saved);
    const next: ResolvedTheme = saved === "system" ? readSystem() : saved;
    setResolved(next);
    applyDom(next);
  }, []);

  // Listen to OS changes when in system mode
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      setResolved(next);
      applyDom(next);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    const next: ResolvedTheme = t === "system" ? readSystem() : t;
    setResolved(next);
    applyDom(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    // Safe fallback so calls outside provider don't crash SSR
    return { theme: "system", resolved: "light", setTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}
