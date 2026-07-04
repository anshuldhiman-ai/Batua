import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatINR, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const COLLAPSED_COUNT = 7;

/**
 * Ranked category list — compact rows in the same style as the Dashboard's
 * Top Categories card. Shows the top few by default with a show-all toggle
 * so the card stays balanced next to the donut.
 */
export default function CategoryBreakdown({ data, loading = false, className }) {
  const [showAll, setShowAll] = React.useState(false);

  if (loading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">No category data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, cat) => sum + cat.amount, 0);
  const maxAmount = Math.max(...data.map((cat) => cat.amount));
  const visible = showAll ? data : data.slice(0, COLLAPSED_COUNT);
  const hiddenCount = data.length - COLLAPSED_COUNT;

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Category Breakdown</span>
          <span className="text-xs font-normal text-muted-foreground">
            {data.length} categories
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.map((category, index) => {
          const percentage = total > 0 ? ((category.amount / total) * 100).toFixed(1) : 0;
          const color = categoryColor(category.category);
          return (
            <div
              key={category.category}
              className="group rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/40"
              title={
                category.transactions
                  ? `${category.transactions} transaction${category.transactions === 1 ? "" : "s"}`
                  : undefined
              }
            >
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex min-w-0 items-center gap-2.5 font-medium">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="truncate">{category.category}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatINR(category.amount)}
                  <span className="ml-1.5 text-xs">· {percentage}%</span>
                </span>
              </div>
              <Progress
                value={(category.amount / maxAmount) * 100}
                className="h-1.5"
                indicatorStyle={{ backgroundColor: color }}
              />
            </div>
          );
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="w-full rounded-lg border border-dashed border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            data-testid="category-breakdown-toggle"
          >
            {showAll ? "Show less" : `Show all ${data.length} categories`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
