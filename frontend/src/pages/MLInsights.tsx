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
// them. The computations are expensive, so we don't refetch on every visit —
// but never serve a stale result forever either.
const ML_CACHE_TTL_MS = 5 * 60 * 1000;

// Shared across every recharts component on this page. Animations are off so
// charts render instantly and never "laggy"-replay on data refresh.
const CHART_DEFAULTS = { isAnimationActive: false };

// Compact chart height so the page reads as a dense dashboard, not a stack of
// posters.
const CHART_HEIGHT = 210;

/**
 * The monthly-spending bar chart is currently disabled — the page reads better
 * without it, and the per-month numbers are already covered by the trend
 * tiles. Flip this to `true` to bring it straight back; the chart code below
 * is kept fully intact (and still type-checked) either way.
 */
const SHOW_MONTHLY_SPEND_CHART = false;

// ── Design tokens ───────────────────────────────────────────────────────────
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

const CLUSTER_TIERS = [
  {
    label: "High volume",
    classes: "border-rose-500/30 bg-rose-500/5",
    chip: "bg-rose-500/10 text-rose-500",
    icon: TrendingUp,
  },
  {
    label: "Moderate volume",
    classes: "border-amber-500/30 bg-amber-500/5",
    chip: "bg-amber-500/10 text-amber-500",
    icon: BarChart3,
  },
  {
    label: "Low volume",
    classes: "border-emerald-500/30 bg-emerald-500/5",
    chip: "bg-emerald-500/10 text-emerald-500",
    icon: TrendingDown,
  },
];

// In-page section anchors, in the order a reader should work through them.
const SECTIONS = [
  { id: "sec-recommendations", label: "Recommendations" },
  { id: "sec-forecast", label: "Forecast" },
  { id: "sec-patterns", label: "Patterns" },
  { id: "sec-alerts", label: "Alerts" },
];

// ── Small building blocks ───────────────────────────────────────────────────

/** Premium section header with icon, title, hint, and optional right action */
function SectionHeading({ icon: Icon, title, hint, id, right }: any) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-sm">
            <Icon className="h-4.5 w-4.5 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h2 id={id} className="scroll-mt-28 font-display text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Premium hero insight with gradient background and sophisticated layout */
