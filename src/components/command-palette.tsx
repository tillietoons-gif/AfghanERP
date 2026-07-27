import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { registerShortcut } from "@/lib/shortcuts-registry";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  ShoppingCart,
  ScrollText,
  FileClock,
  Package,
  Tags,
  Boxes,
  Receipt,
  Truck,
  Users,
  Wallet,
  FileBarChart,
  Bot,
  UserCog,
  ShieldCheck,
  AlertTriangle,
  Bug,
  Settings,
  Store,
} from "lucide-react";
import { t } from "@/lib/i18n";

type Item = {
  to: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
};

const items: Item[] = [
  { to: "/", label: t.dashboard, group: t.dashboard, icon: LayoutDashboard },
  { to: "/assistant", label: t.assistant, group: t.dashboard, icon: Bot },
  { to: "/pos", label: t.pos, group: t.pos, icon: ShoppingCart },
  { to: "/sales", label: t.sales, group: t.pos, icon: ScrollText },
  { to: "/sale-returns", label: "د پلور بېرته راګرځول", group: t.pos, icon: ScrollText },
  { to: "/z-report", label: t.zReport, group: t.pos, icon: FileClock },
  { to: "/products", label: t.products, group: t.inventory, icon: Package },
  { to: "/categories", label: `${t.category}/${t.brand}`, group: t.inventory, icon: Tags },
  { to: "/stock-movements", label: t.stockMovements, group: t.inventory, icon: Boxes },
  { to: "/barcodes", label: t.barcodes, group: t.inventory, icon: Tags },
  { to: "/alerts", label: t.alerts, group: t.inventory, icon: AlertTriangle },
  { to: "/reports/low-stock", label: t.lowStockReport, group: t.inventory, icon: AlertTriangle },
  { to: "/reports/expiry", label: t.expiringReport, group: t.inventory, icon: AlertTriangle },
  { to: "/purchases", label: t.purchases, group: t.purchases, icon: Receipt },
  { to: "/purchase-returns", label: "د پېرود بېرته راګرځول", group: t.purchases, icon: Receipt },
  { to: "/suppliers", label: t.suppliers, group: t.purchases, icon: Truck },
  { to: "/customers", label: t.customers, group: t.customers, icon: Users },
  { to: "/expenses", label: t.expenses, group: t.customers, icon: Wallet },
  { to: "/reports", label: t.reports, group: t.reportsHub, icon: FileBarChart },
  { to: "/reports/profit-loss", label: t.profitLoss, group: t.reportsHub, icon: FileBarChart },
  { to: "/reports/balance-sheet", label: t.balanceSheet, group: t.reportsHub, icon: FileBarChart },
  { to: "/reports/cashbook", label: t.cashbook, group: t.reportsHub, icon: Wallet },
  { to: "/reports/receivables", label: t.receivables, group: t.reportsHub, icon: Users },
  { to: "/reports/payables", label: t.payables, group: t.reportsHub, icon: Truck },
  {
    to: "/reports/inventory-valuation",
    label: t.inventoryValuation,
    group: t.reportsHub,
    icon: Boxes,
  },
  { to: "/users", label: t.usersAdmin, group: t.settings, icon: UserCog },
  { to: "/audit", label: t.auditLog, group: t.settings, icon: ShieldCheck },
  { to: "/incidents", label: t.incidentsHistory, group: t.settings, icon: AlertTriangle },
  { to: "/errors", label: "د تېروتنو څارنه", group: t.settings, icon: Bug },
  { to: "/settings", label: t.settings, group: t.settings, icon: Settings },
];

type Ctx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };
let listeners: Array<(v: boolean) => void> = [];
let _open = false;

function subscribe(fn: (v: boolean) => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
function set(v: boolean) {
  _open = v;
  listeners.forEach((l) => l(v));
}

export function openCommandPalette() {
  set(true);
}
export function useCommandPaletteCtx(): Ctx {
  const [open, setOpen] = useState(_open);
  useEffect(() => subscribe(setOpen), []);
  return { open, setOpen: set, toggle: () => set(!_open) };
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPaletteCtx();
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = registerShortcut({
      id: "global.palette",
      combo: "Ctrl+K",
      scope: "global",
      description: "د کمانډ پالټ",
    });
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        set(!_open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cleanup();
    };
  }, []);

  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="لټون… (ماډل، راپور، پاڼه)" />
      <CommandList>
        <CommandEmpty>هېڅ پایله ونه موندل شوه</CommandEmpty>
        {groups.map((g, gi) => (
          <div key={g}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {items
                .filter((i) => i.group === g)
                .map((it) => {
                  const Icon = it.icon;
                  return (
                    <CommandItem
                      key={it.to}
                      value={`${it.group} ${it.label} ${it.to}`}
                      onSelect={() => {
                        setOpen(false);
                        navigate({ to: it.to });
                      }}
                    >
                      <Icon className="me-2 h-4 w-4 opacity-70" />
                      <span>{it.label}</span>
                      <span className="ms-auto text-[10px] opacity-50">{it.to}</span>
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </div>
        ))}
        <CommandSeparator />
        <CommandGroup heading="د تګ نښې">
          <CommandItem onSelect={() => setOpen(false)}>
            <Store className="me-2 h-4 w-4 opacity-70" />
            بندول (Esc)
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
