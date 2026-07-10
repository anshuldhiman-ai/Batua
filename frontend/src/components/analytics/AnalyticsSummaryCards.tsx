import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Activity,
  Target,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/utils-finance";
import AnalyticsStatCard from "./AnalyticsStatCard";

/**
 * Six core KPIs for the selected period. Category- and transaction-level
 * extremes live in TrendAnalysis — kept out of here to avoid duplication.
 */
export default function AnalyticsSummaryCards({ data, loading = false, sparklineExpense = [] }) {
  const cards = [
    {
      title: "Total Income",
      value: formatINR(data?.totalIncome || 0, { compact: true }),
      subtitle: "Selected period",
      tone: "emerald",
      icon: TrendingUp,
    },
    {
      title: "Total Expense",
      value: formatINR(data?.totalExpense || 0, { compact: true }),
      subtitle: "Selected period",
      tone: "rose",
      icon: TrendingDown,
      sparkline: sparklineExpense,
    },
    {
      title: "Net Savings",
      value: formatINR(data?.netSavings || 0, { compact: true }),
      subtitle: `${data?.savingsRate ?? 0}% of income`,
      tone: (data?.netSavings ?? 0) >= 0 ? "primary" : "rose",
      icon: Wallet,
    },
    {
      title: "Avg Daily Spend",
      value: formatINR(data?.avgDailySpend || 0),
      subtitle: `${data?.periodDays || 0} days`,
      tone: "sky",
      icon: Calendar,
    },
    {
      title: "Transactions",
      value: data?.totalTransactions ?? 0,
      subtitle: "In period",
      tone: "violet",
      icon: Activity,
    },
    {
      title: "Budget Utilization",
      value: `${data?.budgetUtilization ?? 0}%`,
      subtitle: "Tracked categories",
      tone:
        (data?.budgetUtilization ?? 0) > 80
          ? "rose"
          : (data?.budgetUtilization ?? 0) > 50
            ? "amber"
            : "emerald",
      icon: Target,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <AnalyticsStatCard key={card.title} {...card} />
      ))}
    </div>
  );
}
