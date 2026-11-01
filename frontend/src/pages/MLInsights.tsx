import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Brain,
  Calendar,
  Lightbulb,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Info,
  Coins,
  Activity,
  RefreshCw,
  Sparkles,
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from "recharts";

import PageHeader from "@/components/PageHeader";
import QAChatWidget from "@/components/QAChatWidget";
import KPICard from "@/components/KPICard";
import { ChartTooltip, CHART_AXIS, CHART_GRID } from "@/components/Charts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatINR, formatMonth, formatDate } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { spring } from "@/lib/motion";

// Global cache to persist data across component unmounts/remounts
const globalCache = {
  patterns: null,
  forecast: null,
  recs: null,
  anomalies: null,
  loaded: false,
  updatedAt: 0,
};

// Re-fetch ML results after this long even if nothing explicitly invalidated
const ML_CACHE_TTL_MS = 5 * 60 * 1000;

// Shared across every recharts component on this page
const CHART_DEFAULTS = { isAnimationActive: false };
const CHART_HEIGHT = 220;

const FORECAST_METHOD_LABEL: Record<string, string> = {
  linear_trend: "Linear trend",
  robust_trend: "Robust trend (median slope)",
  damped_holt: "Damped trend (Holt)",
  seasonal_naive: "Seasonal — same month last year",
  median_level: "Typical month (median)",
  moving_average: "Recent average",
  combined: "Income & spending models combined",
  average: "Average of available months",
};

const ANOMALY_TYPE_LABEL: Record<string, string> = {
  outlier_txn: "Unusual transaction",
  category_spike: "Category spike",
  new_category: "New category",
};

function hasMeaningfulData(value) {
  return Boolean(value && !value.empty && Object.keys(value).length > 0);
}

// ── Premium Components ───────────────────────────────────────────────

function InsightCard({ children, className }: any) {
  return (
    <Card className={cn("border-border/50 bg-gradient-to-br from-card to-muted/30/50 shadow-sm hover:shadow-md transition-shadow", className)}>
      {children}
    </Card>
  );
}

