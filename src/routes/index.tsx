import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { money, jalaliDateTime, num, toPashtoDigits } from "@/lib/format";
import {
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  Calendar,
  Banknote,
  Zap,
  FileBarChart,
  ArrowUpRight,
  Sparkles,
  Users,
  Truck,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { formatJalali } from "@/lib/jalali-format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { MeshBackdrop } from "@/components/mesh-backdrop";
import { AnimatedNumber } from "@/components/animated-number";
import { getLocalDashboard } from "@/lib/local-store";

export const Route = createFileRoute("/")({
  component: () => (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  ),
});

function Dashboard() {
  const { data: dashboard } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getLocalDashboard,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const stats = dashboard?.stats;
  const recentSales = dashboard?.recentSales;
  const recentPurchases: Array<{
    id: string;
    invoice_no: string;
    total: number;
    purchase_date: string;
    suppliers: { name?: string } | null;
  }> = [];
  const chartData = dashboard?.chartData.map((entry) => ({
    label: formatJalali(new Date(entry.day), "MM/dd"),
    total: entry.total,
  }));
  const quickSummary = dashboard?.quickSummary;
  const monthPl = dashboard?.monthPl;
  const recTotals = dashboard?.recTotals;
  const payTotals = dashboard?.payTotals;

  const heroSum = Number(stats?.today_sales ?? 0);

  return (
    <div className="relative">
      {/* Hero band */}
      <section className="relative isolate overflow-hidden border-b border-border-hair">
        <MeshBackdrop variant="hero" />
        <div className="relative z-10 space-y-6 p-4 md:p-8">
          <PageHeader
            kicker={toPashtoDigits(formatJalali(new Date(), "yyyy/MM/dd EEEE"))}
            title={t.dashboard}
            subtitle="د پلورنځي د ټولو حسابونو او راپورونو ژوندۍ کتنه"
            actions={
              <>
                <Link
                  to="/pos"
                  className="inline-flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant transition hover:opacity-95"
                >
                  <Zap className="h-4 w-4" /> {t.pos}
                </Link>
                <Link
                  to="/assistant"
                  className="inline-flex items-center gap-2 rounded-lg border border-border-hair bg-card px-4 py-2 text-sm font-medium text-foreground shadow-crisp transition hover:border-border-strong"
                >
                  <Sparkles className="h-4 w-4 text-accent" /> {t.assistant}
                </Link>
              </>
            }
          />

          {/* Hero KPI row */}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-sidebar/85 p-6 text-sidebar-foreground shadow-float backdrop-blur-md">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 gradient-mesh opacity-70"
              />
              <div className="relative z-10">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
                  {t.todaySales}
                </div>
                <div className="mt-2 font-display text-4xl font-black leading-none tracking-tight text-white md:text-5xl">
                  <AnimatedNumber value={heroSum} format={(n) => money(n)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="chip !bg-white/8 !text-white/85 !border-white/15">
                    <TrendingUp className="h-3 w-3 text-accent" /> نن ورځ
                  </span>
                  <span className="chip !bg-white/8 !text-white/85 !border-white/15">
                    ګټه: <span className="font-mono text-accent">{money(stats?.today_profit)}</span>
                  </span>
                  <span className="chip !bg-white/8 !text-white/85 !border-white/15">
                    نغد: <span className="font-mono">{money(stats?.cash_on_hand)}</span>
                  </span>
                </div>
              </div>
              {/* Gold sweep */}
              <span
                aria-hidden="true"
                className="absolute -bottom-px left-6 right-6 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent) 70%, transparent), transparent)",
                }}
              />
            </div>

            <KpiCard
              title={t.inventoryValue}
              value={stats?.inventory_value}
              format={(n) => money(n)}
              icon={Package}
              tone="info"
            />
            <KpiCard
              title={t.cashOnHand}
              value={stats?.cash_on_hand}
              format={(n) => money(n)}
              icon={Banknote}
              tone="gold"
            />
          </div>

          {/* Secondary KPI row */}
          <div className="grid gap-3 stagger sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title={t.todayProfit}
              value={stats?.today_profit}
              format={(n) => money(n)}
              icon={DollarSign}
              tone="success"
            />
            <KpiCard
              title={t.lowStock}
              value={stats?.low_stock_count}
              format={(n) => num(n, 0)}
              icon={AlertTriangle}
              tone="danger"
              to="/reports/low-stock"
            />
            <KpiCard
              title={t.expiring}
              value={stats?.expiring_count}
              format={(n) => num(n, 0)}
              icon={Calendar}
              tone="warning"
              to="/reports/expiry"
            />
            <KpiCard
              title={t.receivablesTotal}
              value={recTotals ?? 0}
              format={(n) => money(n)}
              icon={Users}
              tone="primary"
              to="/reports/receivables"
            />
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="space-y-6 p-4 md:p-8">
        {/* Accounting hub */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t.reportsFinanceGroup}
            </h2>
            <Link
              to="/reports"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              ټول راپورونه <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 stagger sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              title={t.monthSales}
              value={monthPl?.net_sales ?? 0}
              format={(n) => money(n)}
              icon={FileBarChart}
              tone="primary"
              to="/reports/sales"
            />
            <KpiCard
              title={t.monthProfit}
              value={monthPl?.net_profit ?? 0}
              format={(n) => money(n)}
              icon={DollarSign}
              tone="success"
              to="/reports/profit-loss"
            />
            <KpiCard
              title={t.monthExpenses}
              value={monthPl?.expenses ?? 0}
              format={(n) => money(n)}
              icon={FileBarChart}
              tone="danger"
              to="/reports/expenses"
            />
            <KpiCard
              title={t.receivablesTotal}
              value={recTotals ?? 0}
              format={(n) => money(n)}
              icon={Users}
              tone="warning"
              to="/reports/receivables"
            />
            <KpiCard
              title={t.payablesTotal}
              value={payTotals ?? 0}
              format={(n) => money(n)}
              icon={Truck}
              tone="info"
              to="/reports/payables"
            />
          </div>
        </div>

        {/* Bento: chart + quick sale */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{t.salesLast7Days}</CardTitle>
              <span className="chip">
                <TrendingUp className="h-3 w-3 text-primary" /> ۷ ورځې
              </span>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <AreaChart
                    data={chartData ?? []}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      strokeOpacity={0.5}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      reversed
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        direction: "rtl",
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 10,
                        fontSize: 12,
                        boxShadow: "var(--shadow-float)",
                      }}
                      formatter={(v: number) => money(v)}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="var(--color-primary)"
                      strokeWidth={2.5}
                      fill="url(#salesFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="panel relative overflow-hidden">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl"
              style={{ background: "color-mix(in oklab, var(--accent) 30%, transparent)" }}
            />
            <CardHeader className="relative pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/12 text-primary">
                  <Zap className="h-4 w-4" />
                </span>
                {t.todayQuickSales}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t.quickSalesCount}
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold">
                    {num(quickSummary?.count ?? 0, 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t.total}
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold text-primary tabular">
                    {money(quickSummary?.total ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t.cashOnHand}
                  </div>
                  <div className="mt-1 font-semibold tabular">
                    {money(quickSummary?.cash_total ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t.quantity}
                  </div>
                  <div className="mt-1 font-semibold tabular">
                    {num(quickSummary?.items_sold ?? 0, 0)}
                  </div>
                </div>
              </div>
              {quickSummary?.top_items && quickSummary.top_items.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.topSelling}
                  </div>
                  <ul className="grid gap-1.5">
                    {quickSummary.top_items.slice(0, 5).map((it, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-border-hair bg-surface-1 px-2.5 py-1.5 text-sm"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-accent/25 text-[10px] font-bold text-accent-foreground">
                            {toPashtoDigits(String(i + 1))}
                          </span>
                          <span className="truncate">{it.name}</span>
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {num(it.qty)} ×{" "}
                          <span className="text-foreground">{money(it.revenue)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent lists */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{t.recentSales}</CardTitle>
              <Link to="/sales" className="text-xs text-primary hover:underline">
                ټول
              </Link>
            </CardHeader>
            <CardContent>
              {recentSales && recentSales.length > 0 ? (
                <ul className="divide-y divide-border-hair">
                  {recentSales.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-2.5">
                      <Link
                        to="/print/receipt/$id"
                        params={{ id: s.id }}
                        className="text-sm font-medium hover:text-primary hover:underline"
                      >
                        {s.invoice_no}
                      </Link>
                      <div className="text-left">
                        <div className="text-sm font-semibold tabular">{money(s.total)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {jalaliDateTime(s.sale_date)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t.noData}</p>
              )}
            </CardContent>
          </Card>
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{t.recentPurchases}</CardTitle>
              <Link to="/purchases" className="text-xs text-primary hover:underline">
                ټول
              </Link>
            </CardHeader>
            <CardContent>
              {recentPurchases && recentPurchases.length > 0 ? (
                <ul className="divide-y divide-border-hair">
                  {recentPurchases.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <div className="text-sm font-medium">{p.invoice_no}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {(p.suppliers as { name?: string } | null)?.name ?? "—"}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold tabular">{money(p.total)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {jalaliDateTime(p.purchase_date)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t.noData}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
