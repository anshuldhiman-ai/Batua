import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatDate, formatMonth } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const INCOME_COLOR = "hsl(var(--chart-income))";
const EXPENSE_COLOR = "hsl(var(--chart-expense))";
const GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";

function formatAxisLabel(key, view) {
  if (!key) return "";
  if (view === "daily") return formatDate(key);
  if (view === "weekly") return key.replace("-W", " W");
  if (view === "monthly") return formatMonth(key.length === 7 ? key : key.slice(0, 7));
  if (view === "yearly") return key;
  return key;
}

function RichTooltip({ active, payload, label, view }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-border bg-card/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur-sm">
      <p className="mb-1.5 font-semibold">{formatAxisLabel(label, view)}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-4">
          <span className="text-muted-foreground">Income</span>
          <span className="font-medium tabular-nums" style={{ color: INCOME_COLOR }}>
            {formatINR(row.income || 0)}
          </span>
        </p>
        <p className="flex justify-between gap-4">
          <span className="text-muted-foreground">Expense</span>
          <span className="font-medium tabular-nums" style={{ color: EXPENSE_COLOR }}>
            {formatINR(row.expense || 0)}
          </span>
        </p>
        <p className="flex justify-between gap-4">
          <span className="text-muted-foreground">Savings</span>
          <span className="font-medium tabular-nums">{formatINR(row.savings ?? row.net ?? 0)}</span>
        </p>
        <p className="flex justify-between gap-4 border-t border-border/60 pt-1">
          <span className="text-muted-foreground">Transactions</span>
          <span className="font-medium tabular-nums">{row.transactions || 0}</span>
        </p>
      </div>
    </div>
  );
}

const VIEW_TITLES = {
  daily: "Daily Cash Flow",
  weekly: "Weekly Cash Flow",
  monthly: "Monthly Cash Flow",
  yearly: "Yearly Cash Flow",
};

/**
 * Interactive income vs expense chart — theme-aware Recharts area chart.
 */
export default function AnalyticsGraph({
  data,
  comparisonData = null,
  view = "monthly",
  loading = false,
  height = 360,
  periodLabel,
  className,
}) {
  const chartData = useMemo(
    () =>
      (data || []).map((d) => ({
        ...d,
        label: d.key || d.date,
      })),
    [data]
  );

  const comparisonChartData = useMemo(
    () =>
      (comparisonData || []).map((d) => ({
        ...d,
        label: d.key || d.date,
      })),
    [comparisonData]
  );

  if (loading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="rounded-xl" style={{ height }} />
        </CardContent>
      </Card>
    );
  }

  if (!chartData.length) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>{VIEW_TITLES[view]}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground"
            style={{ height }}
          >
            No data for the selected period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle>{VIEW_TITLES[view]}</CardTitle>
        {periodLabel && (
          <CardDescription>{periodLabel}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="analyticsIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.35} />
                <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="analyticsExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.3} />
                <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
              </linearGradient>
              {/* Soft glow so the strokes read as lit lines — same treatment
                  as the Dashboard TimelineChart, so the hero charts match. */}
              <filter id="analyticsLineGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tickFormatter={(v) => formatAxisLabel(v, view)}
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={view === "daily" ? 40 : 24}
            />
            <YAxis
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatINR(v, { compact: true })}
            />
            <Tooltip content={<RichTooltip view={view} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {comparisonChartData && comparisonChartData.length > 0 && (
              <>
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Previous Income"
                  stroke={INCOME_COLOR}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="none"
                  opacity={0.5}
                  data={comparisonChartData}
                  animationDuration={500}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="Previous Expense"
                  stroke={EXPENSE_COLOR}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="none"
                  opacity={0.5}
                  data={comparisonChartData}
                  animationDuration={500}
                />
              </>
            )}
            <Area
              type="monotone"
              dataKey="income"
              name="Income"
              stroke={INCOME_COLOR}
              strokeWidth={2.5}
              fill="url(#analyticsIncome)"
              style={{ filter: "url(#analyticsLineGlow)" }}
              animationDuration={500}
            />
            <Area
              type="monotone"
              dataKey="expense"
              name="Expense"
              stroke={EXPENSE_COLOR}
              strokeWidth={2.5}
              fill="url(#analyticsExpense)"
              style={{ filter: "url(#analyticsLineGlow)" }}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