function EmptyState({ icon: Icon = Info, title, description, action }: any) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 shadow-sm">
          <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: any) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">Could not load this insight</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>
        <Button onClick={onRetry} variant="outline" size="default" className="mt-4 gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value, className }: any) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function MLInsights() {
  const queryClient = useQueryClient();

  const [patterns, setPatterns] = useState(globalCache.patterns);
  const [forecast, setForecast] = useState(globalCache.forecast);
  const [recs, setRecs] = useState(globalCache.recs);
  const [anomalies, setAnomalies] = useState(globalCache.anomalies);
  const [loading, setLoading] = useState(!globalCache.loaded);
  const [error, setError] = useState(null);
  const [endpointErrors, setEndpointErrors] = useState<any>({});

  const loadData = useCallback(async (force = false) => {
    if (!force && globalCache.loaded && Date.now() - globalCache.updatedAt < ML_CACHE_TTL_MS) {
      return;
    }

    setLoading(true);
    setError(null);
    setEndpointErrors({});
    try {
      const [patternsRes, forecastRes, recsRes, anomaliesRes] = await Promise.allSettled([
        api.get("/ml/spending-patterns"),
        api.get("/ml/cash-flow-forecast"),
        api.get("/ml/recommendations"),
        api.get("/ml/anomalies"),
      ]);

      const nextErrors: any = {};
      if (patternsRes.status === "fulfilled") {
        setPatterns(patternsRes.value.data);
        globalCache.patterns = patternsRes.value.data;
      } else {
        setPatterns(null);
        globalCache.patterns = null;
        nextErrors.patterns = "Spending pattern analysis is unavailable right now.";
      }
      if (forecastRes.status === "fulfilled") {
        setForecast(forecastRes.value.data);
        globalCache.forecast = forecastRes.value.data;
      } else {
        setForecast(null);
        globalCache.forecast = null;
        nextErrors.forecast = "Cash-flow forecasting is unavailable right now.";
      }
      if (recsRes.status === "fulfilled") {
        setRecs(recsRes.value.data);
        globalCache.recs = recsRes.value.data;
      } else {
        setRecs(null);
        globalCache.recs = null;
        nextErrors.recommendations = "Smart recommendations are unavailable right now.";
      }
      if (anomaliesRes.status === "fulfilled") {
        setAnomalies(anomaliesRes.value.data);
        globalCache.anomalies = anomaliesRes.value.data;
      } else {
        setAnomalies(null);
        globalCache.anomalies = null;
        nextErrors.anomalies = "Unusual-activity detection is unavailable right now.";
      }
      setEndpointErrors(nextErrors);

      const anyOk =
        patternsRes.status === "fulfilled" ||
        forecastRes.status === "fulfilled" ||
        recsRes.status === "fulfilled";
      globalCache.loaded = anyOk;
      globalCache.updatedAt = Date.now();

      if (patternsRes.status === "rejected" && forecastRes.status === "rejected" && recsRes.status === "rejected") {
        setError("Failed to connect to ML analytics services. Please ensure the backend server is running.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to connect to ML analytics services. Please ensure the backend server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const onCacheEvent = (event) => {
      const key = event?.query?.queryKey?.[0];
      if (key === "transactions" || key === "dashboard_metrics" || key === "category_breakdown") {
        globalCache.loaded = false;
        globalCache.updatedAt = 0;
      }
    };
    return queryClient.getQueryCache().subscribe(onCacheEvent);
  }, [queryClient]);

  // Derived data
  const monthly = patterns?.monthly_patterns;
  const weekday = patterns?.weekday_patterns;
  const clusters = patterns?.spending_clusters;
  const seasonal = patterns?.seasonal_patterns;
  const commitments = patterns?.recurring_commitments;
  const fixedSplit = patterns?.fixed_vs_discretionary;

  const patternsReady = hasMeaningfulData(patterns);
  const forecastReady = hasMeaningfulData(forecast);
  const recsReady = hasMeaningfulData(recs);
  const anomalyItems = useMemo(() => anomalies?.anomalies || [], [anomalies]);
  const anomaliesReady = anomalyItems.length > 0;

  const recommendationCount = recs?.recommendations?.length || 0;
  const savingsMonthly = recs?.total_potential_monthly_savings || 0;
  const hasCommitments =
    (commitments?.categories?.length || 0) + (commitments?.subscriptions?.length || 0) > 0;

  const nextForecast = forecast?.forecast?.[0];
  const nextForecastLabel = nextForecast ? formatMonth(nextForecast.month) : "—";
  const confidenceLabel = forecast?.confidence
    ? forecast.confidence.charAt(0).toUpperCase() + forecast.confidence.slice(1)
    : "—";
  const trendLabel = monthly?.trend
    ? monthly.trend.charAt(0).toUpperCase() + monthly.trend.slice(1)
    : "—";
  const monthsOnRecord = monthly?.monthly_spending?.length || 0;

  const forecastChartData = (forecast?.forecast || []).map((f) => ({
    ...f,
    bandBase: f.lower,
    bandWidth: Math.max(0, f.upper - f.lower),
  }));

  const weekendDays = weekday?.weekend_vs_weekday;
  const weekendTotal = weekendDays?.total || (weekendDays?.weekend || 0) + (weekendDays?.weekday || 0);
  const weekendPercent = weekendTotal > 0 ? Math.round(((weekendDays?.weekend || 0) / weekendTotal) * 100) : 0;

  // Loading states
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-52" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[80px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center space-y-4 rounded-2xl border border-destructive/25 bg-destructive/5 p-8 text-center">
        <div className="rounded-full border border-destructive/30 bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold">Analysis offline</h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{error}</p>
        <Button onClick={() => loadData(true)} className="mt-2 gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry connection
        </Button>
      </div>
    );
  }

  const anyData = patternsReady || forecastReady || recsReady || anomaliesReady;

  return (
    <div className="page-enter relative">
      <div className="relative z-10 space-y-8 pb-12">
        <PageHeader
          title="Smart Money Insights"
          subtitle="AI-powered analysis to help you understand, optimize, and grow your finances"
          actions={
            <>
              <Badge variant="secondary" className="hidden items-center gap-1.5 px-2.5 py-1 text-[11px] sm:inline-flex">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> AI-powered
              </Badge>
              <Button
                variant="outline"
                size="default"
                onClick={() => loadData(true)}
                disabled={loading}
                data-testid="ml-refresh-btn"
                className="gap-2"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
                Refresh
              </Button>
            </>
          }
        />

        {!anyData ? (
          <EmptyState
            icon={Sparkles}
            title="Start tracking to see insights"
            description="Add transactions or import a statement. Batua will analyze your spending patterns, forecast cash flow, and suggest ways to save."
            action={
              <Link to="/transactions" className={cn(buttonVariants({ size: "default" }), "gap-2")}>
                Add transactions <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
        ) : (
          <>
            {/* Key Metrics */}
            <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KPICard
                label="Monthly spending"
                value={monthly?.avg_monthly_spending != null ? formatINR(monthly.avg_monthly_spending, { compact: true }) : "—"}
                note={monthsOnRecord ? `${monthsOnRecord} month${monthsOnRecord === 1 ? "" : "s"} of data` : "Add transactions"}
                icon={Coins}
                accent="sky"
              />
              <KPICard
                label="Spending trend"
                value={trendLabel}
                note={patternsReady ? "Based on your history" : "Not enough data"}
                icon={Activity}
                accent={monthly?.trend === "increasing" ? "rose" : "emerald"}
              />
              <KPICard
                label="Next month forecast"
                value={nextForecast ? formatINR(nextForecast.predicted_cashflow, { compact: true }) : "—"}
                note={nextForecast ? nextForecastLabel : "Add more transactions"}
                icon={Calendar}
                accent="primary"
              />
              <KPICard
                label="Potential savings"
                value={savingsMonthly > 0 ? `${formatINR(savingsMonthly, { compact: true })}/mo` : "—"}
                note={recommendationCount ? `${recommendationCount} tip${recommendationCount === 1 ? "" : "s"}` : "Add expenses"}
                icon={Lightbulb}
                accent="emerald"
              />
            </section>

            {/* Smart Recommendations */}
            {recsReady && recommendationCount > 0 && (
              <section>
                <CardHeader className="px-0 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    Ways to save money
                  </CardTitle>
                </CardHeader>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {recs.recommendations.map((r, i) => {
                    const priorityColor = r.priority === "high" ? "text-rose-500" : r.priority === "medium" ? "text-amber-500" : "text-emerald-500";
                    const priorityBg = r.priority === "high" ? "bg-rose-500/10" : r.priority === "medium" ? "bg-amber-500/10" : "bg-emerald-500/10";
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <InsightCard>
                          <CardContent className="p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <span className={cn("text-[10.5px] font-semibold capitalize px-2 py-1 rounded-full", priorityColor, priorityBg)}>
                                {r.priority} priority
                              </span>
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                Save {formatINR(r.potential_savings)}/mo
                              </span>
                            </div>
                            <h3 className="text-sm font-semibold text-foreground mb-2">{r.title}</h3>
                            <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{r.description}</p>
                          </CardContent>
                        </InsightCard>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Cash Flow Forecast */}
            {forecastReady && (
              <section>
                <CardHeader className="px-0 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                    Cash flow forecast
                  </CardTitle>
                </CardHeader>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <InsightCard className="lg:col-span-2">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">3-month projection</span>
                        <span className="text-xs text-muted-foreground">80% confidence range</span>
                      </div>
                      {forecastChartData.length ? (
                        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                          <AreaChart data={forecastChartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} {...CHART_DEFAULTS}>
                            <defs>
                              <linearGradient id="gForecast" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.04} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                            <XAxis dataKey="month" stroke={CHART_AXIS} fontSize={10} tickLine={false} tickFormatter={formatMonth} />
                            <YAxis stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                            <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} />
                            <Area type="monotone" dataKey="bandBase" stackId="band" stroke="none" fill="transparent" legendType="none" tooltipType="none" isAnimationActive={false} />
                            <Area type="monotone" dataKey="bandWidth" stackId="band" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.15} legendType="none" tooltipType="none" isAnimationActive={false} />
                            <Area
                              type="monotone"
                              dataKey="predicted_cashflow"
                              name="Projected cash flow"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              fill="url(#gForecast)"
                              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--primary))", fill: "hsl(var(--background))" }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                          Forecast not available
                        </div>
                      )}
                    </CardContent>
                  </InsightCard>

                  <InsightCard>
                    <CardContent className="p-4">
                      <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 p-4 ring-1 ring-primary/10">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-primary opacity-80">
                          {nextForecastLabel}
                        </div>
                        <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatINR(nextForecast?.predicted_cashflow || 0, { compact: true })}</div>
                        <div className="mt-1 text-xs text-muted-foreground">projected net</div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Confidence</span>
                          <Badge variant={forecast?.confidence === "high" ? "success" : forecast?.confidence === "medium" ? "warning" : "default"} className="text-[10.5px]">
                            {confidenceLabel}
                          </Badge>
                        </div>
                        <StatRow label="3-month total" value={formatINR(forecast?.three_month_total || 0)} />
                        <StatRow label="Model" value={FORECAST_METHOD_LABEL[forecast?.method ?? ""] || "—"} />
                      </div>
                    </CardContent>
                  </InsightCard>
                </div>
              </section>
            )}

            {/* Spending Patterns */}
            {patternsReady && (
              <section>
                <CardHeader className="px-0 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="h-5 w-5 text-primary" />
                    Your spending patterns
                  </CardTitle>
                </CardHeader>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {/* Weekend vs Weekday */}
                  {weekendDays && (
                    <InsightCard>
                      <CardContent className="p-4">
                        <div className="mb-3 text-xs font-semibold text-muted-foreground">Weekend vs weekday spending</div>
                        <div className="flex items-baseline justify-between mb-3">
                          <span className="text-3xl font-bold tabular-nums text-foreground">{weekendPercent}%</span>
                          <span className="text-xs text-muted-foreground">on weekends</span>
                        </div>
                        <Progress value={weekendPercent} className="h-2 mb-4" />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10.5px] text-muted-foreground mb-1">Weekday</div>
                            <div className="text-sm font-semibold tabular-nums">{formatINR(weekendDays.weekday, { compact: true })}</div>
                          </div>
                          <div>
                            <div className="text-[10.5px] text-muted-foreground mb-1">Weekend</div>
                            <div className="text-sm font-semibold tabular-nums">{formatINR(weekendDays.weekend, { compact: true })}</div>
                          </div>
                        </div>
                      </CardContent>
                    </InsightCard>
                  )}

                  {/* Fixed vs Flexible */}
                  {fixedSplit && (
                    <InsightCard>
                      <CardContent className="p-4">
                        <div className="mb-3 text-xs font-semibold text-muted-foreground">Fixed vs flexible expenses</div>
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <div className="text-[10.5px] text-muted-foreground mb-1">Fixed</div>
                              <div className="text-sm font-semibold tabular-nums">{formatINR(fixedSplit.fixed_monthly || 0, { compact: true })}</div>
                            </div>
                            <div>
                              <div className="text-[10.5px] text-muted-foreground mb-1">Flexible</div>
                              <div className="text-sm font-semibold tabular-nums">{formatINR(fixedSplit.discretionary_monthly || 0, { compact: true })}</div>
                            </div>
                            <div>
                              <div className="text-[10.5px] text-muted-foreground mb-1">Fixed %</div>
                              <div className="text-sm font-semibold tabular-nums">{Math.round((fixedSplit.fixed_share || 0) * 100)}%</div>
                            </div>
                          </div>

                          {hasCommitments ? (
                            <div className="mt-3 divide-y divide-border/50">
                              {commitments?.categories?.slice(0, 3).map((c) => (
                                <div key={c.category} className="flex items-center justify-between py-2 text-xs">
                                  <span className="font-medium">{c.category}</span>
                                  <span className="tabular-nums text-muted-foreground">
                                    {formatINR(c.monthly_amount)}/mo
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-3">No recurring bills detected yet</p>
                          )}
                        </div>
                      </CardContent>
                    </InsightCard>
                  )}

                  {/* Top Categories */}
                  {clusters?.clusters?.length > 0 && (
                    <InsightCard>
                      <CardContent className="p-4">
                        <div className="mb-3 text-xs font-semibold text-muted-foreground">Top spending categories</div>
                        <div className="space-y-2">
                          {clusters.clusters.slice(0, 3).map((c, i) => {
                            const isHigh = i === 0;
                            const isMedium = i === 1;
                            const colorClass = isHigh ? "text-rose-500 bg-rose-500/10" : isMedium ? "text-amber-500 bg-amber-500/10" : "text-emerald-500 bg-emerald-500/10";
                            return (
                              <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-border/50">
                                <div className="flex items-center gap-2">
                                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg text-xs", colorClass)}>
                                    {isHigh ? <TrendingUp className="h-3 w-3" /> : isMedium ? <BarChart3 className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  </span>
                                  <span className="text-xs font-medium">{c.categories[0] || 'Category'}</span>
                                </div>
                                <span className="text-xs font-semibold tabular-nums">{formatINR(c.total_spending, { compact: true })}</span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </InsightCard>
                  )}
                </div>
              </section>
            )}

            {/* Alerts */}
            {anomaliesReady && (
              <section>
                <CardHeader className="px-0 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ShieldAlert className="h-5 w-5 text-primary" />
                    Things to review
                  </CardTitle>
                </CardHeader>
                <div className="space-y-3">
                  {anomalyItems.slice(0, 5).map((a, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <InsightCard className={cn(
                        "flex items-start gap-3 p-4 transition-all hover:shadow-md",
                        a.severity === "high" ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5"
                      )}>
                        <span className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          a.severity === "high"
                            ? "border border-rose-500/30 bg-rose-500/15 text-rose-500"
                            : "border border-amber-500/30 bg-amber-500/15 text-amber-500"
                        )}>
                          <AlertCircle className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-xs font-semibold">{ANOMALY_TYPE_LABEL[a.type] || "Anomaly"}</span>
                            <Badge variant={a.severity === "high" ? "destructive" : "warning"} className="text-[10.5px] capitalize">
                              {a.severity}
                            </Badge>
                            <Badge variant="secondary" className="text-[10.5px]">{a.category}</Badge>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{a.description}</p>
                        </div>
                        <div className="shrink-0 text-right text-xs font-bold tabular-nums">{formatINR(a.amount)}</div>
                      </InsightCard>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <QAChatWidget />
    </div>
  );
}
