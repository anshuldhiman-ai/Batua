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
  sparkline,
  loading = false,
  onClick,
  className,
}) {
  const content = (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-200 hover:shadow-md",
        onClick && "cursor-pointer hover:border-primary/30",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Icon */}
          {Icon && (
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
              TONE_BG_CLASS[tone]
            )}>
              <Icon className="h-5 w-5" />
            </div>
          )}

          {/* Value and title */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {title}
            </p>
            <p className={cn(
              "kpi-number text-xl font-semibold leading-tight tracking-tight",
              TONE_CLASS[tone]
            )}>
              {value}
            </p>
            {subtitle && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>

          {/* Trend indicator */}
          {trend !== undefined && (
            <div className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
              trendUp ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"
            )}>
              <span>{trendUp ? "↑" : "↓"}</span>
              <span>{Math.abs(trend)}%</span>
            </div>
          )}
        </div>

        {/* Sparkline */}
        {sparkline && sparkline.length > 0 && (
          <div className="mt-3 h-8 w-full">
            <svg
              viewBox={`0 0 ${sparkline.length} 20`}
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
            >
              <defs>
                <linearGradient id={`sparkline-${tone}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={sparkline.map((val, i) => `${i === 0 ? 'M' : 'L'}${i} ${20 - (val / Math.max(...sparkline, 1)) * 20}`).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className={cn(TONE_CLASS[tone], "opacity-60")}
              />
              <path
                d={`${sparkline.map((val, i) => `${i === 0 ? 'M' : 'L'}${i} ${20 - (val / Math.max(...sparkline, 1)) * 20}`).join(' ')} L${sparkline.length - 1} 20 L0 20 Z`}
                fill={`url(#sparkline-${tone})`}
                className={cn(TONE_CLASS[tone], "opacity-20")}
              />
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Card className={cn("rounded-xl border border-border/50", className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-32" />
            </div>
          </div>
          <Skeleton className="mt-3 h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return content;
}
