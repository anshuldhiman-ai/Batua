import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Target,
  BarChart3,
} from "lucide-react";
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
import AnalyticsStatCard from "@/components/analytics/AnalyticsStatCard";
import { ChartTooltip, CHART_AXIS, CHART_GRID } from "@/components/Charts";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api, formatINR, formatMonth } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

// Global cache to persist data across component unmounts/remounts
const globalCache = {
  patterns: null,
  forecast: null,
  recs: null,
  loaded: false,
};

// Shared across every recharts component on this page. Animations are off so
// charts render instantly and never "laggy"-replay on data refresh or tab
// switches. Keeping it here (not per-chart) stops them from drifting again.
const CHART_DEFAULTS = { isAnimationActive: false };

function EmptyState({ icon: Icon = Info, title, description }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/20 bg-gradient-to-br from-muted/30 to-muted/10 p-8 text-center backdrop-blur-sm">
      <div className="rounded-full bg-muted/50 p-4 ring-1 ring-muted-foreground/10">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="mt-4 text-base font-semibold text-foreground">{title}</div>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10 p-8 text-center backdrop-blur-sm">
      <div className="rounded-full bg-destructive/10 p-4 ring-1 ring-destructive/20">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div className="mt-4 text-base font-semibold text-foreground">Could not load this insight</div>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button onClick={onRetry} variant="outline" size="sm" className="mt-6 shadow-sm">
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

function hasMeaningfulData(value) {
  return Boolean(value && !value.empty && Object.keys(value).length > 0);
}

const FORECAST_METHOD_LABEL: Record<string, string> = {
  linear_trend: "Linear trend (last 6 months)",
  average: "Average of available months",
};

const CLUSTER_TIERS = [
  {
    label: "High spending volume",
    classes: "border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-rose-500/5 text-rose-700 dark:text-rose-400 shadow-sm",
    icon: TrendingUp,
  },
  {
    label: "Moderate spending volume",
    classes: "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 text-amber-700 dark:text-amber-400 shadow-sm",
    icon: BarChart3,
  },
  {
    label: "Low spending volume",
    classes: "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 shadow-sm",
    icon: TrendingDown,
  },
];

export default function MLInsights() {
  const [activeTab, setActiveTab] = useState("patterns");
  const mountedRef = useRef(true);

  // Data States - initialize from global cache if available
  const [patterns, setPatterns] = useState(globalCache.patterns);
  const [forecast, setForecast] = useState(globalCache.forecast);
  const [recs, setRecs] = useState(globalCache.recs);

  // Loading & Error States
  const [loading, setLoading] = useState(!globalCache.loaded);
  const [error, setError] = useState(null);
  const [endpointErrors, setEndpointErrors] = useState<any>({});

  // Fetch all ML analytics data on mount
  const loadData = useCallback(async (force = false) => {
    // If data is already loaded and not forcing a refresh, skip loading
    if (!force && globalCache.loaded) {
      return;
    }

    setLoading(true);
    setError(null);
    setEndpointErrors({});
    try {
      const [patternsRes, forecastRes, recsRes] = await Promise.allSettled([
        api.get("/ml/spending-patterns"),
        api.get("/ml/cash-flow-forecast"),
        api.get("/ml/recommendations"),
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
      setEndpointErrors(nextErrors);
      globalCache.loaded = true;

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4 rounded-xl border border-destructive/20 bg-gradient-to-br from-destructive/5 to-background p-8 text-center shadow-sm">
        <div className="rounded-full bg-destructive/10 p-5 ring-1 ring-destructive/20">
          <AlertCircle className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-xl font-bold">Analysis Offline</h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{error}</p>
        <Button onClick={() => loadData(true)} className="mt-2 px-6 shadow-md">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry Connection
        </Button>
      </div>
    );
  }

  const { monthly_patterns, weekday_patterns, category_trends, spending_clusters, seasonal_patterns } = patterns || {};
  const patternsReady = hasMeaningfulData(patterns);
  const forecastReady = hasMeaningfulData(forecast);
  const forecastChartData = (forecast?.forecast || []).map((f) => ({
    ...f,
    bandBase: f.lower,
    bandWidth: Math.max(0, f.upper - f.lower),
  }));
  const recsReady = hasMeaningfulData(recs);
  const weekendTotal = weekday_patterns?.weekend_vs_weekday?.total || (
    (weekday_patterns?.weekend_vs_weekday?.weekend || 0) + (weekday_patterns?.weekend_vs_weekday?.weekday || 0)
  );
  const weekendPercent = weekendTotal > 0
    ? Math.round(((weekday_patterns?.weekend_vs_weekday?.weekend || 0) / weekendTotal) * 100)
    : 0;

  const trendLabel = monthly_patterns?.trend
    ? monthly_patterns.trend.charAt(0).toUpperCase() + monthly_patterns.trend.slice(1)
    : "Stable";

  return (
    <div className="page-enter space-y-6 pb-12">
      {/* Premium gradient header with icon */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 shadow-lg">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            AI-Powered Analytics
          </div>
          <PageHeader
            title="AI Insights"
            subtitle="Pattern analytics, cash-flow forecasting and saving tips — tap the chat bubble to ask questions about your money"
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadData(true)}
                disabled={loading}
                data-testid="ml-refresh-btn"
                className="bg-background/50 shadow-sm backdrop-blur-sm hover:bg-background/80"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
            }
          />
        </div>
      </div>

      {/* Premium tabs with enhanced styling */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1 shadow-sm backdrop-blur-sm lg:inline-flex lg:w-auto">
          <TabsTrigger value="patterns" className="gap-2 data-[state=active]:shadow-sm">
            <Brain className="h-4 w-4" />
            Patterns
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2 data-[state=active]:shadow-sm">
            <Calendar className="h-4 w-4" />
            Forecast
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-2 data-[state=active]:shadow-sm">
            <Lightbulb className="h-4 w-4" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        {/* 1. Spending Patterns Tab */}
        <TabsContent value="patterns" className="space-y-6">
          {endpointErrors.patterns ? (
            <ErrorState message={endpointErrors.patterns} onRetry={loadData} />
          ) : !patternsReady ? (
            <EmptyState
              icon={Brain}
              title="No spending patterns yet"
              description={patterns?.message || "Add expense transactions or import a statement to unlock monthly trends, clusters, and seasonal patterns."}
            />
          ) : (
            <>
              {/* Premium stat cards grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <AnalyticsStatCard
                  title="Monthly Avg Spend"
                  value={formatINR(monthly_patterns?.avg_monthly_spending || 0, { compact: true })}
                  subtitle="Based on historical activity"
                  tone="sky"
                  icon={Coins}
                />
                <AnalyticsStatCard
                  title="Spending Trend"
                  value={trendLabel}
                  subtitle="Overall trajectory of spending"
                  tone={monthly_patterns?.trend === "increasing" ? "rose" : "emerald"}
                  icon={Activity}
                />
                <AnalyticsStatCard
                  title="Peak Spend Month"
                  value={seasonal_patterns?.peak_spending_month || "N/A"}
                  subtitle={
                    seasonal_patterns?.peak_spending_amount != null
                      ? `${formatINR(seasonal_patterns.peak_spending_amount, { compact: true })} spent in total`
                      : "Month with your highest total spend"
                  }
                  tone="rose"
                  icon={TrendingUp}
                />
                <AnalyticsStatCard
                  title="Lowest Spend Month"
                  value={seasonal_patterns?.lowest_spending_month || "N/A"}
                  subtitle={
                    seasonal_patterns?.lowest_spending_amount != null
                      ? `${formatINR(seasonal_patterns.lowest_spending_amount, { compact: true })} spent in total`
                      : "Month with your lowest total spend"
                  }
                  tone="emerald"
                  icon={TrendingDown}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Monthly Trend Chart - enhanced card */}
                <Card className="shadow-sm lg:col-span-2">
                  <CardHeader className="border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle>Monthly Spending Trends</CardTitle>
                        <CardDescription className="mt-0.5">Visual breakdown of monthly totals and period growth rate</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {monthly_patterns?.monthly_spending?.length ? (
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={monthly_patterns.monthly_spending} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} {...CHART_DEFAULTS}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                          <XAxis dataKey="month_str" stroke={CHART_AXIS} fontSize={11} tickLine={false} tickFormatter={formatMonth} />
                          <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                          <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.1 }} />
                          <Bar dataKey="sum" name="Total Spent" radius={[6, 6, 0, 0]}>
                            {monthly_patterns.monthly_spending.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === monthly_patterns.monthly_spending.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary)/0.6)"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">No historical monthly data found.</div>
                    )}
                  </CardContent>
                </Card>

                {/* Weekly Distribution - enhanced card */}
                <Card className="shadow-sm">
                  <CardHeader className="border-b bg-muted/30">
                    <CardTitle>Weekly Distribution</CardTitle>
                    <CardDescription>How spending is distributed over the week</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    <div>
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="font-medium">Weekend vs. Weekday</span>
                        <Badge variant="secondary" className="tabular-nums">
                          {weekday_patterns?.weekend_vs_weekday ? `${weekendPercent}%` : "N/A"}
                        </Badge>
                      </div>
                      {weekday_patterns?.weekend_vs_weekday && (
                        <div className="space-y-3">
                          <Progress value={weekendPercent} className="h-2.5 shadow-sm" />
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border bg-muted/30 p-2 text-center">
                              <div className="text-muted-foreground">Weekday</div>
                              <div className="mt-1 font-semibold tabular-nums">{formatINR(weekday_patterns.weekend_vs_weekday.weekday, { compact: true })}</div>
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-2 text-center">
                              <div className="text-muted-foreground">Weekend</div>
                              <div className="mt-1 font-semibold tabular-nums">{formatINR(weekday_patterns.weekend_vs_weekday.weekend, { compact: true })}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Highest Spending Day</span>
                        <span className="font-bold text-foreground">{weekday_patterns?.highest_spending_day || "N/A"}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lowest Spending Day</span>
                        <span className="font-semibold text-foreground">{weekday_patterns?.lowest_spending_day || "N/A"}</span>
                      </div>
                    </div>

                    {category_trends?.top_growing_category && (
                      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                        <div className="text-sm font-semibold">Category Trajectory</div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Fastest Growing</span>
                          <span className="flex items-center gap-1.5 font-semibold text-rose-500">
                            <TrendingUp className="h-3.5 w-3.5" /> {category_trends.top_growing_category}
                          </span>
                        </div>
                        {category_trends?.fastest_declining_category && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Fastest Declining</span>
                            <span className="flex items-center gap-1.5 font-semibold text-emerald-500">
                              <TrendingDown className="h-3.5 w-3.5" /> {category_trends.fastest_declining_category}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Premium Category clusters */}
              <Card className="shadow-sm">
                <CardHeader className="border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Category Volume Clusters</CardTitle>
                      <CardDescription className="mt-0.5">AI grouped spending tiers based on typical monthly category volume</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  {spending_clusters?.clusters?.length ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {spending_clusters.clusters.map((c, i) => {
                        const tier = CLUSTER_TIERS[i] || CLUSTER_TIERS[CLUSTER_TIERS.length - 1];
                        const TierIcon = tier.icon;
                        return (
                          <div key={i} className={cn("group relative space-y-3 rounded-xl border p-4 transition-all hover:shadow-md", tier.classes)}>
                            <div className="flex items-center gap-2">
                              <div className="rounded-lg bg-background/60 p-1.5">
                                <TierIcon className="h-4 w-4" />
                              </div>
                              <h4 className="text-sm font-semibold">{tier.label}</h4>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {c.categories.map((cat) => (
                                <Badge key={cat} variant="secondary" className="bg-background/80 text-xs shadow-sm">
                                  {cat}
                                </Badge>
                              ))}
                            </div>
                            <div className="rounded-lg border border-current/10 bg-background/40 p-2 text-xs">
                              <div className="text-muted-foreground">Total Spending in Tier</div>
                              <div className="mt-1 font-bold tabular-nums">{formatINR(c.total_spending)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">Not enough category diversity to generate cluster groups.</div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* 2. Cash Flow Forecast Tab */}
        <TabsContent value="forecast" className="space-y-6">
          {endpointErrors.forecast ? (
            <ErrorState message={endpointErrors.forecast} onRetry={loadData} />
          ) : !forecastReady ? (
            <EmptyState
              icon={Calendar}
              title="No forecast available"
              description={forecast?.message || "Add at least a few dated transactions to generate next-month and three-month cash-flow projections."}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Forecast details - premium styling */}
              <Card className="shadow-sm">
                <CardHeader className="border-b bg-muted/30">
                  <CardTitle>Forecast Summary</CardTitle>
                  <CardDescription>Future projection estimates and confidence bounds</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Confidence Level</span>
                      <Badge
                        variant={forecast?.confidence === "high" ? "success" : forecast?.confidence === "medium" ? "warning" : "default"}
                        className="capitalize shadow-sm"
                      >
                        {forecast?.confidence || "Medium"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Method</span>
                      <span className="text-sm font-medium text-foreground">{FORECAST_METHOD_LABEL[forecast?.method ?? ""] || "Linear trend"}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-primary/10 pt-3">
                      <span className="text-sm text-muted-foreground">3-Month Total</span>
                      <span className="text-base font-bold tabular-nums text-primary">{formatINR(forecast?.three_month_total || 0)}</span>
                    </div>
                  </div>

                  {forecast?.backtest && (
                    <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-xs shadow-sm">
                      <div className="text-sm font-semibold">Backtest vs. baseline</div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Model avg. error</span>
                        <span className="font-semibold text-foreground tabular-nums">{formatINR(forecast.backtest.model_mae)}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{forecast.backtest.baseline} error</span>
                        <span className="font-semibold text-foreground tabular-nums">{formatINR(forecast.backtest.baseline_mae)}</span>
                      </div>
                      <p className="rounded-lg border bg-background/50 p-2 pt-2 text-xs leading-relaxed text-muted-foreground">
                        {forecast.backtest.beats_baseline
                          ? `The model was closer than the ${forecast.backtest.baseline.toLowerCase()} on the last ${forecast.backtest.folds} months.`
                          : `The model did not beat the ${forecast.backtest.baseline.toLowerCase()} on the last ${forecast.backtest.folds} months, so treat this forecast as a rough guide.`}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Expected Cash Flow</h4>
                    {forecast?.forecast?.length ? (
                      <div className="space-y-2">
                        {forecast.forecast.map((f, i) => (
                          <div key={i} className="group flex items-center justify-between rounded-lg border bg-gradient-to-r from-muted/40 to-muted/20 p-3 shadow-sm transition-all hover:shadow-md">
                            <span className="text-sm font-medium">{formatMonth(f.month)}</span>
                            <span className="text-sm font-bold tabular-nums text-primary">{formatINR(f.predicted_cashflow)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No forecast intervals generated.</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Forecast Chart - premium styling */}
              <Card className="shadow-sm lg:col-span-2">
                <CardHeader className="border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle>3-Month Forecast Projection</CardTitle>
                      <CardDescription className="mt-0.5">Projected net flow with an ~80% range from the historical trend</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  {forecast?.forecast?.length ? (
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={forecastChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} {...CHART_DEFAULTS}>
                        <defs>
                          <linearGradient id="gForecast" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                        <XAxis dataKey="month" stroke={CHART_AXIS} fontSize={11} tickLine={false} tickFormatter={formatMonth} />
                        <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                        <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} />
                        <Area type="monotone" dataKey="bandBase" stackId="band" stroke="none" fill="transparent" legendType="none" tooltipType="none" isAnimationActive={false} />
                        <Area type="monotone" dataKey="bandWidth" stackId="band" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.15} legendType="none" tooltipType="none" isAnimationActive={false} />
                        <Area
                          type="monotone"
                          dataKey="predicted_cashflow"
                          name="Projected Cash Flow"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          fill="url(#gForecast)"
                          activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--primary))", fill: "hsl(var(--background))" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">Forecast visual not available.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* 3. Smart Recommendations Tab - Premium redesign */}
        <TabsContent value="recommendations" className="space-y-6">
          {endpointErrors.recommendations ? (
            <ErrorState message={endpointErrors.recommendations} onRetry={loadData} />
          ) : !recsReady ? (
            <EmptyState
              icon={Lightbulb}
              title="No recommendations yet"
              description={recs?.message || "Add expense transactions so Batua can estimate savings opportunities and suggest next actions."}
            />
          ) : (
            <>
              {/* Premium savings potential header with gradient */}
              <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-background shadow-lg">
                <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <Sparkles className="h-3 w-3" />
                      AI-Optimized Insights
                    </div>
                    <h3 className="text-lg font-display font-semibold">Personalized Savings Optimization</h3>
                    <p className="text-sm text-muted-foreground">Automated audit of monthly categories indicating potential budget savings</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 sm:shrink-0">
                    <div className="group relative min-w-[140px] flex-1 overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 p-4 shadow-md transition-all hover:shadow-lg">
                      <div className="absolute right-0 top-0 h-16 w-16 rounded-full bg-emerald-500/20 blur-2xl" />
                      <div className="relative">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70 dark:text-emerald-400/70">Monthly Potential</div>
                        <div className="kpi-number mt-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          {formatINR(recs?.total_potential_monthly_savings || 0)}
                        </div>
                      </div>
                    </div>
                    <div className="group relative min-w-[140px] flex-1 overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 p-4 shadow-md transition-all hover:shadow-lg">
                      <div className="absolute right-0 top-0 h-16 w-16 rounded-full bg-emerald-500/20 blur-2xl" />
                      <div className="relative">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70 dark:text-emerald-400/70">Annual Potential</div>
                        <div className="kpi-number mt-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          {formatINR(recs?.total_potential_annual_savings || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Premium recommendations cards */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {recs?.recommendations?.length ? (
                  recs.recommendations.map((r, i) => {
                    const badgeVariant = r.priority === "high" ? "destructive" : r.priority === "medium" ? "warning" : "default";
                    const borderColor = r.priority === "high" ? "border-l-rose-500" : r.priority === "medium" ? "border-l-amber-500" : "border-l-primary";
                    return (
                      <Card key={i} className={cn("group flex flex-col justify-between border-l-4 shadow-sm transition-all hover:shadow-lg", borderColor)}>
                        <CardHeader className="pb-3">
                          <div className="mb-2 flex items-center justify-between">
                            <Badge variant={badgeVariant} className="capitalize shadow-sm">
                              {r.priority} Priority
                            </Badge>
                            <div className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              Save ~{formatINR(r.potential_savings)}/mo
                            </div>
                          </div>
                          <CardTitle className="group-hover:text-primary transition-colors">{r.title}</CardTitle>
                          <CardDescription className="pt-1.5 text-sm leading-relaxed">
                            {r.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-end border-t bg-muted/20 pt-3">
                          <Link
                            to="/budgets"
                            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-xs font-medium transition-all hover:gap-2 hover:text-primary")}
                          >
                            Optimize budget <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="col-span-2 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 py-16 text-center shadow-sm">
                    <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                      <Lightbulb className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      All categories audit within safety boundaries!
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">No optimization recommendations triggered at this time.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Floating conversational assistant — only on this page */}
      <QAChatWidget />
    </div>
  );
}
