import React, { useState, useEffect, useCallback } from "react";
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

function EmptyState({ icon: Icon = Info, title, description }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed bg-background/40 p-6 text-center">
      <Icon className="mb-3 h-9 w-9 text-muted-foreground" />
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertCircle className="mb-3 h-9 w-9 text-destructive" />
      <div className="text-sm font-semibold">Could not load this insight</div>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{message}</p>
      <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
        Retry
      </Button>
    </div>
  );
}

function hasMeaningfulData(value) {
  return Boolean(value && !value.empty && Object.keys(value).length > 0);
}

const CLUSTER_TIERS = [
  { label: "High spending volume", classes: "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400" },
  { label: "Moderate spending volume", classes: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400" },
  { label: "Low spending volume", classes: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" },
];

export default function MLInsights() {
  const [activeTab, setActiveTab] = useState("patterns");

  // Data States
  const [patterns, setPatterns] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [recs, setRecs] = useState(null);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [endpointErrors, setEndpointErrors] = useState({});

  // Fetch all ML analytics data on mount
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEndpointErrors({});
    try {
      const [patternsRes, forecastRes, recsRes] = await Promise.allSettled([
        api.get("/ml/spending-patterns"),
        api.get("/ml/cash-flow-forecast"),
        api.get("/ml/recommendations"),
      ]);

      const nextErrors = {};
      if (patternsRes.status === "fulfilled") {
        setPatterns(patternsRes.value.data);
      } else {
        setPatterns(null);
        nextErrors.patterns = "Spending pattern analysis is unavailable right now.";
      }
      if (forecastRes.status === "fulfilled") {
        setForecast(forecastRes.value.data);
      } else {
        setForecast(null);
        nextErrors.forecast = "Cash-flow forecasting is unavailable right now.";
      }
      if (recsRes.status === "fulfilled") {
        setRecs(recsRes.value.data);
      } else {
        setRecs(null);
        nextErrors.recommendations = "Smart recommendations are unavailable right now.";
      }
      setEndpointErrors(nextErrors);

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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4 rounded-xl border bg-card p-6 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Analysis Offline</h2>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button onClick={loadData} className="px-5">
          Retry Connection
        </Button>
      </div>
    );
  }

  const { monthly_patterns, weekday_patterns, category_trends, spending_clusters, seasonal_patterns } = patterns || {};
  const patternsReady = hasMeaningfulData(patterns);
  const forecastReady = hasMeaningfulData(forecast);
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
    <div className="page-enter space-y-6">
      <PageHeader
        title="AI Insights"
        subtitle="Pattern analytics, cash-flow forecasting and saving tips — tap the chat bubble to ask questions about your money"
      />

      {/* Tabs list */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:inline-flex lg:w-auto">
          <TabsTrigger value="patterns" className="gap-2">
            <Brain className="h-4 w-4" />
            Patterns
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <Calendar className="h-4 w-4" />
            Cash Flow Forecast
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-2">
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
              {/* Quick metrics — same stat cards as Analytics */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                {/* Monthly Trend Chart */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Monthly Spending Trends</CardTitle>
                    <CardDescription>Visual breakdown of monthly totals and period growth rate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {monthly_patterns?.monthly_spending?.length ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthly_patterns.monthly_spending} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                          <XAxis dataKey="month_str" stroke={CHART_AXIS} fontSize={11} tickLine={false} tickFormatter={formatMonth} />
                          <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                          <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} cursor={{ fill: "hsl(var(--accent))" }} />
                          <Bar dataKey="sum" name="Total Spent" radius={[4, 4, 0, 0]}>
                            {monthly_patterns.monthly_spending.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === monthly_patterns.monthly_spending.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary)/0.65)"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No historical monthly data found.</div>
                    )}
                  </CardContent>
                </Card>

                {/* Weekend vs Weekday + High Day */}
                <Card>
                  <CardHeader>
                    <CardTitle>Weekly Distribution</CardTitle>
                    <CardDescription>How spending is distributed over the week</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium">Weekend vs. Weekday</span>
                        <span className="text-xs text-muted-foreground">
                          {weekday_patterns?.weekend_vs_weekday ? `${weekendPercent}% Weekend` : "N/A"}
                        </span>
                      </div>
                      {weekday_patterns?.weekend_vs_weekday && (
                        <div className="space-y-2">
                          <Progress value={weekendPercent} className="h-2" />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Weekday: {formatINR(weekday_patterns.weekend_vs_weekday.weekday)}</span>
                            <span>Weekend: {formatINR(weekday_patterns.weekend_vs_weekday.weekend)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Highest Spending Day</span>
                        <span className="font-bold text-foreground">{weekday_patterns?.highest_spending_day || "N/A"}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lowest Spending Day</span>
                        <span className="font-semibold text-foreground">{weekday_patterns?.lowest_spending_day || "N/A"}</span>
                      </div>
                    </div>

                    {category_trends?.top_growing_category && (
                      <div className="space-y-2 border-t pt-4">
                        <div className="text-sm font-semibold">Category Trajectory</div>
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                          <span className="text-muted-foreground">Fastest Growing</span>
                          <span className="flex items-center gap-1 font-semibold text-rose-500">
                            <TrendingUp className="h-3 w-3" /> {category_trends.top_growing_category}
                          </span>
                        </div>
                        {category_trends?.fastest_declining_category && (
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span className="text-muted-foreground">Fastest Declining</span>
                            <span className="flex items-center gap-1 font-semibold text-emerald-500">
                              <TrendingDown className="h-3 w-3" /> {category_trends.fastest_declining_category}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Category clusters mapping */}
              <Card>
                <CardHeader>
                  <CardTitle>Category Volume Clusters</CardTitle>
                  <CardDescription>AI grouped spending tiers based on typical monthly category volume</CardDescription>
                </CardHeader>
                <CardContent>
                  {spending_clusters?.clusters?.length ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {spending_clusters.clusters.map((c, i) => {
                        const tier = CLUSTER_TIERS[i] || CLUSTER_TIERS[CLUSTER_TIERS.length - 1];
                        return (
                          <div key={i} className={cn("space-y-2 rounded-xl border p-4", tier.classes)}>
                            <h4 className="text-sm font-semibold">{tier.label}</h4>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {c.categories.map((cat) => (
                                <Badge key={cat} variant="secondary" className="bg-background/80">
                                  {cat}
                                </Badge>
                              ))}
                            </div>
                            <div className="border-t border-current/10 pt-2 text-xs text-muted-foreground">
                              Total Spending in Tier: <strong>{formatINR(c.total_spending)}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-sm text-muted-foreground">Not enough category diversity to generate cluster groups.</div>
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
              {/* Forecast details list */}
              <Card>
                <CardHeader>
                  <CardTitle>Forecast Summary</CardTitle>
                  <CardDescription>Future projection estimates and confidence bounds</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Confidence Level</span>
                      <Badge variant={forecast?.confidence === "high" ? "success" : forecast?.confidence === "medium" ? "warning" : "default"} className="capitalize">
                        {forecast?.confidence || "Medium"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Methodology</span>
                      <span className="text-sm capitalize text-foreground">{forecast?.method?.replace("_", " ") || "Moving Average"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">3-Month Total</span>
                      <span className="text-sm font-semibold tabular-nums">{formatINR(forecast?.three_month_total || 0)}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Expected Cash Flow</h4>
                    {forecast?.forecast?.length ? (
                      <div className="space-y-2">
                        {forecast.forecast.map((f, i) => (
                          <div key={i} className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                            <span className="text-sm font-medium">{formatMonth(f.month)}</span>
                            <span className="text-sm font-bold tabular-nums">{formatINR(f.predicted_cashflow)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No forecast intervals generated.</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Forecast Visual Chart — same area style as the rest of the app */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>3-Month Forecast Projection</CardTitle>
                  <CardDescription>Estimated future net flow calculated from historical trend lines</CardDescription>
                </CardHeader>
                <CardContent>
                  {forecast?.forecast?.length ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={forecast.forecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gForecast" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                        <XAxis dataKey="month" stroke={CHART_AXIS} fontSize={11} tickLine={false} tickFormatter={formatMonth} />
                        <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                        <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} />
                        <Area
                          type="monotone"
                          dataKey="predicted_cashflow"
                          name="Projected Cash Flow"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          fill="url(#gForecast)"
                          activeDot={{ r: 6 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Forecast visual not available.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* 3. Smart Recommendations Tab */}
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
              {/* Savings potential header */}
              <Card>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="font-display text-sm font-semibold">Personalized Savings Optimization</h3>
                    <p className="text-sm text-muted-foreground">Automated audit of monthly categories indicating potential budget savings</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                    <div className="min-w-[120px] flex-1 rounded-xl border bg-muted/30 p-3 text-center">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Monthly Potential</div>
                      <div className="kpi-number mt-1 text-xl text-emerald-600 dark:text-emerald-400">
                        {formatINR(recs?.total_potential_monthly_savings || 0)}
                      </div>
                    </div>
                    <div className="min-w-[120px] flex-1 rounded-xl border bg-muted/30 p-3 text-center">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Annual Potential</div>
                      <div className="kpi-number mt-1 text-xl text-emerald-600 dark:text-emerald-400">
                        {formatINR(recs?.total_potential_annual_savings || 0)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actionable recommendations list */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {recs?.recommendations?.length ? (
                  recs.recommendations.map((r, i) => {
                    const badgeColor = r.priority === "high" ? "destructive" : r.priority === "medium" ? "warning" : "default";
                    return (
                      <Card key={i} className="flex flex-col justify-between border-l-4 border-l-primary">
                        <CardHeader className="pb-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <Badge variant={badgeColor} className="capitalize">
                              {r.priority} Priority
                            </Badge>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              Save ~{formatINR(r.potential_savings)}/mo
                            </span>
                          </div>
                          <CardTitle>{r.title}</CardTitle>
                          <CardDescription className="pt-1 text-sm">
                            {r.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-end">
                          <Link
                            to="/budgets"
                            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs hover:text-primary")}
                          >
                            Optimize budget <ChevronRight className="h-3 w-3" />
                          </Link>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="col-span-2 py-12 text-center text-sm text-muted-foreground">
                    All categories audit within safety boundaries. No recommendations triggered!
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
