import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { HeartPulse, Wallet, TrendingUp } from "lucide-react";
import { formatINR, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const PRIMARY = "hsl(var(--primary))";
const DESTRUCTIVE = "hsl(var(--destructive))";
const MUTED = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";

function MiniTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{label}</p>
      <p className="tabular-nums">{formatINR(payload[0].value)}</p>
    </div>
  );
}

export function FinancialHealthCard({ health, summary, loading }) {
  if (loading) return <Skeleton className="h-full min-h-[220px] rounded-xl" />;
  return (
    <Card className="rounded-xl border border-border/50 h-full">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="h-4 w-4 text-primary" />
          Financial Health
        </CardTitle>
        <CardDescription className="text-xs">Based on savings & budgets</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
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
    <Card className="rounded-xl border border-border/50 h-full">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />
          Cash Flow Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
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
    <Card className="rounded-xl border border-border/50">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Weekly Spending Pattern
        </CardTitle>
        <CardDescription className="text-xs">Expense by day of week</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data || []} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="day" stroke={MUTED} fontSize={10} tickLine={false} tickFormatter={(d) => d.slice(0, 3)} />
            <YAxis stroke={MUTED} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
            <Tooltip content={<MiniTooltip />} />
            <Bar dataKey="amount" name="Expense" fill={PRIMARY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function CategoryDonutPanel({ data, loading }) {
  if (loading) return <Skeleton className="h-[320px] rounded-xl" />;
  const total = (data || []).reduce((s, c) => s + c.amount, 0);
  const top = (data || []).slice(0, 6);
  return (
    <Card className="rounded-xl border border-border/50">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Top Categories</CardTitle>
        <CardDescription className="text-xs">{formatINR(total)} total spend</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {top.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            No category data
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={top}
                  dataKey="amount"
                  nameKey="category"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {top.map((entry) => (
                    <Cell key={entry.category} fill={categoryColor(entry.category)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatINR(v)} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-2 text-sm">
              {top.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(c.category) }} />
                    {c.category}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {total > 0 ? ((c.amount / total) * 100).toFixed(1) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BudgetProgressPanel({ rows, loading }) {
  if (loading) return <Skeleton className="h-[280px] rounded-xl" />;
  const top = (rows || []).slice(0, 5);
  return (
    <Card className="rounded-xl border border-border/50">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base">Budget Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
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
                className={cn("h-2", row.status === "over" && "[&>div]:bg-destructive")}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
