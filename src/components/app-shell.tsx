import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Users,
  Receipt,
  FileBarChart,
  Bot,
  Settings,
  LogOut,
  ScrollText,
  Wallet,
  Menu,
  Tags,
  Boxes,
  UserCog,
  ShieldCheck,
  FileClock,
  AlertTriangle,
  Bug,
  Store,
  Search,
  PanelRightClose,
  PanelRightOpen,
  Clock,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { useOnboarding } from "@/components/onboarding/onboarding-wizard";
import { t } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";
import { ErrorAlertBadge } from "@/components/error-alert-badge";
import { CommandPalette, openCommandPalette } from "@/components/command-palette";
import { StatusBar } from "@/components/status-bar";
import { toPashtoDigits } from "@/lib/format";
import { formatJalali } from "@/lib/jalali-format";
import { registerShortcut, isTypingTarget } from "@/lib/shortcuts-registry";

type NavItem = { to: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: t.dashboard,
    items: [
      { to: "/", label: t.dashboard, icon: LayoutDashboard },
      { to: "/assistant", label: t.assistant, icon: Bot },
    ],
  },
  {
    label: t.pos,
    items: [
      { to: "/pos", label: t.pos, icon: ShoppingCart },
      { to: "/sales", label: t.sales, icon: ScrollText },
      { to: "/sale-returns", label: t.saleReturns, icon: ScrollText },
      { to: "/z-report", label: t.zReport, icon: FileClock },
    ],
  },
  {
    label: t.inventory,
    items: [
      { to: "/products", label: t.products, icon: Package },
      { to: "/categories", label: `${t.category}/${t.brand}`, icon: Tags },
      { to: "/stock-movements", label: t.stockMovements, icon: Boxes },
      { to: "/barcodes", label: t.barcodes, icon: Tags },
      { to: "/alerts", label: t.alerts, icon: AlertTriangle },
      { to: "/reports/low-stock", label: t.lowStockReport, icon: AlertTriangle },
      { to: "/reports/expiry", label: t.expiringReport, icon: AlertTriangle },
    ],
  },
  {
    label: t.purchases,
    items: [
      { to: "/purchases", label: t.purchases, icon: Receipt },
      { to: "/purchase-returns", label: t.purchaseReturns, icon: Receipt },
      { to: "/suppliers", label: t.suppliers, icon: Truck },
    ],
  },
  {
    label: t.customers,
    items: [
      { to: "/customers", label: t.customers, icon: Users },
      { to: "/expenses", label: t.expenses, icon: Wallet },
    ],
  },
  {
    label: t.reportsHub,
    items: [
      { to: "/reports", label: t.reports, icon: FileBarChart },
      { to: "/reports/profit-loss", label: t.profitLoss, icon: FileBarChart },
      { to: "/reports/balance-sheet", label: t.balanceSheet, icon: FileBarChart },
      { to: "/reports/cashbook", label: t.cashbook, icon: Wallet },
      { to: "/reports/receivables", label: t.receivables, icon: Users },
      { to: "/reports/payables", label: t.payables, icon: Truck },
      { to: "/reports/inventory-valuation", label: t.inventoryValuation, icon: Boxes },
    ],
  },
  {
    label: t.settings,
    items: [
      { to: "/users", label: t.usersAdmin, icon: UserCog },
      { to: "/audit", label: t.auditLog, icon: ShieldCheck },
      { to: "/incidents", label: t.incidentsHistory, icon: AlertTriangle },
      { to: "/errors", label: t.errorsMonitoring, icon: Bug },
      { to: "/settings", label: t.settings, icon: Settings },
    ],
  },
];

function initialsOf(email?: string | null) {
  if (!email) return t.unknownInitial;
  const name = email.split("@")[0] ?? "";
  return name.slice(0, 2).toUpperCase();
}

