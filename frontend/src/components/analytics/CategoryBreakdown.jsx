import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatINR, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

/**
 * Enhanced category breakdown with detailed metrics
 * Fully theme-compatible using CSS custom properties
 */
export default function CategoryBreakdown({
  data,
  loading = false,
  className,
}) {
  if (loading) {
    return (
      <Card className={cn("rounded-xl border border-border/50", className)}>
        <CardHeader className="p-4 pb-2">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn("rounded-xl border border-border/50", className)}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex h-[200px] items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">No category data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, cat) => sum + cat.amount, 0);
  const maxAmount = Math.max(...data.map(cat => cat.amount));

  return (
    <Card className={cn("rounded-xl border border-border/50", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Category Breakdown</span>
          <span className="text-xs font-normal text-muted-foreground">
            {data.length} categories
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="space-y-4">
          {data.map((category, index) => {
            const percentage = total > 0 ? ((category.amount / total) * 100).toFixed(1) : 0;
            const color = categoryColor(category.category);

            return (
              <div
                key={category.category}
                className="group rounded-lg border border-border/50 bg-card/50 p-3 transition-colors hover:bg-muted/40"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-muted-foreground bg-muted/60">
                      {index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="text-sm font-medium">{category.category}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatINR(category.amount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {percentage}%
                    </p>
                  </div>
                </div>
                <Progress
                  value={(category.amount / maxAmount) * 100}
                  className="h-2"
                  style={{
                    '--progress-color': color,
                  }}
                />
                {category.transactions && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {category.transactions} transaction{category.transactions !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
