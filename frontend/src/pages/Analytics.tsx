import React, { useMemo } from "react";
import { RefreshCw, AlertCircle, Download, FileSpreadsheet } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import AnalyticsFilter from "@/components/analytics/AnalyticsFilter";
import AnalyticsSummaryCards from "@/components/analytics/AnalyticsSummaryCards";
import AnalyticsGraph from "@/components/analytics/AnalyticsGraph";
import TrendAnalysis from "@/components/analytics/TrendAnalysis";
import CategoryBreakdown from "@/components/analytics/CategoryBreakdown";
import RecentTransactionsPanel from "@/components/analytics/RecentTransactionsPanel";
import MonthlySummaryTable from "@/components/analytics/MonthlySummaryTable";
import PaymentMixCard from "@/components/analytics/PaymentMixCard";
import RecurringExpensesCard from "@/components/analytics/RecurringExpensesCard";
import {
  FinancialHealthCard,
  CashFlowSummaryCard,
  WeekdayPatternChart,
  CategoryDonutPanel,
  BudgetProgressPanel,
} from "@/components/analytics/AnalyticsInsightsPanels";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiUrl, currentYearMonth } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

export default function Analytics() {
  // Filters persist in localStorage so the page reopens exactly where the
  // user left it, instead of resetting to "Last 3 Months" on every visit.
  const [view, setView] = useLocalStorage("batua-analytics-view", "monthly");
  const [dateRange, setDateRange] = useLocalStorage("batua-analytics-period", "last_3_months");
  const [customDates, setCustomDates] = useLocalStorage("batua-analytics-custom-dates", {
    startDate: "",
    endDate: "",
  });
  const [singleMonth, setSingleMonth] = useLocalStorage(
    "batua-analytics-single-month",
    currentYearMonth()
  );
  const [monthRange, setMonthRange] = useLocalStorage("batua-analytics-month-range", {
    start: currentYearMonth(),
    end: currentYearMonth(),
  });
  const [showComparison, setShowComparison] = useLocalStorage("batua-analytics-comparison", false);

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
    monthlySeries,
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

  // Bumps the self-fetching cards (Payment Mix, Recurring) so the page-level
  // Refresh button reaches them too, not just the hook-driven sections.
  const [refreshTick, setRefreshTick] = React.useState(0);
  const handleRefresh = () => {
    setRefreshTick((t) => t + 1);
    refetch();
  };

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Analytics"
        subtitle={`Deep insights into your financial patterns · ${range.label}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowComparison(!showComparison)}
              data-testid="comparison-toggle-btn"
            >
              {showComparison ? "Hide" : "Show"} Comparison
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => window.open(apiUrl("/export/excel"))}
              data-testid="report-export-excel"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.open(apiUrl("/export/csv"))}
              data-testid="report-export-csv"
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

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
      <Card>
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
        comparisonData={showComparison ? comparisonSeries?.data : null}
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

      {/* Category row — donut (proportion) + compact ranked list, same 5/7
          split as the Dashboard's breakdown section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <CategoryDonutPanel data={categories} loading={loading} className="lg:col-span-5" />
        <CategoryBreakdown data={categories} loading={loading} className="lg:col-span-7" />
      </div>

      {/* Patterns row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WeekdayPatternChart data={weekdayPattern} loading={loading} />
        <PaymentMixCard refreshKey={refreshTick} />
      </div>

      {/* Reports row — absorbed from the old Reports page */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonthlySummaryTable series={monthlySeries} loading={loading} periodLabel={range.label} />
        <RecurringExpensesCard refreshKey={refreshTick} />
      </div>

      <TrendAnalysis data={trends} loading={loading} />

      <RecentTransactionsPanel transactions={recentTransactions} loading={loading} />
    </div>
  );
}
