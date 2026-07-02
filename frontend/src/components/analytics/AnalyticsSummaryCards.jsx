import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Activity,
  Target,
  PieChart,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatDate } from "@/lib/utils-finance";
import AnalyticsStatCard from "./AnalyticsStatCard";

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
      title: "Avg Monthly Spend",
      value: formatINR(data?.avgMonthlySpend || 0, { compact: true }),
      subtitle: "Period average",
      tone: "violet",
      icon: Calendar,
    },
    {
      title: "Highest Expense Day",
      value: data?.highestExpenseDay
        ? formatINR(data.highestExpenseDay.amount)
        : "—",
      subtitle: data?.highestExpenseDay
        ? formatDate(data.highestExpenseDay.date)
        : "No expenses",
      tone: "rose",
      icon: ArrowUp,
    },
    {
      title: "Lowest Expense Day",
      value: data?.lowestExpenseDay
        ? formatINR(data.lowestExpenseDay.amount)
        : "—",
      subtitle: data?.lowestExpenseDay
        ? formatDate(data.lowestExpenseDay.date)
        : "No expenses",
      tone: "emerald",
      icon: ArrowDown,
    },
    {
      title: "Transactions",
      value: data?.totalTransactions ?? 0,
      subtitle: "In period",
      tone: "primary",
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
    {
      title: "Remaining Budget",
      value: formatINR(data?.budgetRemaining || 0, { compact: true }),
      subtitle: "End of period month",
      tone: (data?.budgetRemaining ?? 0) >= 0 ? "emerald" : "rose",
      icon: PieChart,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <AnalyticsStatCard key={card.title} {...card} />
      ))}
    </div>
  );
}
