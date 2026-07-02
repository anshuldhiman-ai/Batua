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
    if (view !== "monthly" || series.length < 2) return null;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    return {
      incomeChange: prev.income > 0 ? ((last.income - prev.income) / prev.income) * 100 : 0,
      expenseChange: prev.expense > 0 ? ((last.expense - prev.expense) / prev.expense) * 100 : 0,
      savingsChange:
        prev.savings !== 0 ? ((last.savings - prev.savings) / Math.abs(prev.savings)) * 100 : 0,
    };
  }, [series, view]);

  return {
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
    timeline,
    refetch: load,
  };
}
