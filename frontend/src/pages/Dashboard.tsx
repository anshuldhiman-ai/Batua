import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  LineChart,
  PieChart,
  AlertTriangle,
  Sparkles,
  Lightbulb,
  RefreshCw,
  Plus,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

import KPICard from "@/components/KPICard";
import PageHeader from "@/components/PageHeader";
import CardDetailDialog from "@/components/CardDetailDialog";
import BudgetHealth from "@/components/BudgetHealth";
import { TimelineChart, CategoryDonut } from "@/components/Charts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, formatINR, formatMonth, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/useLocalStorage";

/* ─── Section header ──────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action && action}
    </div>
  );
}

/* ─── Lifetime stat pill ──────────────────────────────────────────── */
const TONE_CLASS = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  rose: "text-rose-500",
  primary: "text-foreground",
  sky: "text-sky-500",
  violet: "text-violet-500",
};

function StatPill({ label, value, sub, tone = "primary", icon: Icon }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-card px-3 py-2 transition-shadow hover:shadow-sm">
      {Icon && (
        <div className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          tone === "emerald" && "bg-emerald-500/10 text-emerald-500",
          tone === "rose" && "bg-rose-500/10 text-rose-500",
          tone === "primary" && "bg-primary/10 text-primary",
          tone === "sky" && "bg-sky-500/10 text-sky-500",
          tone === "violet" && "bg-violet-500/10 text-violet-500",
        )}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("kpi-number text-sm font-semibold leading-tight", TONE_CLASS[tone])}>{value}</p>
        {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Empty state ─────────────────────────────────────────────────── */
function EmptyState({ icon: Icon, title, description, actionText, onAction }) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="mb-4 max-w-xs text-sm text-muted-foreground">{description}</p>
      <Button onClick={onAction} size="sm">
        <Plus className="mr-2 h-4 w-4" />
        {actionText}
      </Button>
    </div>
  );
}

