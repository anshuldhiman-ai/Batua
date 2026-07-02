import React from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Target,
  Sun,
  CalendarDays,
  Activity,
} from "lucide-react";
import AnalyticsStatCard from "@/components/analytics/AnalyticsStatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatDate } from "@/lib/utils-finance";

/**
 * Premium overview stat grid for the dashboard home page.
 */
export default function DashboardOverview({
  metrics,
  todayExpense = 0,
  budgetRemaining = 0,
  recentCount = 0,
  lastTransaction,
  loading,
  sparklineIncome,
  sparklineExpense,
  onCardClick,
}) {
  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-xl" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Balance",
      value: formatINR(metrics.total_savings, { compact: true }),
      subtitle: "Lifetime net savings",
      tone: metrics.total_savings >= 0 ? "primary" : "rose",
      icon: Wallet,
      onClick: () => onCardClick?.("summary"),
    },
    {
      title: "Total Income",
      value: formatINR(metrics.income, { compact: true }),
      subtitle: "This month",
      tone: "emerald",
      icon: TrendingUp,
      trend: metrics.income_change,
      trendUp: metrics.income_change >= 0,
      sparkline: sparklineIncome,
      onClick: () => onCardClick?.("income"),
    },
    {
      title: "Total Expense",
      value: formatINR(metrics.expense, { compact: true }),
      subtitle: "This month",
      tone: "rose",
      icon: TrendingDown,
      trend: metrics.expense_change,
      trendUp: metrics.expense_change <= 0,
      sparkline: sparklineExpense,
      onClick: () => onCardClick?.("expense"),
    },
    {
      title: "Savings",
      value: formatINR(metrics.net, { compact: true }),
      subtitle: `${metrics.savings_rate}% savings rate`,
      tone: metrics.net >= 0 ? "emerald" : "rose",
      icon: PiggyBank,
      trend: metrics.net_change,
      trendUp: metrics.net_change >= 0,
      onClick: () => onCardClick?.("summary"),
    },
    {
      title: "Budget Remaining",
      value: formatINR(budgetRemaining, { compact: true }),
      subtitle: "Across tracked categories",
      tone: budgetRemaining >= 0 ? "sky" : "rose",
      icon: Target,
    },
    {
      title: "Today's Expense",
      value: formatINR(todayExpense, { compact: true }),
      subtitle: new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      tone: "rose",
      icon: Sun,
    },
    {
      title: "This Month's Expense",
      value: formatINR(metrics.expense, { compact: true }),
      subtitle: metrics.current_month || "Current period",
      tone: "violet",
      icon: CalendarDays,
      onClick: () => onCardClick?.("expense"),
    },
    {
      title: "Recent Activity",
      value: recentCount,
      subtitle: lastTransaction
        ? `Last: ${lastTransaction.description?.slice(0, 24) || formatDate(lastTransaction.date)}`
        : "No recent transactions",
      tone: "primary",
      icon: Activity,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <AnalyticsStatCard key={card.title} {...card} />
      ))}
    </div>
  );
}
