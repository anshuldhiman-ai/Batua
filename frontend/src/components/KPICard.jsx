import React from "react";
import { ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Reusable KPI metric card.
 * @param change percentage change vs previous month
 * @param goodWhenUp whether an increase is "good" (green) — false for expenses
 */
export default function KPICard({
  label,
  value,
  change,
  icon: Icon,
  accent = "primary",
  goodWhenUp = true,
  testId,
  onClick,
  note,
  hero = false,
  showSign = false,
  sparkline = null,
  valueClassName,
}) {
  const hasChange = change !== undefined && change !== null;
  const up = (change || 0) >= 0;
  const positive = goodWhenUp ? up : !up;
  const clickable = typeof onClick === "function";
  const hasSparkline = sparkline && sparkline.length > 0;
  const sparkMax = hasSparkline ? Math.max(...sparkline, 1) : 1;

  return (
    <Card
      className={cn(
        "card-hover relative group overflow-hidden",
        hero ? "px-4 py-3.5" : "px-3 py-2.5",
        clickable &&
          "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      )}
      data-testid={testId}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Header row: label + icon */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          "font-medium text-muted-foreground truncate",
          hero ? "text-sm" : "text-xs"
        )}>
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {Icon && (
            <span
              className={cn(
                "flex items-center justify-center rounded-md",
                hero ? "h-7 w-7" : "h-6 w-6",
                accent === "primary" && "bg-primary/10 text-primary",
                accent === "rose" && "bg-rose-500/10 text-rose-500",
                accent === "emerald" && "bg-emerald-500/10 text-emerald-500",
                accent === "sky" && "bg-sky-500/10 text-sky-500",
                accent === "violet" && "bg-violet-500/10 text-violet-500"
              )}
            >
              <Icon className={cn(hero ? "h-3.5 w-3.5" : "h-3 w-3")} />
            </span>
          )}
          {clickable && (
            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </div>

      {/* Value */}
      <div className={cn(
        "kpi-number leading-tight",
        hero ? "mt-1 text-xl md:text-2xl" : "mt-0.5 text-lg",
        valueClassName
      )}>
        {showSign && typeof value === 'string' && !value.startsWith('₹') && !value.startsWith('-') ? '+' : ''}{value}
      </div>

      {/* Note + change — inline on the same row to save vertical space */}
      {(note || hasChange) && (
        <div className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-0",
          hero ? "mt-1" : "mt-0.5"
        )}>
          {note && (
            <span className={cn(
              "text-muted-foreground",
              hero ? "text-xs" : "text-[10px]"
            )}>
              {note}
            </span>
          )}
          {hasChange && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                hero ? "text-xs" : "text-[10px]",
                positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
              )}
            >
              {up ? "↑" : "↓"} {Math.abs(change)}%
            </span>
          )}
        </div>
      )}

      {/* Sparkline — thinner */}
      {hasSparkline && (
        <div className="mt-1.5 h-5 w-full">
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${sparkline.length * 10} 24`}
            preserveAspectRatio="none"
          >
            <polyline
              fill="none"
              stroke={positive ? "hsl(var(--chart-income))" : "hsl(var(--chart-expense))"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sparkline.map((val, i) => `${i * 10},${22 - (val / sparkMax) * 20}`).join(" ")}
            />
          </svg>
        </div>
      )}
    </Card>
  );
}