/* ─── Dashboard ───────────────────────────────────────────────────── */
export default function Dashboard() {
  const queryClient = useQueryClient();
  const [insightsMode, setInsightsMode] = useLocalStorage("batua-qa-mode", "hybrid");
  const [drill, setDrill] = React.useState(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [geminiAvailable, setGeminiAvailable] = React.useState(false);
  const navigate = useNavigate();

  // React Query setup for dashboard queries
  const metricsQuery = useQuery({
    queryKey: ["dashboard_metrics"],
    queryFn: async () => {
      const res = await api.get("/dashboard/metrics");
      return res.data;
    }
  });

  const timelineQuery = useQuery({
    queryKey: ["analytics_timeline"],
    queryFn: async () => {
      const res = await api.get("/analytics/timeline");
      return res.data;
    }
  });

  const insightsQuery = useQuery({
    queryKey: ["insights", insightsMode],
    queryFn: async () => {
      const res = await api.get("/insights", { params: { mode: insightsMode } });
      return res.data;
    }
  });

  const currentMonth = metricsQuery.data?.current_month;
  const breakdownQuery = useQuery({
    queryKey: ["category_breakdown", currentMonth],
    queryFn: async () => {
      const res = await api.get("/analytics/category-breakdown", {
        params: currentMonth ? { month: currentMonth } : {},
      });
      return res.data;
    },
    enabled: !!metricsQuery.data,
  });

  // Derived properties from queries
  const metrics = metricsQuery.data;
  const timeline = timelineQuery.data?.series || [];
  const breakdown = breakdownQuery.data?.data || [];
  const insights = insightsQuery.data;
  
  // Loading flag aggregated from all individual queries
  const loading = metricsQuery.isLoading || 
                  timelineQuery.isLoading || 
                  insightsQuery.isLoading || 
                  (!!currentMonth && breakdownQuery.isLoading);

  // Discover once whether Gemini is enabled
  React.useEffect(() => {
    api.get("/")
      .then((r) => setGeminiAvailable(Boolean(r.data?.ai)))
      .catch(() => setGeminiAvailable(false));
  }, []);

  const refreshAI = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: kick } = await api.post("/insights/refresh", null, { timeout: 10000 });
      if (kick?.status !== "queued") {
        toast.info(kick?.message || "AI refresh is unavailable right now.");
        return;
      }
      toast.success("Refreshing AI insights…");
      
      const before = insights?.generated_at;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const { data } = await api.get("/insights");
          if (data.source === "gemini" && data.generated_at !== before) {
            queryClient.setQueryData(["insights", insightsMode], data);
            return;
          }
        } catch {
          // transient network blip — keep polling
        }
      }
      toast.warning("Still generating — refresh the page in a moment.");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not refresh AI insights");
    } finally {
      setRefreshing(false);
    }
  }, [insights, insightsMode, queryClient]);

  const top5 = metrics?.top_categories || [];
  const maxCat = top5.length ? top5[0].amount : 1;
  const netPositive = (metrics?.net || 0) >= 0;

  // Extract sparkline data (last 6 months) from timeline
  const getSparkline = (field) => {
    if (!timeline || timeline.length === 0) return null;
    const last6 = timeline.slice(-6);
    return last6.map(t => t[field] || 0);
  };

  // Quick-add lives on the Transactions page now — send empty states there.
  const goAddTransaction = () => navigate("/transactions");

  return (
    <div className="page-enter space-y-6">
      {/* ════════════════════════════════════════════════════════════
          SECTION 1: Page Header
          ════════════════════════════════════════════════════════════ */}
      <PageHeader
        title="Dashboard"
        subtitle="Your financial overview at a glance"
        actions={
          metrics?.current_month && (
            <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs font-medium">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              {formatMonth(metrics.current_month)}
            </Badge>
          )
        }
      />

      {/* ════════════════════════════════════════════════════════════
          SECTION 2: HERO — Trend chart (left) + This-Month KPIs (right)
          Visualization leads; the precise figures sit alongside it so the
          whole "how am I doing this month?" story reads in one glance.
          ════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Trend chart — the hero visualization */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <LineChart className="h-4 w-4 text-primary" />
                  Income vs Expense
                </CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {timeline?.length ? `Last ${Math.min(timeline.length, 12)} months` : "Monthly trend"}
                </p>
              </div>
              {!loading && metrics && (
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Net · this month
                  </p>
                  <p className={cn(
                    "kpi-number text-lg leading-tight",
                    netPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                  )}>
                    {netPositive ? "" : "−"}{formatINR(Math.abs(metrics.net), { compact: true })}
                  </p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] rounded-lg" />
            ) : timeline && timeline.length ? (
              <TimelineChart data={timeline} height={300} />
            ) : (
              <EmptyState
                icon={LineChart}
                title="No transaction data yet"
                description="Add your first transaction to see your income vs expense trends over time."
                actionText="Add transaction"
                onAction={goAddTransaction}
              />
            )}
          </CardContent>
        </Card>

        {/* This-Month KPI rail */}
        <div className="flex flex-col gap-3 lg:col-span-5">
          {loading || !metrics ? (
            <>
              <Skeleton className="h-[92px] rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[92px] rounded-xl" />
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Hero KPI — Funds Left / Overspent */}
              <KPICard
                testId="kpi-net"
                label={metrics.net < 0 ? "Overspent this month" : "Funds Left this month"}
                value={formatINR(Math.abs(metrics.net), { compact: false })}
                change={metrics.net_change}
                icon={metrics.net < 0 ? AlertTriangle : Wallet}
                accent={metrics.net < 0 ? "rose" : "primary"}
                goodWhenUp={metrics.net >= 0}
                note={
                  metrics.net < 0
                    ? `${formatINR(metrics.expense - metrics.income, { compact: true })} over income`
                    : `of ${formatINR(metrics.income, { compact: true })} income`
                }
                onClick={() => setDrill("summary")}
                hero
              />

              {/* Secondary KPIs — 2×2 grid beside the chart */}
              <div className="grid grid-cols-2 gap-3">
                <KPICard
                  testId="kpi-income"
                  label="Income"
                  value={formatINR(metrics.income, { compact: true })}
                  change={metrics.income_change}
                  icon={TrendingUp}
                  accent="emerald"
                  goodWhenUp
                  onClick={() => setDrill("income")}
                  sparkline={getSparkline("income")}
                />
                <KPICard
                  testId="kpi-expense"
                  label="Expense"
                  value={formatINR(metrics.expense, { compact: true })}
                  change={metrics.expense_change}
                  icon={TrendingDown}
                  accent="rose"
                  goodWhenUp={false}
                  onClick={() => setDrill("expense")}
                  sparkline={getSparkline("expense")}
                />
                <KPICard
                  testId="kpi-investments"
                  label="Investments / SIP"
                  value={formatINR(metrics.investments, { compact: true })}
                  change={metrics.investments_change}
                  icon={LineChart}
                  accent="violet"
                  goodWhenUp
                  onClick={() => setDrill("investments")}
                  sparkline={getSparkline("investments")}
                />
                <KPICard
                  testId="kpi-savings-rate"
                  label="Savings Rate"
                  value={`${metrics.savings_rate}%`}
                  icon={PiggyBank}
                  accent={metrics.net < 0 ? "rose" : metrics.savings_rate >= 20 ? "emerald" : "sky"}
                  valueClassName={metrics.net < 0 ? "text-rose-500" : undefined}
                  note={metrics.net < 0 ? "overspent — nothing kept" : "income kept"}
                  onClick={() => setDrill("summary")}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Headline Insight — high-signal takeaway right under the hero */}
      {!loading && insights && insights.insights && insights.insights.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <CardContent className="flex items-start gap-3 px-4 py-3.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-sm leading-relaxed">
              <span className="font-semibold text-primary">Key insight · </span>
              {insights.insights[0]}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════
          SECTION 3: BREAKDOWN — Category donut (left) + ranked Top-5 (right)
          The donut shows proportion; the ranked bars give exact amounts.
          Pairing them answers "where did my money go?" at a glance.
          ════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <SectionHeader
          icon={PieChart}
          title="Spending Breakdown"
          subtitle={metrics?.current_month ? formatMonth(metrics.current_month) : undefined}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Category donut */}
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle className="text-sm">By Category</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[260px] rounded-lg" />
              ) : breakdown && breakdown.length ? (
                <CategoryDonut data={breakdown} height={260} />
              ) : (
                <EmptyState
                  icon={PieChart}
                  title="No spending categories yet"
                  description="Add transactions to see how your spending is distributed."
                  actionText="Add transaction"
                  onAction={goAddTransaction}
                />
              )}
            </CardContent>
          </Card>

          {/* Top 5 ranked categories */}
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Top Categories</span>
                {top5.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    This month
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)
              ) : top5.length ? (
                top5.map((c, i) => (
                  <div
                    key={c.category}
                    data-testid={`top-cat-${c.category}`}
                    className="group rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2.5 font-medium">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-muted-foreground bg-muted/60">
                          {i + 1}
                        </span>
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: categoryColor(c.category) }}
                        />
                        {c.category}
                      </span>
                      <span className="tabular-nums font-medium text-muted-foreground">
                        {formatINR(c.amount)}
                      </span>
                    </div>
                    <Progress
                      value={(c.amount / maxCat) * 100}
                      indicatorStyle={{ backgroundColor: categoryColor(c.category) }}
                    />
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <PieChart className="mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No spending yet this month.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SECTION 4: Budget Health
          ════════════════════════════════════════════════════════════ */}
      {!loading && metrics && (
        <section>
          <BudgetHealth month={metrics.current_month} />
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════
          SECTION 5: AI Insights (left) + Lifetime context (right)
          ════════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* AI Insights */}
        <Card data-testid="ai-insights" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Insights
                {insights?.source === "gemini" ? (
                  <Badge variant="default" className="ml-1">Gemini</Badge>
                ) : (
                  <Badge variant="outline" className="ml-1">Smart rules</Badge>
                )}
              </span>
              {geminiAvailable && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={refreshAI}
                  disabled={refreshing}
                  className="h-7 gap-1 px-2 text-xs"
                  data-testid="refresh-insights-btn"
                  title="Regenerate insights using Gemini"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  {refreshing ? "Refreshing…" : "Refresh"}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!insights || !insights.insights ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              ))
            ) : (
              insights.insights.map((line, i) => (
                <div
                  key={i}
                  className="flex gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60"
                >
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="leading-relaxed">{line}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Lifetime context — all-time numbers as low-priority reference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              Lifetime
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !metrics ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <StatPill
                  label="Total Income"
                  value={formatINR(metrics.total_income, { compact: true })}
                  tone="emerald"
                  icon={TrendingUp}
                />
                <StatPill
                  label="Total Spent"
                  value={formatINR(metrics.total_expense, { compact: true })}
                  tone="rose"
                  icon={TrendingDown}
                />
                <StatPill
                  label="Total Saved"
                  value={formatINR(metrics.total_savings, { compact: true })}
                  sub={`${metrics.total_savings_rate}% of income`}
                  tone={metrics.total_savings >= 0 ? "primary" : "rose"}
                  icon={PiggyBank}
                />
                <StatPill
                  label="Avg Savings"
                  value={`${metrics.avg_savings_rate}%`}
                  tone="sky"
                  icon={Wallet}
                />
                <StatPill
                  label="Avg Spend"
                  value={formatINR(metrics.avg_monthly_expense, { compact: true })}
                  sub="per month"
                  tone="violet"
                  icon={LineChart}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Drill-down dialog */}
      <CardDetailDialog
        kind={drill}
        metrics={metrics}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}
