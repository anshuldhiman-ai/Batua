import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { formatINR } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  rose: "text-rose-500",
  primary: "text-foreground",
  amber: "text-amber-500",
};

const TONE_BG_CLASS = {
  emerald: "bg-emerald-500/10 text-emerald-500",
  rose: "bg-rose-500/10 text-rose-500",
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-500/10 text-amber-500",
};

/**
 * Category- and transaction-level extremes for the selected period.
 * Period averages live in AnalyticsSummaryCards — not repeated here.
 */
export default function TrendAnalysis({ data, loading = false, className }) {
  const insights = [
    {
      label: "Highest Spending Category",
      value: data?.highestSpendingCategory?.category || "N/A",
      subvalue: data?.highestSpendingCategory?.amount ? formatINR(data.highestSpendingCategory.amount) : null,
      icon: TrendingUp,
      tone: "rose",
    },
    {
      label: "Lowest Spending Category",
      value: data?.lowestSpendingCategory?.category || "N/A",
      subvalue: data?.lowestSpendingCategory?.amount ? formatINR(data.lowestSpendingCategory.amount) : null,
      icon: TrendingDown,
      tone: "emerald",
    },
    {
      label: "Fastest Growing Category",
      value: data?.fastestGrowingCategory?.category || "N/A",
      subvalue: data?.fastestGrowingCategory?.growth ? `+${data.fastestGrowingCategory.growth}%` : null,
      icon: ArrowUpRight,
      tone: "amber",
    },
    {
      label: "Average Transaction",
      value: data?.avgTransactionAmount ? formatINR(data.avgTransactionAmount) : "N/A",
      subvalue: "per transaction",
      icon: Minus,
      tone: "primary",
    },
    {
      label: "Largest Transaction",
      value: data?.largestTransaction?.amount ? formatINR(data.largestTransaction.amount) : "N/A",
      subvalue: data?.largestTransaction?.category || null,
      icon: ArrowUpRight,
      tone: "rose",
    },
    {
      label: "Smallest Transaction",
      value: data?.smallestTransaction?.amount ? formatINR(data.smallestTransaction.amount) : "N/A",
      subvalue: data?.smallestTransaction?.category || null,
      icon: ArrowDownRight,
      tone: "emerald",
    },
  ];

  if (loading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[60px] rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Trend Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight, index) => {
            const Icon = insight.icon;
            return (
              <div
                key={index}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-3 transition-colors hover:bg-muted/40"
              >
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  TONE_BG_CLASS[insight.tone]
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {insight.label}
                  </p>
                  <p className={cn("text-sm font-semibold truncate", TONE_CLASS[insight.tone])}>
                    {insight.value}
                  </p>
                  {insight.subvalue && (
                    <p className="text-[10px] text-muted-foreground">
                      {insight.subvalue}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
