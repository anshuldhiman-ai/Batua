import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { HeartPulse, Wallet, TrendingUp, PieChart } from "lucide-react";
import { CategoryDonut, ChartTooltip, CHART_AXIS, CHART_GRID } from "@/components/Charts";
import { formatINR } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const PRIMARY = "hsl(var(--primary))";
const DESTRUCTIVE = "hsl(var(--destructive))";

export function FinancialHealthCard({ health, summary, loading }) {
  if (loading) return <Skeleton className="h-full min-h-[220px] rounded-xl" />;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" />
          Financial Health
        </CardTitle>
        <CardDescription>Based on savings & budgets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <span className="kpi-number text-4xl font-bold text-primary">{health?.score ?? 0}</span>
          <div>
            <p className="text-sm font-semibold">{health?.label || "—"}</p>
            <p className="text-xs text-muted-foreground">Health score / 100</p>
          </div>
        </div>
        <Progress value={health?.score ?? 0} className="h-2" />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Savings rate</p>
            <p className="font-semibold tabular-nums">{summary?.savingsRate ?? 0}%</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Over-budget</p>
            <p className="font-semibold tabular-nums">{health?.overBudget ?? 0} cats</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CashFlowSummaryCard({ summary, comparison, loading }) {
  if (loading) return <Skeleton className="h-full min-h-[220px] rounded-xl" />;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Cash Flow Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[
          { label: "Income", value: summary?.totalIncome, color: PRIMARY },
          { label: "Expense", value: summary?.totalExpense, color: DESTRUCTIVE },
          { label: "Net", value: summary?.netSavings, color: PRIMARY },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-semibold tabular-nums" style={{ color: row.color }}>
              {formatINR(row.value || 0, { compact: true })}
            </span>
          </div>
        ))}
        {comparison && (
          <div className="mt-2 rounded-lg border border-border/50 bg-muted/30 p-2.5 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Month-over-month</p>
            <p>Expense {comparison.expenseChange >= 0 ? "↑" : "↓"} {Math.abs(comparison.expenseChange).toFixed(1)}%</p>
            <p>Income {comparison.incomeChange >= 0 ? "↑" : "↓"} {Math.abs(comparison.incomeChange).toFixed(1)}%</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WeekdayPatternChart({ data, loading }) {
  if (loading) return <Skeleton className="h-[260px] rounded-xl" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Weekly Spending Pattern
        </CardTitle>
        <CardDescription>Expense by day of week</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data || []} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="day" stroke={CHART_AXIS} fontSize={11} tickLine={false} tickFormatter={(d) => d.slice(0, 3)} />
            <YAxis stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
            <Bar dataKey="amount" name="Expense" fill={PRIMARY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Category donut — same shared CategoryDonut component as the Dashboard. */
export function CategoryDonutPanel({ data, loading, className }) {
  if (loading) return <Skeleton className={cn("h-[320px] rounded-xl", className)} />;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-primary" />
          By Category
        </CardTitle>
        <CardDescription>Hover a slice for details</CardDescription>
      </CardHeader>
      <CardContent>
        <CategoryDonut data={data || []} height={260} />
      </CardContent>
    </Card>
  );
}

export function BudgetProgressPanel({ rows, loading }) {
  if (loading) return <Skeleton className="h-[280px] rounded-xl" />;
  const top = (rows || []).slice(0, 5);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Budget Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {top.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No budgets configured</p>
        ) : (
          top.map((row) => (
            <div key={row.id || row.category}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium">{row.category}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatINR(row.spent)} / {formatINR(row.limit)}
                </span>
              </div>
              <Progress
                value={Math.min(row.pct || 0, 100)}
                className="h-2"
                indicatorClassName={cn(row.status === "over" && "bg-destructive")}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