function HeroInsight({ eyebrow, headline, detail, icon: Icon, ctaLabel, onCta }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent opacity-50" />
        <CardContent className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 ring-1 ring-primary/20">
                {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
                <span className="text-[10.5px] font-semibold uppercase tracking-widest text-primary">{eyebrow}</span>
              </div>
              <h2 className="mt-3 font-display text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                {headline}
              </h2>
              {detail && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{detail}</p>}
            </div>
            {ctaLabel && (
              <Button
                onClick={onCta}
                size="default"
                className="gap-2 shadow-md"
              >
                {ctaLabel}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
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

/** label → value row used in every summary list so they all align. */
function StatRow({ label, value, className }: any) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/** Premium small stat box with refined styling */
function MiniStat({ label, value, tone = "primary", className }: any) {
  const toneColors = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-500",
    primary: "text-foreground",
    sky: "text-sky-500",
  };
  return (
    <div className={cn("rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-3 shadow-sm", className)}>
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 text-sm font-semibold tabular-nums", toneColors[tone] || toneColors.primary)}>{value}</div>
    </div>
  );
}

function hasMeaningfulData(value) {
  return Boolean(value && !value.empty && Object.keys(value).length > 0);
}

export default function MLInsights() {
  const queryClient = useQueryClient();

  // Data States - initialize from global cache if available
  const [patterns, setPatterns] = useState(globalCache.patterns);
  const [forecast, setForecast] = useState(globalCache.forecast);
  const [recs, setRecs] = useState(globalCache.recs);
  const [anomalies, setAnomalies] = useState(globalCache.anomalies);

  // Loading & Error States
  const [loading, setLoading] = useState(!globalCache.loaded);
  const [error, setError] = useState(null);
  const [endpointErrors, setEndpointErrors] = useState<any>({});

  // Fetch all ML analytics data on mount
  const loadData = useCallback(async (force = false) => {
    // If data is already loaded (and still fresh) and not forcing a refresh,
    // skip loading.
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
      // Only mark loaded when at least one dataset arrived. If every call
      // failed we leave it un-loaded so the next mount retries instead of
      // showing a permanently empty page.
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

  // The module cache lives outside React Query, so a transaction change made
  // elsewhere wouldn't invalidate it — the page would keep showing stale
  // patterns/forecast/recommendations until a manual refresh. Drop the cache
  // whenever the underlying data changes so the next visit recomputes.
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

  // ── Derived view-model ────────────────────────────────────────────────
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

  const jumpTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // The hero always shows the most actionable finding available, in this
  // order: a concrete saving > next-month outlook > something unusual >
  // plain spending summary. This is the "look here first" of the page.
  const hero = useMemo(() => {
    if (recsReady && savingsMonthly > 0) {
      const top = recs?.recommendations?.[0];
      return {
        eyebrow: "Biggest opportunity",
        icon: Lightbulb,
        headline: `You could free up ${formatINR(savingsMonthly)} a month`,
        detail: top
          ? `${top.title} is the biggest lever at about ${formatINR(top.potential_savings)}/mo · ${recommendationCount} suggestion${recommendationCount === 1 ? "" : "s"} in total.`
          : `${recommendationCount} suggestions to review.`,
        ctaLabel: "Review suggestions",
        ctaTarget: "sec-recommendations",
      };
    }
    if (forecastReady && nextForecast) {
      return {
        eyebrow: "Next month outlook",
        icon: Calendar,
        headline: `Projected net of ${formatINR(nextForecast.predicted_cashflow)} in ${nextForecastLabel}`,
        detail: `${confidenceLabel} confidence · likely between ${formatINR(nextForecast.lower)} and ${formatINR(nextForecast.upper)}.`,
        ctaLabel: "See the forecast",
        ctaTarget: "sec-forecast",
      };
    }
    if (anomaliesReady) {
      return {
        eyebrow: "Worth a look",
        icon: ShieldAlert,
        headline: `${anomalyItems.length} unusual item${anomalyItems.length === 1 ? "" : "s"} in your activity`,
        detail: anomalyItems[0]?.description || "",
        ctaLabel: "See alerts",
        ctaTarget: "sec-alerts",
      };
    }
    if (patternsReady) {
      return {
        eyebrow: "Your spending",
        icon: Activity,
        headline: `You average ${formatINR(monthly?.avg_monthly_spending || 0)} a month`,
        detail: `Spending is ${(monthly?.trend || "stable")} across ${monthsOnRecord} month${monthsOnRecord === 1 ? "" : "s"} on record.`,
        ctaLabel: "Explore patterns",
        ctaTarget: "sec-patterns",
      };
    }
    return null;
  }, [
    recsReady,
    savingsMonthly,
    recs,
    recommendationCount,
    forecastReady,
    nextForecast,
    nextForecastLabel,
    confidenceLabel,
    anomaliesReady,
    anomalyItems,
    patternsReady,
    monthly,
    monthsOnRecord,
  ]);

  // ── Loading / error ───────────────────────────────────────────────────
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
      <div className="relative z-10 space-y-6 pb-12">
        <PageHeader
          title="AI Insights"
          subtitle="Your money, explained — what changed, what it means, and what to do next."
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
            title="Nothing to analyse yet"
            description="Add a few transactions or import a statement and Batua will start reading your patterns, forecasting cash flow, and surfacing what to do next."
            action={
              <Link to="/transactions" className={cn(buttonVariants({ size: "default" }), "gap-2")}>
                Add transactions <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
        ) : (
          <>
            {/* 1 — The single most important finding */}
            {hero && <HeroInsight {...hero} onCta={() => jumpTo(hero.ctaTarget)} />}

            {/* 2 — Headline numbers, always the same four */}
            <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KPICard
                label="Avg monthly spend"
                value={monthly?.avg_monthly_spending != null ? formatINR(monthly.avg_monthly_spending, { compact: true }) : "—"}
                note={monthsOnRecord ? `across ${monthsOnRecord} month${monthsOnRecord === 1 ? "" : "s"}` : "no history yet"}
                icon={Coins}
                accent="sky"
              />
              <KPICard
                label="Spending trend"
                value={trendLabel}
                note={patternsReady ? "over the period on record" : "not enough data"}
                icon={Activity}
                accent={monthly?.trend === "increasing" ? "rose" : "emerald"}
              />
              <KPICard
                label="Projected net"
                value={nextForecast ? formatINR(nextForecast.predicted_cashflow, { compact: true }) : "—"}
                note={nextForecast ? nextForecastLabel : "no forecast yet"}
                icon={Calendar}
                accent="primary"
              />
              <KPICard
                label="Savings potential"
                value={savingsMonthly > 0 ? `${formatINR(savingsMonthly, { compact: true })}/mo` : "—"}
                note={recommendationCount ? `${recommendationCount} suggestion${recommendationCount === 1 ? "" : "s"}` : "add spending to see tips"}
                icon={Lightbulb}
                accent="emerald"
              />
            </section>

            {/* 3 — Jump nav: everything is on one page, so give the eye a map */}
            <nav aria-label="Jump to section" className="flex flex-wrap items-center gap-2">
              {SECTIONS.map((s) => (
                <Button
                  key={s.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => jumpTo(s.id)}
                  className="h-8 gap-2 px-3 text-xs font-medium"
                >
                  {s.label}
                  {s.id === "sec-alerts" && anomalyItems.length > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                      {anomalyItems.length}
                    </Badge>
                  )}
                </Button>
              ))}
            </nav>

            {/* ── 4. Recommendations — the "so what" ─────────────────────── */}
            <section aria-labelledby="sec-recommendations" className="scroll-mt-28">
              <SectionHeading
                icon={Lightbulb}
                id="sec-recommendations"
                title="What to do"
                hint={
                  recommendationCount
                    ? `${recommendationCount} suggestion${recommendationCount === 1 ? "" : "s"} · up to ${formatINR(savingsMonthly)}/mo (${formatINR(recs?.total_potential_annual_savings || 0)}/yr)`
                    : "Personalised savings opportunities"
                }
              />

              {endpointErrors.recommendations ? (
                <ErrorState message={endpointErrors.recommendations} onRetry={loadData} />
              ) : !recsReady ? (
                <EmptyState
                  icon={Lightbulb}
                  title="No recommendations yet"
                  description={recs?.message || "Add expense transactions so Batua can estimate savings opportunities and suggest next actions."}
                />
              ) : recommendationCount ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {recs.recommendations.map((r, i) => {
                    const priorityColor = r.priority === "high" ? "text-rose-500" : r.priority === "medium" ? "text-amber-500" : "text-emerald-500";
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card className="group transition-all hover:shadow-md">
                          <CardContent className="p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <span className={cn("text-[10.5px] font-semibold capitalize", priorityColor)}>
                                {r.priority} priority
                              </span>
                              <Badge variant="secondary" className="px-2 py-0.5 text-[10px] font-semibold tabular-nums">
                                Save ~{formatINR(r.potential_savings)}/mo
                              </Badge>
                            </div>
                            <h3 className="text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                              {r.title}
                            </h3>
                            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground line-clamp-2">{r.description}</p>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-5/5 to-card">
                  <CardContent className="py-10 text-center">
                    <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                      <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    </div>
                    <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Nothing needs trimming right now</div>
                    <p className="mt-1 text-xs text-muted-foreground">Your spending looks balanced across categories.</p>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* ── 5. Forecast — the "what's ahead" ───────────────────────── */}
            <section aria-labelledby="sec-forecast" className="scroll-mt-28">
              <SectionHeading icon={TrendingUp} id="sec-forecast" title="What's ahead" hint="Next three months, income and spending modelled separately" />

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
                  <Card className="order-2 lg:order-1 lg:col-span-2 shadow-sm">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Three-month projection
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">~80% range</span>
                      </div>
                      {forecastChartData.length ? (
                        <div role="img" aria-label="Area chart of projected net cash flow with a range band">
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
                        </div>
                      ) : (
                        <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                          Forecast visual not available.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="order-1 lg:order-2 shadow-sm">
                    <CardContent className="p-4">
                      <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 p-3 ring-1 ring-primary/10">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-primary opacity-80">
                          Next month · {nextForecastLabel}
                        </div>
                        <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatINR(nextForecast?.predicted_cashflow || 0, { compact: true })}</div>
                        <Badge
                          variant={forecast?.confidence === "high" ? "success" : forecast?.confidence === "medium" ? "warning" : "default"}
                          className="mt-2 px-2 py-0.5 text-[10.5px] capitalize"
                        >
                          {confidenceLabel} confidence
                        </Badge>
                      </div>

                      <div className="mt-3 divide-y divide-border/50">
                        <StatRow label="3-month total" value={formatINR(forecast?.three_month_total || 0)} />
                        <StatRow label="Method" value={FORECAST_METHOD_LABEL[forecast?.method ?? ""] || "—"} />
                      </div>

                      {forecast?.backtest && (
                        <p className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
                          {forecast.backtest.beats_baseline
                            ? `On the last ${forecast.backtest.folds} months this model was closer (avg error ${formatINR(forecast.backtest.model_mae)}) than the ${forecast.backtest.baseline.toLowerCase()} (${formatINR(forecast.backtest.baseline_mae)}).`
                            : `This model didn't beat the ${forecast.backtest.baseline.toLowerCase()} on the last ${forecast.backtest.folds} months — treat the projection as a rough guide.`}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-3 shadow-sm">
                    <CardContent className="p-4">
                      <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Income vs. spending
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <MiniStat label="Avg. monthly income" value={formatINR(forecast?.average_monthly_income || 0, { compact: true })} tone="emerald" />
                        <MiniStat label="Avg. monthly spending" value={formatINR(forecast?.average_monthly_expense || 0, { compact: true })} tone="rose" />
                        <MiniStat
                          label="Avg. monthly net"
                          value={formatINR(forecast?.average_monthly_net || 0, { compact: true })}
                          tone={(forecast?.average_monthly_net || 0) >= 0 ? "emerald" : "rose"}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </section>

            {/* ── 6. Patterns — the "what's been happening" ──────────────── */}
            <section aria-labelledby="sec-patterns" className="scroll-mt-28">
              <SectionHeading icon={Brain} id="sec-patterns" title="Your patterns" hint="How and when your money moves" />

              {endpointErrors.patterns ? (
                <ErrorState message={endpointErrors.patterns} onRetry={loadData} />
              ) : !patternsReady ? (
                <EmptyState
                  icon={Brain}
                  title="No spending patterns yet"
                  description={patterns?.message || "Add expense transactions or import a statement to unlock trends, clusters and seasonal patterns."}
                />
              ) : (
                <div className="space-y-4">
                  {/* Monthly-spend bar chart — disabled for now (see flag above). */}
                  {SHOW_MONTHLY_SPEND_CHART && (
                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Monthly spending
                        </div>
                        {monthly?.monthly_spending?.length ? (
                          <div role="img" aria-label="Bar chart of monthly spending totals">
                            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                              <BarChart data={monthly.monthly_spending} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} {...CHART_DEFAULTS}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                                <XAxis dataKey="month_str" stroke={CHART_AXIS} fontSize={10} tickLine={false} tickFormatter={formatMonth} />
                                <YAxis stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                                <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.1 }} />
                                <Bar dataKey="sum" name="Total spent" radius={[4, 4, 0, 0]}>
                                  {monthly.monthly_spending.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={index === monthly.monthly_spending.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary)/0.45)"}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                            No historical monthly data found.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                          When you spend
                        </div>
                        {weekendDays ? (
                          <div className="space-y-4">
                            <div className="flex items-baseline justify-between">
                              <span className="text-3xl font-bold tabular-nums text-foreground">{weekendPercent}%</span>
                              <span className="text-xs text-muted-foreground">on weekends</span>
                            </div>
                            <Progress value={weekendPercent} className="h-2" />
                            <div className="grid grid-cols-2 gap-3">
                              <MiniStat label="Weekday" value={formatINR(weekendDays.weekday, { compact: true })} />
                              <MiniStat label="Weekend" value={formatINR(weekendDays.weekend, { compact: true })} />
                            </div>
                            <div className="divide-y divide-border/50 border-t border-border/50 pt-2">
                              <StatRow label="Highest day" value={weekday?.highest_spending_day || "—"} />
                              <StatRow label="Lowest day" value={weekday?.lowest_spending_day || "—"} />
                              {seasonal?.peak_spending_month && (
                                <StatRow
                                  label="Peak month"
                                  value={`${seasonal.peak_spending_month}${
                                    seasonal.peak_spending_amount != null
                                      ? ` · ${formatINR(seasonal.peak_spending_amount, { compact: true })}`
                                      : ""
                                  }`}
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="py-6 text-xs text-muted-foreground">
                            Not enough dated activity to compare weekdays and weekends.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Fixed vs. discretionary
                        </div>
                        {fixedSplit ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                              <MiniStat label="Fixed" value={formatINR(fixedSplit.fixed_monthly || 0, { compact: true })} />
                              <MiniStat label="Flexible" value={formatINR(fixedSplit.discretionary_monthly || 0, { compact: true })} />
                              <MiniStat label="Fixed share" value={`${Math.round((fixedSplit.fixed_share || 0) * 100)}%`} tone="sky" />
                            </div>

                            {hasCommitments ? (
                              <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
                                {commitments?.categories?.map((c) => (
                                  <div key={c.category} className="flex items-center justify-between px-3 py-2.5 text-xs">
                                    <span className="font-medium">{c.category}</span>
                                    <span className="tabular-nums text-muted-foreground">
                                      {formatINR(c.monthly_amount)}/mo · {c.months_present}/{c.months_total}
                                    </span>
                                  </div>
                                ))}
                                {commitments?.subscriptions?.map((s, i) => (
                                  <div key={`${s.payee}-${i}`} className="flex items-center justify-between px-3 py-2.5 text-xs">
                                    <span className="font-medium capitalize">{s.payee}</span>
                                    <span className="tabular-nums text-muted-foreground">
                                      {formatINR(s.monthly_amount)}/mo · {s.months_present} months
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                                No regular bills or subscriptions spotted yet — they'll appear here once a few months of activity build up.
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="py-6 text-xs text-muted-foreground">Fixed-commitment analysis isn't available yet.</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Category volume
                        </div>
                        {clusters?.clusters?.length ? (
                          <div className="space-y-3">
                            {clusters.clusters.map((c, i) => {
                              const tier = CLUSTER_TIERS[i] || CLUSTER_TIERS[CLUSTER_TIERS.length - 1];
                              const TierIcon = tier.icon;
                              return (
                                <div key={i} className={cn("rounded-xl border p-3", tier.classes)}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg", tier.chip)}>
                                        <TierIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                      </span>
                                      <span className="text-xs font-semibold">{tier.label}</span>
                                    </div>
                                    <span className="text-xs font-bold tabular-nums">{formatINR(c.total_spending, { compact: true })}</span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {c.categories.map((cat) => (
                                      <span key={cat} className="rounded-lg border border-border/60 bg-background/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="py-6 text-xs text-muted-foreground">Not enough category diversity to build clusters yet.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {patterns?.category_trends?.top_growing_category && (
                    <p className="px-1 text-xs text-muted-foreground">
                      Fastest growing category is{" "}
                      <span className="font-medium text-rose-500">
                        {patterns.category_trends.top_growing_category}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── 7. Alerts — the "worth a look" ─────────────────────────── */}
            <section aria-labelledby="sec-alerts" className="scroll-mt-28">
              <SectionHeading
                icon={ShieldAlert}
                id="sec-alerts"
                title="Worth a look"
                hint={
                  anomaliesReady
                    ? `${anomalyItems.length} unusual item${anomalyItems.length === 1 ? "" : "s"} — outliers, spikes and new categories`
                    : "Outliers, sudden spikes and new categories"
                }
              />

              {endpointErrors.anomalies ? (
                <ErrorState message={endpointErrors.anomalies} onRetry={loadData} />
              ) : !anomaliesReady ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Nothing unusual detected"
                  description="No outlier transactions, category spikes or new categories in your recent activity. Check back after a few more transactions."
                />
              ) : (
                <div className="space-y-3">
                  {anomalyItems.map((a, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card
                        className={cn(
                          "flex items-start gap-3 p-4 transition-all hover:shadow-md",
                          a.severity === "high" ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                            a.severity === "high"
                              ? "border border-rose-500/30 bg-rose-500/15 text-rose-500"
                              : "border border-amber-500/30 bg-amber-500/15 text-amber-500"
                          )}
                        >
                          <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold">{ANOMALY_TYPE_LABEL[a.type] || "Anomaly"}</span>
                            <Badge variant={a.severity === "high" ? "destructive" : "warning"} className="px-2 py-0.5 text-[10.5px] capitalize">
                              {a.severity}
                            </Badge>
                            <Badge variant="secondary" className="px-2 py-0.5 text-[10.5px]">{a.category}</Badge>
                            {a.date && <span className="text-[10.5px] text-muted-foreground">{formatDate(a.date)}</span>}
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{a.description}</p>
                        </div>
                        <div className="shrink-0 text-right text-xs font-bold tabular-nums">{formatINR(a.amount)}</div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Floating conversational assistant — only on this page */}
      <QAChatWidget />
    </div>
  );
}
