import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  rose: "text-rose-500",
  primary: "text-foreground",
  sky: "text-sky-500",
  violet: "text-violet-500",
  amber: "text-amber-500",
};

const TONE_BG_CLASS = {
  emerald: "bg-emerald-500/10 text-emerald-500",
  rose: "bg-rose-500/10 text-rose-500",
  primary: "bg-primary/10 text-primary",
  sky: "bg-sky-500/10 text-sky-500",
  violet: "bg-violet-500/10 text-violet-500",
  amber: "bg-amber-500/10 text-amber-500",
};

/**
 * Premium stat card with optional sparkline, trend indicator, and hover effects
 * Fully theme-compatible using CSS custom properties
 */
export default function AnalyticsStatCard({
  title,
  value,
  subtitle,
  trend,
  trendUp,
  icon: Icon,
  tone = "primary",
  loading = false,
  onClick,
  className,
}: any) {
  const content = (
    <Card
      className={cn(
        "group relative overflow-hidden transition-shadow duration-200 hover:shadow-md",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center p-3 text-center">
        {/* Icon */}
        {Icon && (
          <div className={cn(
            "mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            TONE_BG_CLASS[tone]
          )}>
            <Icon className="h-4 w-4" />
          </div>
        )}

        {/* Value and title */}
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
          {title}
        </p>
        <p className={cn(
          "kpi-number text-base font-semibold leading-tight tracking-tight",
          TONE_CLASS[tone]
        )}>
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {subtitle}
          </p>
        )}

        {/* Trend indicator */}
        {trend !== undefined && (
          <div className={cn(
            "mt-1.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
            trendUp ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"
          )}>
            <span>{trendUp ? "↑" : "↓"}</span>
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Card className={cn(className)}>
        <CardContent className="flex flex-col items-center justify-center p-3">
          <Skeleton className="mb-1.5 h-8 w-8 rounded-lg" />
          <Skeleton className="mb-1 h-3 w-24" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  return content;
}
