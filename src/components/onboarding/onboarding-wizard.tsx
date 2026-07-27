import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Sparkles,
  X,
  RotateCcw,
  Check,
  Languages,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { announce } from "@/lib/announce";
import { registerShortcut, isTypingTarget } from "@/lib/shortcuts-registry";
import {
  ONBOARDING_STEPS,
  getLastStep,
  setLastStep,
  markDismissed,
  isDismissed,
  resetProgress,
  getLang,
  setLang,
  markResume,
  readResume,
  clearResume,
  findStepByRoute,
  type OnboardingLang,
  type OnboardingStep,
} from "@/lib/onboarding";
import { logOnboardingEvent } from "@/lib/onboarding-analytics";

interface OnboardingContextValue {
  open: (opts?: { restart?: boolean; stepIndex?: number }) => void;
  close: () => void;
  markComplete: () => Promise<void>;
}

const Ctx = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding must be used within OnboardingProvider");
  return v;
}

const AUTO_OPEN_ROUTES_SKIP = new Set(["/auth"]);
const RESUME_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

function completionKey(userId: string): string {
  return `asserp:onboarding:completed:${userId}`;
}

/** Localized UI strings for wizard chrome. */
const UI = {
  ps: {
    tour: "د زده‌کړې لارښود",
    step: "ګام",
    of: "له",
    restart: "بیا پیل",
    close: "پرېښودل",
    prev: "مخکینی",
    next: "بل",
    finish: "پای — پیل کول",
    goto: "لاړ شه",
    stepsList: "د ګامونو لست",
    finishedToast: "لارښود بشپړ شو — هرکله وغواړئ د پورتنۍ کرښې د زده‌کړې تڼۍ څخه یې بیا خلاص کړئ.",
    finishedToastTitle: "ښه شو! ټول چمتو دي",
    resumeAria: "لارښود د وروستي ګام څخه بیا پرانستل شو",
  },
  en: {
    tour: "Guided Tour",
    step: "Step",
    of: "of",
    restart: "Restart",
    close: "Close",
    prev: "Previous",
    next: "Next",
    finish: "Finish — get started",
    goto: "Go",
    stepsList: "Steps",
    finishedToast: "You can reopen the tour any time from the Help button in the top bar.",
    finishedToastTitle: "You're all set!",
    resumeAria: "Tour reopened at your last step",
  },
} as const;

