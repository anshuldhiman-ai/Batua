import React, { useMemo } from "react";
import { BarChart3, RefreshCw, AlertCircle } from "lucide-react";
import AnalyticsFilter from "@/components/analytics/AnalyticsFilter";
import AnalyticsSummaryCards from "@/components/analytics/AnalyticsSummaryCards";
import AnalyticsGraph from "@/components/analytics/AnalyticsGraph";
import TrendAnalysis from "@/components/analytics/TrendAnalysis";
import CategoryBreakdown from "@/components/analytics/CategoryBreakdown";
import RecentTransactionsPanel from "@/components/analytics/RecentTransactionsPanel";
import {
  FinancialHealthCard,
  CashFlowSummaryCard,
  WeekdayPatternChart,
  CategoryDonutPanel,
  BudgetProgressPanel,
} from "@/components/analytics/AnalyticsInsightsPanels";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentYearMonth } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

export default function Analytics() {
  const [view, setView] = React.useState("monthly");
  const [dateRange, setDateRange] = React.useState("last_3_months");
  const [customDates, setCustomDates] = React.useState({ startDate: "", endDate: "" });
  const [singleMonth, setSingleMonth] = React.useState(currentYearMonth());
  const [monthRange, setMonthRange] = React.useState({
    start: currentYearMonth(),
    end: currentYearMonth(),
  });

  const {
    loading,
    error,
    range,
    series,
    categories,
    summary,
    trends,
    health,
    weekdayPattern,
    recentTransactions,
    comparisonSeries,
    budgetRows,
    refetch,
  } = useAnalyticsData({
    view,
    dateRange,
    customStartDate: customDates.startDate,
    customEndDate: customDates.endDate,
    singleMonth,
    rangeStartMonth: monthRange.start,
    rangeEndMonth: monthRange.end,
  });

  const expenseSparkline = useMemo(
    () => series.map((s) => s.expense || 0),
    [series]
  );

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Analytics
            </h1>
            <p className="text-sm text-muted-foreground">
              Deep insights into your financial patterns · {range.label}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={refetch}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <span>{error}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={refetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="rounded-xl border border-border/50">
        <CardContent className="p-4">
          <AnalyticsFilter
            view={view}
            onViewChange={setView}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customStartDate={customDates.startDate}
            customEndDate={customDates.endDate}
            onCustomDateChange={setCustomDates}
            singleMonth={singleMonth}
            onSingleMonthChange={setSingleMonth}
            rangeStartMonth={monthRange.start}
            rangeEndMonth={monthRange.end}
            onMonthRangeChange={({ start, end }) =>
              setMonthRange({ start: start || monthRange.start, end: end || monthRange.end })
            }
            periodLabel={range.label}
          />
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <AnalyticsSummaryCards
        data={summary}
        loading={loading}
        sparklineExpense={expenseSparkline}
      />

      {/* Main chart */}
      <AnalyticsGraph
        data={series}
        view={view}
        loading={loading}
        height={view === "daily" ? 400 : 360}
        periodLabel={range.label}
      />

      {/* Insight panels row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FinancialHealthCard health={health} summary={summary} loading={loading} />
        <CashFlowSummaryCard
          summary={summary}
          comparison={comparisonSeries}
          loading={loading}
        />
        <BudgetProgressPanel rows={budgetRows} loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBreakdown data={categories} loading={loading} />
        <CategoryDonutPanel data={categories} loading={loading} />
      </div>

      <WeekdayPatternChart data={weekdayPattern} loading={loading} />

      <TrendAnalysis data={trends} loading={loading} />

      <RecentTransactionsPanel transactions={recentTransactions} loading={loading} />
    </div>
  );
}
