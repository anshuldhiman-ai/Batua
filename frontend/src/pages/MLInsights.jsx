import React, { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Calendar,
  Sparkles,
  Lightbulb,
  HelpCircle,
  Send,
  Mic,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  Info,
  Coins,
  Activity,
  Check,
  MessageSquare
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
  Cell
} from "recharts";
import { toast } from "sonner";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api, formatINR, formatMonth, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

// Custom Tooltip component for Recharts
function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card/90 backdrop-blur-sm p-3 text-xs shadow-lg">
      <div className="mb-1 font-semibold">
        {labelFormatter ? labelFormatter(label) : label}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 my-0.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color || p.payload?.fill || "#3b82f6" }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon = Info, title, description }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed bg-background/40 p-6 text-center">
      <Icon className="mb-3 h-9 w-9 text-muted-foreground/60" />
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

export default function MLInsights() {
  const [activeTab, setActiveTab] = useState("patterns");
  
  // Data States
  const [patterns, setPatterns] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [recs, setRecs] = useState(null);
  const [qaSuggestions, setQaSuggestions] = useState([]);
  
  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [endpointErrors, setEndpointErrors] = useState({});

  // QA Tab States
  const [qaHistory, setQaHistory] = useState([]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaRecording, setQaRecording] = useState(false);
  const [qaSupported, setQaSupported] = useState(true);
  const [qaInterim, setQaInterim] = useState("");
  const qaRecognitionRef = React.useRef(null);

  // Fetch all ML analytics data on mount
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEndpointErrors({});
    try {
      const [patternsRes, forecastRes, recsRes, suggestionsRes] = await Promise.allSettled([
        api.get("/ml/spending-patterns"),
        api.get("/ml/cash-flow-forecast"),
        api.get("/ml/recommendations"),
        api.get("/ml/qa/suggestions")
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
      if (suggestionsRes.status === "fulfilled") {
        setQaSuggestions(suggestionsRes.value.data?.suggestions || []);
      } else {
        setQaSuggestions([]);
        nextErrors.qa = "Question suggestions could not be loaded, but you can still ask a question.";
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
    
    // Check speech support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setQaSupported(false);
    }

    return () => {
      qaRecognitionRef.current?.abort?.();
      qaRecognitionRef.current = null;
    };
  }, [loadData]);

  // QA Voice Input Recognition Toggle
  const toggleQaRecording = () => {
    if (!qaSupported) {
      toast.error(
        "Speech recognition not supported here. Use Chrome/Edge on https:// or localhost."
      );
      return;
    }

    if (qaRecording) {
      qaRecognitionRef.current?.stop?.();
      setQaRecording(false);
      setQaInterim("");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    qaRecognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setQaRecording(true);
      setQaInterim("");
      toast.info("Listening… ask your question", { duration: 2000 });
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (interimText) setQaInterim(interimText);
      if (finalText) {
        const transcript = finalText.trim();
        setQaInterim("");
        setQaInput(transcript);
        toast.success(`Heard: "${transcript}"`, { duration: 1800 });
        handleQaSubmit(transcript);
      }
    };

    recognition.onerror = (e) => {
      const code = e.error || "unknown";
      const messages = {
        "not-allowed": "Microphone permission denied. Allow it in your browser settings.",
        "service-not-allowed": "Speech service blocked. Try Chrome/Edge on https:// or localhost.",
        "no-speech": "Didn't catch anything — try again a little louder.",
        "audio-capture": "No microphone found.",
        "network": "Network error reaching the speech service. Check your connection.",
        "aborted": "",
      };
      const msg = messages[code] || `Voice input error (${code})`;
      if (msg) toast.error(msg, { duration: 3500 });
      setQaRecording(false);
      setQaInterim("");
    };

    recognition.onend = () => {
      setQaRecording(false);
      setQaInterim("");
      qaRecognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
      toast.error("Could not start voice input. Please try again.");
      setQaRecording(false);
      setQaInterim("");
      qaRecognitionRef.current = null;
    }
  };

  // Submit NL QA question
  const handleQaSubmit = async (questionText = qaInput) => {
    const textToSubmit = questionText?.trim();
    if (!textToSubmit) return;

    setQaLoading(true);
    const userMsg = { role: "user", content: textToSubmit };
    setQaHistory((prev) => [...prev, userMsg]);
    setQaInput("");

    try {
      const { data } = await api.post("/ml/qa", { question: textToSubmit });
      const systemMsg = { 
        role: "system", 
        content: data.answer || "No response received", 
        type: data.type,
        details: data
      };
      setQaHistory((prev) => [...prev, systemMsg]);
    } catch {
      setQaHistory((prev) => [
        ...prev,
        { role: "system", content: "Sorry, I could not answer that. Please try again.", type: "error" }
      ]);
    } finally {
      setQaLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center p-6 border rounded-xl bg-card/40 backdrop-blur-sm space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive animate-bounce" />
        <h2 className="text-xl font-bold">Analysis Offline</h2>
        <p className="text-sm text-muted-foreground max-w-md">{error}</p>
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

  return (
    <div className="space-y-6">
      {/* Header section with gradient */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-transparent p-6 sm:p-8">
        <div className="absolute right-6 top-6 text-primary/10">
          <Brain className="h-24 w-24" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Personal Finance
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">AI Insights &amp; Forecasting</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Get automated pattern analytics, cash flow forecasting, saving tips, and immediate conversational answers about your transactions.
          </p>
        </div>
      </div>

      {/* Tabs list */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:inline-flex lg:w-auto">
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
          <TabsTrigger value="qa" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            Natural Q&amp;A
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
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-card/40 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Avg Spend</span>
                  <Coins className="h-4 w-4 text-blue-500" />
                </div>
                <div className="mt-2 text-2xl font-bold">{formatINR(monthly_patterns?.avg_monthly_spending)}</div>
                <p className="mt-1 text-xs text-muted-foreground">Based on historical activity</p>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spending Trend</span>
                  <Activity className="h-4 w-4 text-purple-500" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="text-2xl font-bold capitalize">{monthly_patterns?.trend || "Stable"}</div>
                  <Badge variant={monthly_patterns?.trend === "increasing" ? "destructive" : "success"}>
                    {monthly_patterns?.trend === "increasing" ? <TrendingUp className="h-3.5 w-3.5 mr-0.5" /> : <TrendingDown className="h-3.5 w-3.5 mr-0.5" />}
                    {monthly_patterns?.trend === "increasing" ? "Up" : "Down"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Overall trajectory of spending</p>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Peak Spend Month</span>
                  <TrendingUp className="h-4 w-4 text-rose-500" />
                </div>
                <div className="mt-2 text-2xl font-bold">{seasonal_patterns?.peak_spending_month || "N/A"}</div>
                <p className="mt-1 text-xs text-muted-foreground">Highest seasonal spending month</p>
              </CardContent>
            </Card>

            <Card className="bg-card/40 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lowest Spend Month</span>
                  <TrendingDown className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 text-2xl font-bold">{seasonal_patterns?.lowest_spending_month || "N/A"}</div>
                <p className="mt-1 text-xs text-muted-foreground">Lowest seasonal spending month</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Monthly Trend Chart */}
            <Card className="lg:col-span-2 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Monthly Spending Trends</CardTitle>
                <CardDescription>Visual breakdown of monthly totals and period growth rate</CardDescription>
              </CardHeader>
              <CardContent>
                {monthly_patterns?.monthly_spending?.length ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthly_patterns.monthly_spending} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="month_str" tickLine={false} tickFormatter={formatMonth} className="text-[10px] text-muted-foreground" />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} className="text-[10px] text-muted-foreground" />
                        <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} />
                        <Bar dataKey="sum" name="Total Spent" radius={[4, 4, 0, 0]}>
                          {monthly_patterns.monthly_spending.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === monthly_patterns.monthly_spending.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary)/0.65)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No historical monthly data found.</div>
                )}
              </CardContent>
            </Card>

            {/* Weekend vs Weekday + High Day */}
            <Card className="bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Weekly Distribution</CardTitle>
                <CardDescription>How spending is distributed over the week</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">Weekend vs. Weekday</span>
                    <span className="text-xs text-muted-foreground">
                      {weekday_patterns?.weekend_vs_weekday ? (
                        `${weekendPercent}% Weekend`
                      ) : "N/A"}
                    </span>
                  </div>
                  {weekday_patterns?.weekend_vs_weekday && (
                    <div className="space-y-2">
                      <Progress 
                        value={weekendPercent} 
                        className="h-2"
                      />
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
                  <div className="border-t pt-4 space-y-2">
                    <div className="text-sm font-semibold">Category Trajectory</div>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-muted-foreground">Fastest Growing</span>
                      <span className="font-semibold text-red-500 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> {category_trends.top_growing_category}
                      </span>
                    </div>
                    {category_trends?.fastest_declining_category && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Fastest Declining</span>
                        <span className="font-semibold text-emerald-500 flex items-center gap-1">
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
          <Card className="bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Category Volume Clusters</CardTitle>
              <CardDescription>AI grouped spending tiers based on typical monthly category volume</CardDescription>
            </CardHeader>
            <CardContent>
              {spending_clusters?.clusters?.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {spending_clusters.clusters.map((c, i) => {
                    const label = i === 0 ? "Tier 1: High Spending Volume" : i === 1 ? "Tier 2: Moderate Spending Volume" : "Tier 3: Low Spending Volume";
                    const border = i === 0 ? "border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400" : i === 1 ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
                    return (
                      <div key={i} className={cn("p-4 border rounded-xl space-y-2", border)}>
                        <h4 className="text-sm font-semibold">{label}</h4>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {c.categories.map((cat) => (
                            <Badge key={cat} variant="secondary" className="bg-background/80 hover:bg-background/100">
                              {cat}
                            </Badge>
                          ))}
                        </div>
                        <div className="pt-2 text-xs text-muted-foreground border-t border-current/10">
                          Total Spending in Tier: <strong>{formatINR(c.total_spending)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-6">Not enough category diversity to generate cluster groups.</div>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Forecast details list */}
            <Card className="bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold font-display">Forecast Summary</CardTitle>
                <CardDescription>Future projection estimates and confidence bounds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 border rounded-xl space-y-3 bg-background/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Confidence Level</span>
                    <Badge variant={forecast?.confidence === "high" ? "success" : forecast?.confidence === "medium" ? "warning" : "default"}>
                      {forecast?.confidence || "Medium"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Methodology</span>
                    <span className="text-sm font-mono text-foreground capitalize">{forecast?.method?.replace("_", " ") || "Moving Average"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">3-Month Total</span>
                    <span className="text-sm font-semibold tabular-nums">{formatINR(forecast?.three_month_total || 0)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Expected Cash Flow</h4>
                  {forecast?.forecast?.length ? (
                    <div className="space-y-3">
                      {forecast.forecast.map((f, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-background/25">
                          <span className="font-medium text-sm">{formatMonth(f.month)}</span>
                          <span className="font-bold text-sm tabular-nums">{formatINR(f.predicted_cashflow)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No forecast intervals generated.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Forecast Visual Chart */}
            <Card className="lg:col-span-2 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">3-Month Forecast Projection</CardTitle>
                <CardDescription>Estimated future net flow calculated from historical trend lines</CardDescription>
              </CardHeader>
              <CardContent>
                {forecast?.forecast?.length ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={forecast.forecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="month" tickLine={false} tickFormatter={formatMonth} className="text-[10px] text-muted-foreground" />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} className="text-[10px] text-muted-foreground" />
                        <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} />
                        <Line type="monotone" dataKey="predicted_cashflow" name="Projected Cash Flow" stroke="hsl(var(--primary))" strokeWidth={3} activeDot={{ r: 8 }} />
                        <Area type="monotone" dataKey="predicted_cashflow" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.1} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Forecast visual not available.</div>
                )}
                {forecast?.forecast?.length && (
                  <div className="mt-4 p-3 bg-background/50 rounded-lg border">
                    <div className="text-xs text-muted-foreground mb-2">Forecast Summary</div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Next Month</div>
                        <div className="font-semibold">{formatINR(forecast.forecast[0]?.predicted_cashflow || 0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">3-Month Average</div>
                        <div className="font-semibold">{formatINR((forecast.forecast.reduce((sum, f) => sum + (f.predicted_cashflow || 0), 0)) / forecast.forecast.length)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Trend</div>
                        <div className="font-semibold flex items-center gap-1">
                          {forecast.forecast.length > 1 && forecast.forecast[forecast.forecast.length - 1].predicted_cashflow > forecast.forecast[0].predicted_cashflow ? (
                            <><TrendingUp className="h-3 w-3 text-emerald-500" /> Increasing</>
                          ) : forecast.forecast.length > 1 && forecast.forecast[forecast.forecast.length - 1].predicted_cashflow < forecast.forecast[0].predicted_cashflow ? (
                            <><TrendingDown className="h-3 w-3 text-rose-500" /> Decreasing</>
                          ) : (
                            "Stable"
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
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
          <div className="p-6 border rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold">Personalized Savings Optimization</h3>
              <p className="text-sm text-muted-foreground">Automated audit of monthly categories indicating potential budget savings</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="p-3 border rounded-xl bg-background/80 text-center min-w-[120px]">
                <div className="text-xs text-muted-foreground font-medium uppercase">Monthly Potential</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatINR(recs?.total_potential_monthly_savings || 0)}
                </div>
              </div>
              <div className="p-3 border rounded-xl bg-background/80 text-center min-w-[120px]">
                <div className="text-xs text-muted-foreground font-medium uppercase">Annual Potential</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatINR(recs?.total_potential_annual_savings || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Actionable recommendations list */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {recs?.recommendations?.length ? (
              recs.recommendations.map((r, i) => {
                const badgeColor = r.priority === "high" ? "destructive" : r.priority === "medium" ? "warning" : "default";
                return (
                  <Card key={i} className="bg-card/40 backdrop-blur-sm border-l-4 border-l-primary flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge variant={badgeColor} className="capitalize">
                          {r.priority} Priority
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                          Save ~{formatINR(r.potential_savings)}/mo
                        </span>
                      </div>
                      <CardTitle className="text-base">{r.title}</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground pt-1">
                        {r.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 flex justify-end">
                      <Button variant="ghost" size="sm" className="gap-1 text-xs hover:text-primary">
                        Optimize budget <ChevronRight className="h-3 w-3" />
                      </Button>
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

        {/* 4. Natural Language Q&A Tab */}
        <TabsContent value="qa" className="space-y-6">
          <Card className="bg-card/40 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Conversational Finance Assistant</CardTitle>
              <CardDescription>Ask questions about your transactions using natural text (e.g. "What is my biggest expense?", "How much did I spend on Swiggy?")</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Chat panel */}
              <div className="h-[300px] overflow-y-auto border rounded-xl p-4 bg-background/50 space-y-4 no-scrollbar">
                {qaHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-2">
                    <MessageSquare className="h-10 w-10 text-muted-foreground/50 animate-pulse" />
                    <span className="text-xs text-muted-foreground max-w-xs">Ask a question below or pick a preloaded suggested query to start!</span>
                  </div>
                ) : (
                  qaHistory.map((msg, index) => {
                    const isUser = msg.role === "user";
                    return (
                      <div key={index} className={cn("flex w-full flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
                        <div className={cn("max-w-[85%] rounded-xl px-4 py-2 text-sm shadow-sm", isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                          {msg.content}
                          
                          {/* Render rich visual breakdown inside system answers */}
                          {!isUser && msg.details && (
                            <div className="mt-3 border-t border-foreground/10 pt-2 space-y-2">
                              {msg.type === "category_spending" && (
                                <div className="text-xs space-y-1">
                                  <div>Category: <strong>{msg.details.category}</strong></div>
                                  <div>Total Amount: <strong>{formatINR(msg.details.value)}</strong></div>
                                </div>
                              )}
                              
                              {msg.type === "keyword_search" && msg.details.transactions?.length > 0 && (
                                <div className="text-[11px] space-y-1.5">
                                  <div className="font-semibold mb-1">Recent Matching Transactions:</div>
                                  <div className="space-y-1">
                                    {msg.details.transactions.map((t, idx) => (
                                      <div key={idx} className="flex justify-between items-center gap-4 bg-background/40 p-1 rounded">
                                        <span className="truncate">{t.description} ({t.date})</span>
                                        <span className="font-semibold shrink-0">{formatINR(t.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {msg.type === "savings_rate" && (
                                <div className="w-full space-y-1">
                                  <Progress value={Math.max(0, Math.min(100, msg.details.value))} className="h-1.5 bg-foreground/10" />
                                  <div className="text-[10px] text-right font-medium">Savings Rate: {msg.details.value.toFixed(1)}%</div>
                                </div>
                              )}
                              
                              {msg.type === "monthly_summary" && msg.details.data && (
                                <div className="text-xs grid grid-cols-3 gap-2 text-center bg-background/40 p-1.5 rounded-lg mt-1">
                                  <div>
                                    <div className="text-[9px] uppercase text-muted-foreground font-semibold">Income</div>
                                    <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatINR(msg.details.data.income)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase text-muted-foreground font-semibold">Expense</div>
                                    <div className="font-bold text-red-600 dark:text-red-400 mt-0.5">{formatINR(msg.details.data.expense)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase text-muted-foreground font-semibold">Net</div>
                                    <div className="font-bold mt-0.5">{formatINR(msg.details.data.net)}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                {qaLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs pl-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
                  </div>
                )}
              </div>

              {/* Input section with microphone */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder={qaRecording ? "Listening…" : "Ask about your budget, category spending, savings rate..."}
                    value={qaRecording && qaInterim ? qaInterim : qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQaSubmit()}
                    disabled={qaLoading}
                    className={cn(
                      "pr-10 h-11",
                      qaRecording && qaInterim && "border-red-500/50 ring-1 ring-red-500/30"
                    )}
                  />
                  {qaSupported && (
                    <button
                      type="button"
                      onClick={toggleQaRecording}
                      disabled={qaLoading}
                      aria-pressed={qaRecording}
                      aria-label={qaRecording ? "Stop voice input" : "Start voice input"}
                      className={cn(
                        "absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center transition-all",
                        qaRecording
                          ? "bg-red-500 text-white animate-pulse shadow-md shadow-red-500/40"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      title={qaRecording ? "Tap to stop" : "Tap to ask with voice"}
                    >
                      <Mic className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button onClick={() => handleQaSubmit()} disabled={qaLoading || !qaInput.trim()} className="h-11 shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {!qaSupported && (
                <p className="text-[11px] text-muted-foreground">
                  Voice questions need Chrome or Edge. You can still type below.
                </p>
              )}

              {/* QA Suggested Questions Chips */}
              {qaSuggestions.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Suggested Questions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {qaSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleQaSubmit(s)}
                        disabled={qaLoading}
                        className="text-xs border rounded-full px-3 py-1 bg-background hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all duration-200"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
