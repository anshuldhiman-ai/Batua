import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
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
}) {
  const hasChange = change !== undefined && change !== null;
  const up = (change || 0) >= 0;
  const positive = goodWhenUp ? up : !up;
  const clickable = typeof onClick === "function";

  return (
    <Card
      className={cn(
        "card-hover p-5",
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
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              accent === "primary" && "bg-primary/10 text-primary",
              accent === "rose" && "bg-rose-500/10 text-rose-500",
              accent === "emerald" && "bg-emerald-500/10 text-emerald-500",
              accent === "sky" && "bg-sky-500/10 text-sky-500",
              accent === "violet" && "bg-violet-500/10 text-violet-500"
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <div className="mt-3 kpi-number text-3xl md:text-4xl">{value}</div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
      {hasChange && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
          )}
        >
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(change)}% vs last month
        </div>
      )}
      {clickable && (
        <div className="mt-1 text-[11px] text-muted-foreground/70">Click for details</div>
      )}
    </Card>
  );
}