const RAIL_KEY = "app_shell_rail_collapsed_v1";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, roles, signOut } = useAuth();
  const { open: openTour } = useOnboarding();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(RAIL_KEY) === "1";
  });

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Keyboard: [ and ] toggle the rail (bare key only — Alt/Ctrl combos are
  // owned by other scopes, so we bail early to avoid conflicts).
  useEffect(() => {
    const cleanup = registerShortcut({
      id: "shell.rail",
      combo: "[ / ]",
      scope: "global",
      description: t.shellRailShortcut,
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cleanup();
    };
  }, []);

  const roleLabel = roles.length > 0 ? (t.roles[roles[0]] ?? roles[0]) : "";
  const currentItem = navGroups
    .flatMap((g) => g.items)
    .find(
      (i) => i.to === location.pathname || (i.to !== "/" && location.pathname.startsWith(i.to)),
    );
  const currentTitle = currentItem?.label ?? t.appName;
  const currentGroup = navGroups.find((g) => g.items.some((i) => i === currentItem))?.label;

  const NavList = ({ onNavigate, mini }: { onNavigate?: () => void; mini?: boolean }) => (
    <ScrollArea className="flex-1">
      <nav className="flex flex-col gap-5 px-2 py-3" aria-label={t.appName}>
        {navGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!mini && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                {group.label}
              </div>
            )}
            {mini && <div className="mx-2 my-1 h-px bg-sidebar-border/70" />}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                location.pathname === item.to ||
                (item.to !== "/" && location.pathname.startsWith(item.to));
              const link = (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-10 items-center gap-3 rounded-lg text-sm font-medium outline-none transition-all duration-200",
                    "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                    mini ? "mx-1 justify-center px-2 py-2" : "px-3 py-2",
                    active
                      ? "bg-sidebar-accent/70 text-sidebar-accent-foreground shadow-inset-hair"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1.5 -right-0.5 w-[3px] rounded-full gradient-gold shadow-gold-glow"
                    />
                  )}
                  <Icon
                    className={cn(
                      "shrink-0 transition-transform",
                      mini ? "h-5 w-5" : "h-4 w-4",
                      active && "text-accent",
                    )}
                    aria-hidden="true"
                  />
                  {!mini && <span className="truncate">{item.label}</span>}
                </Link>
              );
              if (mini) {
                return (
                  <Tooltip key={item.to} delayDuration={100}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </div>
        ))}
      </nav>
    </ScrollArea>
  );

  const SidebarBody = ({
    onNavigate,
    mini = false,
  }: {
    onNavigate?: () => void;
    mini?: boolean;
  }) => (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("border-b border-sidebar-border", mini ? "px-2 py-3" : "px-4 py-4")}>
        <div className={cn("flex items-center gap-3", mini && "justify-center")}>
          <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl gradient-gold text-sidebar-primary-foreground shadow-gold-glow">
            <Store className="h-5 w-5" aria-hidden="true" />
            <span aria-hidden="true" className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
          </div>
          {!mini && (
            <div className="min-w-0">
              <h1 className="truncate font-display text-sm font-bold leading-tight text-sidebar-accent-foreground">
                {t.appName}
              </h1>
              <p className="truncate text-[11px] text-sidebar-foreground/50">{t.appTagline}</p>
            </div>
          )}
        </div>
      </div>
      <NavList onNavigate={onNavigate} mini={mini} />
      <div className={cn("border-t border-sidebar-border", mini ? "p-2" : "p-3")}>
        {!mini ? (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t.logout}
          </Button>
        ) : (
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/auth" });
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {t.logout}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );

  const dateChip = toPashtoDigits(formatJalali(new Date(), "yyyy/MM/dd"));

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh w-full flex-col bg-background">
        <div className="flex min-h-0 flex-1">
          {/* Desktop rail (RTL: sits on the right, border on the left) */}
          <aside
            className={cn(
              "hidden shrink-0 border-l border-sidebar-border md:block",
              "transition-[width] duration-300",
              collapsed ? "w-[68px]" : "w-64",
            )}
          >
            <div className="sticky top-0 h-dvh">
              <SidebarBody mini={collapsed} />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Top command bar */}
            <header className="sticky top-0 z-30 border-b border-border-hair bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/55">
              <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
                {/* Mobile trigger */}
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="md:hidden"
                      aria-label={t.appName}
                    >
                      <Menu className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-72 p-0 md:hidden">
                    <SheetTitle className="sr-only">{t.appName}</SheetTitle>
                    <SidebarBody onNavigate={() => setMobileOpen(false)} />
                  </SheetContent>
                </Sheet>

                {/* Rail toggle */}
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="hidden md:inline-flex"
                      onClick={() => setCollapsed((v) => !v)}
                      aria-label={t.toggleSidebar}
                    >
                      {collapsed ? (
                        <PanelRightOpen className="h-4 w-4" />
                      ) : (
                        <PanelRightClose className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    [ / ] {t.toggleSidebar}
                  </TooltipContent>
                </Tooltip>

                {/* Breadcrumb + title */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    {currentGroup && (
                      <span className="hidden text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
                        {currentGroup}
                      </span>
                    )}
                    {currentGroup && (
                      <span className="hidden text-muted-foreground/40 sm:inline">/</span>
                    )}
                    <h2 className="truncate font-display text-base font-semibold text-foreground sm:text-[17px]">
                      {currentTitle}
                    </h2>
                  </div>
                </div>

                {/* Command palette trigger */}
                <button
                  type="button"
                  onClick={openCommandPalette}
                  className={cn(
                    "group hidden items-center gap-2 rounded-lg border border-border-hair bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground shadow-crisp",
                    "transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-focus md:inline-flex",
                    "min-w-[260px] justify-between",
                  )}
                  aria-label={t.search}
                >
                  <span className="inline-flex items-center gap-2">
                    <Search className="h-3.5 w-3.5" />
                    {t.searchAndJump}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="kbd">Ctrl</span>
                    <span className="kbd">K</span>
                  </span>
                </button>

                {/* Chips */}
                <div className="hidden items-center gap-2 md:flex">
                  <span className="chip">
                    <Clock className="h-3 w-3 text-accent" />
                    <span className="font-mono text-[11px]">{dateChip}</span>
                  </span>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openTour()}
                        aria-label={t.tutorialGuide}
                        aria-keyshortcuts="Shift+F1"
                      >
                        <GraduationCap className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {t.tutorialGuide} · <span className="kbd">Shift</span>+
                      <span className="kbd">F1</span>
                    </TooltipContent>
                  </Tooltip>
                  <ErrorAlertBadge />
                  <div className="flex h-9 items-center gap-2 rounded-full border border-border-hair bg-card px-3 shadow-crisp">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">
                        {initialsOf(user?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className="max-w-[160px] truncate text-xs font-medium text-foreground"
                      dir="ltr"
                    >
                      {user?.email}
                    </span>
                    {roleLabel && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                        {roleLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Gold hairline */}
              <div
                aria-hidden="true"
                className="h-px w-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent) 45%, transparent), transparent)",
                }}
              />
            </header>

            <main id="main-content" className="flex-1 overflow-auto">
              <div key={location.pathname} className="rise">
                {children}
              </div>
            </main>
          </div>
        </div>

        <StatusBar />
        <CommandPalette />
      </div>
    </TooltipProvider>
  );
}
