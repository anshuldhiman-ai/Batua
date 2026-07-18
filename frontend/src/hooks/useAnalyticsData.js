import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/utils-finance";
import { resolveDateRange } from "@/lib/analytics-utils";

/**
 * Loads pre-aggregated analytics from the server-side summary API.
 * Extremely efficient for large datasets as it avoids page-by-page client pagination.
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
  
  const [data, setData] = useState({
    series: [],
    monthlySeries: [],
    categories: [],
    summary: {
      totalIncome: 0,
      totalExpense: 0,
      netSavings: 0,
      savingsRate: 0,
      avgDailySpend: 0,
      avgMonthlySpend: 0,
      totalTransactions: 0,
      highestExpenseDay: null,
      lowestExpenseDay: null,
      periodDays: 0,
      periodMonths: 0
    },
    trends: {
      highestSpendingCategory: null,
      lowestSpendingCategory: null,
      fastestGrowingCategory: null,
      avgTransactionAmount: 0,
      largestTransaction: null,
      smallestTransaction: null
    },
    weekdayPattern: [],
    recentTransactions: [],
    comparisonSeries: null
  });
  
  const [budgetRows, setBudgetRows] = useState([]);
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
      const endMonth = range.endDate.slice(0, 7);
      
      const [summaryRes, budgetRes] = await Promise.all([
        api.get("/analytics/summary", {
          params: {
            start: range.startDate,
            end: range.endDate,
            granularity: view
          },
          signal: controller.signal,
        }),
        api.get("/budgets/status", {
          params: { month: endMonth },
          signal: controller.signal,
        })
      ]);

      if (controller.signal.aborted) return;
      
      setData(summaryRes.data);
      setBudgetRows(budgetRes.data?.rows || []);
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
      setError(err?.response?.data?.detail || err?.message || "Failed to load analytics");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [range.startDate, range.endDate, view]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const health = useMemo(() => {
    const summary = data.summary;
    const overBudget = budgetRows.filter((r) => r.status === "over").length;
    const warnBudget = budgetRows.filter((r) => r.status === "warn").length;
    let score = 50;
    
    if (summary.savingsRate >= 20) score += 25;
    else if (summary.savingsRate >= 10) score += 15;
    else if (summary.savingsRate >= 0) score += 5;
    else score -= 20;
    
    if (overBudget === 0 && warnBudget === 0) score += 15;
    else score -= overBudget * 10 + warnBudget * 5;
    
    const totalBudget = budgetRows.reduce((s, r) => s + (r.limit || 0), 0);
    const totalSpent = budgetRows.reduce((s, r) => s + (r.spent || 0), 0);
    const utilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
      
    if (utilization > 0 && utilization <= 80) score += 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    let label = "Needs attention";
    if (score >= 80) label = "Excellent";
    else if (score >= 60) label = "Good";
    else if (score >= 40) label = "Fair";

    return { score, label, overBudget, warnBudget };
  }, [data.summary, budgetRows]);

  return {
    loading,
    error,
    range,
    series: data.series,
    monthlySeries: data.monthlySeries,
    categories: data.categories,
    summary: data.summary,
    trends: data.trends,
    health,
    weekdayPattern: data.weekdayPattern,
    recentTransactions: data.recentTransactions,
    comparisonSeries: data.comparisonSeries,
    budgetRows,
    refetch: load,
  };
}
