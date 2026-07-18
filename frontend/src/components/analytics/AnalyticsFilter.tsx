import React from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { currentYearMonth } from "@/lib/utils-finance";

const VIEW_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const DATE_RANGE_OPTIONS = [
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "current_month", label: "This Month" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "single_month", label: "Single Month" },
  { value: "month_range", label: "Month Range" },
  { value: "current_year", label: "This Year" },
  { value: "previous_year", label: "Last Year" },
  { value: "custom", label: "Custom Dates" },
];

/**
 * Analytics filter bar — view granularity + period presets.
 * Wired to client-side aggregation (no API changes).
 */
export default function AnalyticsFilter({
  view,
  onViewChange,
  dateRange,
  onDateRangeChange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
  singleMonth,
  onSingleMonthChange,
  rangeStartMonth,
  rangeEndMonth,
  onMonthRangeChange,
  periodLabel,
  className,
}: any) {
  const defaultMonth = currentYearMonth();

  return (
    <div className={cn("space-y-3", className)}>
      {/* Segmented view control */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          View
        </span>
        <div
          className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5"
          role="tablist"
          aria-label="Chart granularity"
        >
          {VIEW_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              variant={view === option.value ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium",
                view === option.value && "shadow-sm"
              )}
              onClick={() => onViewChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Period
        </span>
        <Select value={dateRange} onValueChange={onDateRangeChange}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent className="bg-background">
            {DATE_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {dateRange === "single_month" && (
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="month"
              value={singleMonth || defaultMonth}
              onChange={(e) => onSingleMonthChange?.(e.target.value)}
              className="h-9 w-[150px] rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        {dateRange === "month_range" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={rangeStartMonth || defaultMonth}
              onChange={(e) =>
                onMonthRangeChange?.({ start: e.target.value, end: rangeEndMonth })
              }
              className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Range start month"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="month"
              value={rangeEndMonth || defaultMonth}
              onChange={(e) =>
                onMonthRangeChange?.({ start: rangeStartMonth, end: e.target.value })
              }
              className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Range end month"
            />
          </div>
        )}

        {dateRange === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={customStartDate}
                onChange={(e) =>
                  onCustomDateChange({ startDate: e.target.value, endDate: customEndDate })
                }
                className="h-9 w-[140px] rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) =>
                  onCustomDateChange({ startDate: customStartDate, endDate: e.target.value })
                }
                className="h-9 w-[140px] rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}

        {periodLabel && (
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        )}
      </div>
    </div>
  );
}
