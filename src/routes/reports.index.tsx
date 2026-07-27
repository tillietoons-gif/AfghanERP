import { createFileRoute, Link } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { makeRouteErrorComponent } from "@/components/route-error-page";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import {
  TrendingUp,
  Scale,
  BookOpen,
  Wallet,
  ShoppingCart,
  Truck,
  Receipt,
  Boxes,
  Users,
  Building2,
  AlertTriangle,
  Calendar,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/reports/")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "accountant", "inventory_officer"]}>
      <ReportsHub />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent(t.reportsHub),
});

type Item = { to: string; label: string; icon: LucideIcon; desc?: string };

const finance: Item[] = [
  { to: "/reports/profit-loss", label: t.profitLoss, icon: TrendingUp },
  { to: "/reports/balance-sheet", label: t.balanceSheet, icon: Scale },
  { to: "/reports/account-balances", label: t.accountBalances, icon: BookOpen },
  { to: "/reports/cashbook", label: t.cashbook, icon: Wallet },
  { to: "/reports/expenses", label: t.expenseReport, icon: Receipt },
  { to: "/reports/receivables", label: t.receivables, icon: Users },
  { to: "/reports/payables", label: t.payables, icon: Building2 },
];
const sales: Item[] = [{ to: "/reports/sales", label: t.salesReport, icon: ShoppingCart }];
const purchases: Item[] = [{ to: "/reports/purchases", label: t.purchaseReport, icon: Truck }];
const inventory: Item[] = [
  { to: "/reports/inventory-valuation", label: t.inventoryValuation, icon: Boxes },
  { to: "/alerts", label: t.lowStockReport, icon: AlertTriangle },
  { to: "/alerts", label: t.expiringReport, icon: Calendar },
];

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => {
          const Icon = i.icon;
          return (
            <Link key={`${title}-${i.to}-${i.label}`} to={i.to} className="group block">
              <Card className="transition hover:border-primary hover:shadow-elegant">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{i.label}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ReportsHub() {
  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">{t.reportsHub}</h1>
        <p className="text-sm text-muted-foreground">{t.appTagline}</p>
      </div>
      <Section title={t.reportsFinanceGroup} items={finance} />
      <Section title={t.reportsSalesGroup} items={sales} />
      <Section title={t.reportsPurchaseGroup} items={purchases} />
      <Section title={t.reportsInventoryGroup} items={inventory} />
    </div>
  );
}