/** Focus + briefly highlight the step's key element on the current page. */
function focusStepTarget(step: OnboardingStep) {
  if (typeof window === "undefined" || !step.focusSelector) return;
  const tryFocus = (attempt = 0) => {
    const el = document.querySelector<HTMLElement>(step.focusSelector!);
    if (!el) {
      if (attempt < 8) window.setTimeout(() => tryFocus(attempt + 1), 150);
      return;
    }
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      // ignore
    }
    // Make non-focusable elements focusable temporarily
    const hadTabIndex = el.hasAttribute("tabindex");
    if (!hadTabIndex) el.setAttribute("tabindex", "-1");
    try {
      el.focus({ preventScroll: true });
    } catch {
      // ignore
    }
    el.classList.add("onboarding-highlight");
    window.setTimeout(() => {
      el.classList.remove("onboarding-highlight");
      if (!hadTabIndex) el.removeAttribute("tabindex");
    }, 2400);
  };
  // Wait a tick for the route to render
  window.setTimeout(() => tryFocus(0), 120);
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [lang, setLangState] = useState<OnboardingLang>(() => getLang());
  const autoOpenAttempted = useRef(false);
  const pendingFocusRef = useRef<OnboardingStep | null>(null);

  // Auto-open once per local operator if onboarding has not been completed;
  // OR reopen at the last step if the user navigated away mid-tour.
  useEffect(() => {
    if (authLoading || !user) return;
    if (autoOpenAttempted.current) return;
    if (AUTO_OPEN_ROUTES_SKIP.has(location.pathname)) return;
    autoOpenAttempted.current = true;
    if (localStorage.getItem(completionKey(user.id))) return;
    // Prefer a fresh resume marker over the plain first-run open.
    const resume = readResume();
    if (resume && Date.now() - resume.ts < RESUME_MAX_AGE_MS) {
      const idx = Math.min(Math.max(resume.stepIndex, 0), ONBOARDING_STEPS.length - 1);
      setStep(idx);
      setIsOpen(true);
      const onboardingStep = ONBOARDING_STEPS[idx];
      announce(UI[getLang()].resumeAria);
      logOnboardingEvent("opened", { stepIndex: idx, stepId: onboardingStep.id, reason: "resume" });
      if (onboardingStep.route && onboardingStep.route === location.pathname) {
        pendingFocusRef.current = onboardingStep;
      }
      clearResume();
      return;
    }

    if (!isDismissed()) {
      const idx = getLastStep();
      setStep(idx);
      setIsOpen(true);
      logOnboardingEvent("opened", {
        stepIndex: idx,
        stepId: ONBOARDING_STEPS[idx]?.id,
        reason: "first-run",
      });
    }
  }, [authLoading, user, location.pathname]);

  // After a route change, if we pushed a resume marker for this pathname,
  // fire the focus/highlight (the wizard itself may or may not be open).
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending && pending.route === location.pathname) {
      focusStepTarget(pending);
      pendingFocusRef.current = null;
      return;
    }
    // Also: if the user just landed on a step's route and a resume marker
    // exists targeting that route, highlight the element.
    const resume = readResume();
    if (
      resume &&
      Date.now() - resume.ts < RESUME_MAX_AGE_MS &&
      resume.route === location.pathname
    ) {
      const idx = findStepByRoute(location.pathname);
      if (idx >= 0) focusStepTarget(ONBOARDING_STEPS[idx]);
    }
  }, [location.pathname]);

  const open = useCallback((opts?: { restart?: boolean; stepIndex?: number }) => {
    if (opts?.restart) {
      resetProgress();
      setStep(0);
      logOnboardingEvent("opened", { stepIndex: 0, reason: "restart" });
    } else if (typeof opts?.stepIndex === "number") {
      const i = Math.min(Math.max(opts.stepIndex, 0), ONBOARDING_STEPS.length - 1);
      setStep(i);
      logOnboardingEvent("opened", { stepIndex: i, reason: "manual" });
    } else {
      const i = getLastStep();
      setStep(i);
      logOnboardingEvent("opened", { stepIndex: i, reason: "manual" });
    }
    markDismissed(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    markDismissed(true);
    logOnboardingEvent("skipped", { stepIndex: step, stepId: ONBOARDING_STEPS[step]?.id });
  }, [step]);

  const markComplete = useCallback(async () => {
    if (user) {
      localStorage.setItem(completionKey(user.id), new Date().toISOString());
    }
    resetProgress();
    clearResume();
    setIsOpen(false);
    logOnboardingEvent("finished", { stepIndex: step, stepId: ONBOARDING_STEPS[step]?.id });
    const t = UI[getLang()];
    toast.success(t.finishedToastTitle, {
      description: t.finishedToast,
      duration: 6000,
    });
  }, [user, step]);

  // Global shortcut: Shift+F1 to open tour
  useEffect(() => {
    const cleanup = registerShortcut({
      id: "global.tour",
      combo: "Shift+F1",
      scope: "global",
      description: "د زده‌کړې لارښود خلاصول",
    });
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "F1" && e.shiftKey) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cleanup();
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onLangChange = useCallback(
    (next: OnboardingLang) => {
      setLang(next);
      setLangState(next);
      logOnboardingEvent("language_changed", { lang: next, stepIndex: step });
    },
    [step],
  );

  const onGoto = useCallback(
    (s: OnboardingStep) => {
      // Mark a resume so returning to the app (or navigating back) reopens here.
      if (s.route) markResume(step, s.route);
      setIsOpen(false);
      // After navigation renders, focus/highlight the target element.
      pendingFocusRef.current = s;
      logOnboardingEvent("step_next", { stepIndex: step, stepId: s.id, action: "goto" });
    },
    [step],
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({ open, close, markComplete }),
    [open, close, markComplete],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <OnboardingWizard
        open={isOpen}
        step={step}
        lang={lang}
        onLangChange={onLangChange}
        onStepChange={(s, reason) => {
          logOnboardingEvent(
            reason === "prev" ? "step_prev" : reason === "jump" ? "step_jump" : "step_next",
            {
              from: step,
              to: s,
              stepId: ONBOARDING_STEPS[s]?.id,
            },
          );
          setStep(s);
          setLastStep(s);
        }}
        onSkip={close}
        onFinish={markComplete}
        onGoto={onGoto}
      />
    </Ctx.Provider>
  );
}

interface WizardProps {
  open: boolean;
  step: number;
  lang: OnboardingLang;
  onLangChange: (lang: OnboardingLang) => void;
  onStepChange: (step: number, reason?: "next" | "prev" | "jump") => void;
  onSkip: () => void;
  onFinish: () => void | Promise<void>;
  onGoto: (step: OnboardingStep) => void;
}

function OnboardingWizard({
  open,
  step,
  lang,
  onLangChange,
  onStepChange,
  onSkip,
  onFinish,
  onGoto,
}: WizardProps) {
  const total = ONBOARDING_STEPS.length;
  const current = ONBOARDING_STEPS[Math.min(step, total - 1)];
  const isLast = step >= total - 1;
  const Icon = current.icon;
  const t = UI[lang];
  const L = current[lang];
  const dir = lang === "ps" ? "rtl" : "ltr";
  const num = (n: number) => (lang === "ps" ? toFa(n) : String(n));

  useEffect(() => {
    if (!open) return;
    announce(`${t.step} ${num(step + 1)} ${t.of} ${num(total)} — ${L.title}`);
    logOnboardingEvent("step_view", { stepIndex: step, stepId: current.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, lang]);

  // Keyboard: ← → arrows and Enter (arrow direction depends on lang dir)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const forwardKey = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
      const backKey = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
      if (e.key === forwardKey) {
        e.preventDefault();
        if (isLast) void onFinish();
        else onStepChange(step + 1, "next");
      } else if (e.key === backKey) {
        e.preventDefault();
        if (step > 0) onStepChange(step - 1, "prev");
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (isLast) void onFinish();
        else onStepChange(step + 1, "next");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, isLast, onFinish, onStepChange, dir]);

  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onSkip())}>
      <DialogContent
        className="max-w-2xl w-[calc(100vw-1rem)] max-h-[90dvh] p-0 gap-0 overflow-hidden flex flex-col"
        dir={dir}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border/60 px-6 py-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold">{t.tour}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t.step} {num(step + 1)} {t.of} {num(total)}
            </DialogDescription>
          </div>

          {/* Language toggle */}
          <div
            role="group"
            aria-label="Language / ژبه"
            className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs"
          >
            <Languages className="h-3.5 w-3.5 mx-1 text-muted-foreground" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onLangChange("ps")}
              aria-pressed={lang === "ps"}
              className={cn(
                "px-2 py-1 rounded-sm transition",
                lang === "ps"
                  ? "bg-background shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              پښتو
            </button>
            <button
              type="button"
              onClick={() => onLangChange("en")}
              aria-pressed={lang === "en"}
              className={cn(
                "px-2 py-1 rounded-sm transition",
                lang === "en"
                  ? "bg-background shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              EN
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onStepChange(0, "jump");
              resetProgress();
            }}
            className="text-xs"
            aria-label={t.restart}
          >
            <RotateCcw className="h-3.5 w-3.5 ms-1" />
            {t.restart}
          </Button>
          <Button variant="ghost" size="icon" onClick={onSkip} aria-label={t.close}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Hero */}
          <div
            className="px-6 py-8 border-b border-border/40"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--primary) 12%, transparent), color-mix(in oklab, var(--accent) 8%, transparent))",
            }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-background shadow-crisp text-primary">
                <Icon className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {num(step + 1)} / {num(total)}
                  </span>
                </div>
                <h3 className="font-display text-2xl font-bold text-foreground leading-tight">
                  {L.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {L.description}
                </p>
              </div>
            </div>
          </div>

          {/* Bullets */}
          <div className="px-6 py-5">
            <ul className="space-y-2.5">
              {L.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                  <span
                    className="mt-1.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>

            {current.route && (
              <div className="mt-5">
                <Button asChild variant="outline" size="sm" onClick={() => onGoto(current)}>
                  <Link to={current.route}>
                    {L.routeLabel ?? t.goto} {dir === "rtl" ? "←" : "→"}
                  </Link>
                </Button>
              </div>
            )}

            {/* Step dots */}
            <div
              className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
              role="tablist"
              aria-label={t.stepsList}
            >
              {ONBOARDING_STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === step}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`${t.step} ${num(i + 1)}: ${s[lang].title}`}
                  onClick={() => onStepChange(i, "jump")}
                  className={cn(
                    "h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    i === step
                      ? "w-6 bg-primary"
                      : i < step
                        ? "w-2 bg-primary/50"
                        : "w-2 bg-border",
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border/60 bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between gap-2 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStepChange(Math.max(0, step - 1), "prev")}
            disabled={step === 0}
          >
            <PrevIcon className="h-4 w-4 ms-1" aria-hidden="true" />
            {t.prev}
          </Button>
          <div className="text-xs text-muted-foreground">
            {num(step + 1)} / {num(total)}
          </div>
          {isLast ? (
            <Button size="sm" onClick={() => void onFinish()}>
              <Check className="h-4 w-4 me-1" aria-hidden="true" />
              {t.finish}
            </Button>
          ) : (
            <Button size="sm" onClick={() => onStepChange(step + 1, "next")}>
              {t.next}
              <NextIcon className="h-4 w-4 me-1" aria-hidden="true" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toFa(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
