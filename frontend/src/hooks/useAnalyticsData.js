import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/utils-finance";
import {
  aggregateSeries,
  computeCategoryBreakdown,
  computeFinancialHealth,
  computeSummary,
  computeTrendAnalysis,
  computeWeekdayPattern,
  fetchAllTransactions,
  resolveDateRange,
} from "@/lib/analytics-utils";

/**
 * Loads transactions for the resolved period, aggregates client-side, and
 * memoizes derived analytics. No backend API changes required.
 */
export function useAnalyticsData({
  view = "monthly",
  dateRange = "last_3_months",
  customStartDate = "",
  customEndDate = "",
  singleMonth = "",
  rangeStartMonth = "",
  rangeEndMonth = "",
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [budgetRows, setBudgetRows] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const abortRef = useRef(null);

  const range = useMemo(
    () =>
      resolveDateRange(dateRange, {
        customStartDate,
        customEndDate,
        singleMonth,
        rangeStartMonth,
        rangeEndMonth,
      }),
    [dateRange, customStartDate, customEndDate, singleMonth, rangeStartMonth, rangeEndMonth]
  );

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const startMonth = range.startDate.slice(0, 7);
      const endMonth = range.endDate.slice(0, 7);
      const [txns, budgetRes, timelineRes] = await Promise.all([
        fetchAllTransactions({
          startDate: range.startDate,
          endDate: range.endDate,
          signal: controller.signal,
        }),
        api.get("/budgets/status", {
          params: { month: endMonth },
          signal: controller.signal,
        }),
        api.get("/analytics/timeline", {
          params: { start_month: startMonth, end_month: endMonth },
          signal: controller.signal,
        }),
      ]);
      if (controller.signal.aborted) return;
      setTransactions(txns);
      setBudgetRows(budgetRes.data?.rows || []);
      setTimeline(timelineRes.data?.series || []);
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
      setError(err?.response?.data?.detail || err?.message || "Failed to load analytics");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [range.startDate, range.endDate]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const series = useMemo(
    () => aggregateSeries(transactions, view, range.startDate, range.endDate),
    [transactions, view, range.startDate, range.endDate]
  );

  // Month-granular rows built from the SAME day-filtered transactions as the
  // KPI cards — so partial-month presets ("Last 30 days") show partial-month
  // sums that agree with the rest of the page, and zero-activity months
  // still get a row. (The raw /analytics/timeline series is whole-calendar-
  // month buckets and would silently disagree for mid-month ranges.)
  const monthlySeries = useMemo(
    () =>
      view === "monthly"
        ? series
        : aggregateSeries(transactions, "monthly", range.startDate, range.endDate),
    [view, series, transactions, range.startDate, range.endDate]
  );

  const categories = useMemo(() => computeCategoryBreakdown(transactions), [transactions]);

  const summary = useMemo(
    () =>
      computeSummary(transactions, series, budgetRows, range.startDate, range.endDate),
    [transactions, series, budgetRows, range.startDate, range.endDate]
  );

  const trends = useMemo(
    () => computeTrendAnalysis(transactions, timeline),
    [transactions, timeline]
  );

  const health = useMemo(
    () => computeFinancialHealth(summary, budgetRows),
    [summary, budgetRows]
  );

  const weekdayPattern = useMemo(
    () => computeWeekdayPattern(transactions),
    [transactions]
  );

  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 8),
    [transactions]
  );

  const comparisonSeries = useMemo(() => {
    if (!series.length) return null;
    
    // Calculate previous period based on current date range
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    // Previous period dates
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff + 1);
    
    // Filter transactions from previous period
    const prevTransactions = transactions.filter(t => {
      const tDate = new Date(t.date);
      return tDate >= prevStart && tDate <= prevEnd;
    });
    
    // Aggregate previous period data based on current view
    const prevSeries = aggregateSeries(prevTransactions, view, 
      prevStart.toISOString().slice(0, 10), 
      prevEnd.toISOString().slice(0, 10)
    );
    
    // Align previous period data with current period for comparison
    // Map previous period indices to current period indices
    const aligned = prevSeries.map((p, i) => ({
      ...p,
      key: series[i]?.key || p.key,
      date: series[i]?.date || p.date,
      label: series[i]?.label || p.label,
      isComparison: true
    }));
    
    return {
      data: aligned,
      periodLabel: `Previous ${daysDiff} days`,
      incomeChange: series.reduce((sum, s) => sum + (s.income || 0), 0) > 0 
        ? ((series.reduce((sum, s) => sum + (s.income || 0), 0) - aligned.reduce((sum, s) => sum + (s.income || 0), 0)) / series.reduce((sum, s) => sum + (s.income || 0), 0)) * 100 
        : 0,
      expenseChange: series.reduce((sum, s) => sum + (s.expense || 0), 0) > 0 
        ? ((series.reduce((sum, s) => sum + (s.expense || 0), 0) - aligned.reduce((sum, s) => sum + (s.expense || 0), 0)) / series.reduce((sum, s) => sum + (s.expense || 0), 0)) * 100 
        : 0,
    };
  }, [series, transactions, view, range.startDate, range.endDate]);

  return {
    loading,
    error,
    range,
    series,
    monthlySeries,
    categories,
    summary,
    trends,
    health,
    weekdayPattern,
    recentTransactions,
    comparisonSeries,
    budgetRows,
    timeline,
    refetch: load,
  };
}
