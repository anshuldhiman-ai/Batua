import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  LineChart,
  AlertTriangle,
  Sparkles,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import NLInputBar from "@/components/NLInputBar";
import KPICard from "@/components/KPICard";
import CardDetailDialog from "@/components/CardDetailDialog";
import { TimelineChart, CategoryDonut } from "@/components/Charts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, formatINR, formatMonth, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const [metrics, setMetrics] = React.useState(null);
  const [timeline, setTimeline] = React.useState([]);
  const [breakdown, setBreakdown] = React.useState([]);
  const [insights, setInsights] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [drill, setDrill] = React.useState(null); // which KPI card is expanded
  const [refreshing, setRefreshing] = React.useState(false);
  const [geminiAvailable, setGeminiAvailable] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [m, t, b, ins] = await Promise.all([
        api.get("/dashboard/metrics"),
        api.get("/analytics/timeline"),
        api.get("/analytics/category-breakdown"),
        // Insights are now fast (cached rules) — include in the same pass.
        api.get("/insights"),
      ]);
      setMetrics(m.data);
      setTimeline(t.data.series);
      setBreakdown(b.data.data);
      setInsights(ins.data);
    } catch (err) {
      // Insights failing shouldn't blank the dashboard.
      console.error("Dashboard load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Discover once whether Gemini is enabled, so we show the refresh button.
  React.useEffect(() => {
    api.get("/")
      .then((r) => setGeminiAvailable(Boolean(r.data?.ai)))
      .catch(() => setGeminiAvailable(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const refreshAI = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await api.post("/insights/refresh", null, { timeout: 10000 });
      toast.success("Refreshing AI insights in background…");
      // Poll once after a short delay so the user actually sees new insights.
      setTimeout(async () => {
        try {
          const { data } = await api.get("/insights");
          setInsights(data);
        } catch (e) {
          /* ignore */
        } finally {
          setRefreshing(false);
        }
      }, 2500);
    } catch (e) {
      setRefreshing(false);
      toast.error(e.response?.data?.detail || "Could not refresh AI insights");
    }
  }, []);

  const top5 = metrics?.top_categories || [];
  const maxCat = top5.length ? top5[0].amount : 1;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {metrics?.current_month
            ? `Your money at a glance · latest activity in ${formatMonth(metrics.current_month)}`
            : "Your money at a glance"}
        </p>
      </div>

      <NLInputBar onSaved={load} />

      {/* This-month KPIs */}
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          This month
        </h2>
        {metrics?.current_month && (
          <span className="text-xs text-muted-foreground">· {formatMonth(metrics.current_month)}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {loading || !metrics ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <KPICard
              testId="kpi-income"
              label="Income"
              value={formatINR(metrics.income, { compact: true })}
              change={metrics.income_change}
              icon={TrendingUp}
              accent="emerald"
              goodWhenUp
              onClick={() => setDrill("income")}
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
            />
            <KPICard
              testId="kpi-net"
              label={metrics.net < 0 ? "Overspent this month" : "Funds Left this month"}
              value={formatINR(Math.abs(metrics.net), { compact: true })}
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
            />
            <KPICard
              testId="kpi-savings-rate"
              label="Savings Rate"
              value={`${metrics.savings_rate}%`}
              icon={PiggyBank}
              accent="sky"
              note="income kept this month"
              onClick={() => setDrill("summary")}
            />
          </>
        )}
      </div>

      {/* All-time overview + averages */}
      {!loading && metrics && (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lifetime
        </h2>
      )}
      {!loading && metrics && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5" data-testid="card-alltime">
            <p className="mb-4 text-sm font-medium text-muted-foreground">All-time overview</p>
            <div className="grid grid-cols-3 divide-x divide-border">
              <Partition
                label="Total income"
                value={formatINR(metrics.total_income, { compact: true })}
                tone="emerald"
              />
              <Partition
                label="Used (spent)"
                value={formatINR(metrics.total_expense, { compact: true })}
                tone="rose"
              />
              <Partition
                label="Savings left"
                value={formatINR(metrics.total_savings, { compact: true })}
                sub={`${metrics.total_savings_rate}% saved`}
                tone={metrics.total_savings >= 0 ? "primary" : "rose"}
              />
            </div>
          </Card>

          <Card className="p-5" data-testid="card-averages">
            <p className="mb-4 text-sm font-medium text-muted-foreground">
              Monthly averages <span className="text-xs">· {metrics.month_count} months</span>
            </p>
            <div className="grid grid-cols-2 divide-x divide-border">
              <Partition
                label="Avg savings rate"
                value={`${metrics.avg_savings_rate}%`}
                sub="of monthly income"
                tone="sky"
              />
              <Partition
                label="Avg monthly spend"
                value={formatINR(metrics.avg_monthly_expense, { compact: true })}
                sub="across all months"
                tone="violet"
              />
            </div>
          </Card>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Income vs Expense</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[300px]" /> : timeline && timeline.length ? <TimelineChart data={timeline} /> : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data available</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[300px]" /> : breakdown && breakdown.length ? <CategoryDonut data={breakdown} /> : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data available</div>}
          </CardContent>
        </Card>
      </div>

      {/* Insights + Top categories */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-testid="ai-insights">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> AI Insights
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
          <CardContent className="space-y-3">
            {!insights || !insights.insights ? (
              <>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </>
            ) : (
              <>
                {insights.insights.map((line, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{line}</span>
                  </div>
                ))}
                {insights.source === "rules" && (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    These are fast deterministic insights. Tap Refresh for a
                    Gemini-powered rewrite.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)
            ) : top5.length ? (
              top5.map((c) => (
                <div key={c.category} data-testid={`top-cat-${c.category}`}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: categoryColor(c.category) }}
                      />
                      {c.category}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatINR(c.amount)}
                    </span>
                  </div>
                  <Progress
                    value={(c.amount / maxCat) * 100}
                    indicatorClassName=""
                    style={{ ["--tw-bg-opacity"]: 1 }}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No spending yet this month.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <CardDetailDialog
        kind={drill}
        metrics={metrics}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}

const TONE_CLASS = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  rose: "text-rose-500",
  primary: "text-foreground",
  sky: "text-sky-500",
  violet: "text-violet-500",
};

function Partition({ label, value, sub, tone = "primary" }) {
  return (
    <div className="px-4 first:pl-0 last:pr-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 kpi-number text-2xl", TONE_CLASS[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
