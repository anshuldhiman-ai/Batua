import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  formatINR,
  formatMonthLabel,
  currentYearMonth,
  addMonths,
  monthRange,
} from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const minYm = (a, b) => (a < b ? a : b);
const maxYm = (a, b) => (a > b ? a : b);

/**
 * Checkbox month selector for recurring transactions.
 *
 * The visible months span the current selection (so a historical range like
 * "from Aug 2025 till now" shows Aug 2025 → this month, all checked) and default
 * to the last 12 months through today when nothing is selected. Future months are
 * never shown automatically — they only appear when explicitly part of the
 * selection (e.g. a forward subscription). The range can be extended further back.
 *
 * months: string[] of selected YYYY-MM · onChange: (months: string[]) => void
 */
export default function MonthPicker({ months = [], onChange, amount = 0, className }) {
  const base = currentYearMonth();
  const selected = new Set(months);
  const sortedSel = [...selected].sort();

  const defLo = sortedSel.length ? minYm(sortedSel[0], base) : addMonths(base, -11);
  const defHi = sortedSel.length ? maxYm(sortedSel[sortedSel.length - 1], base) : base;

  const [lo, setLo] = React.useState(defLo);
  const [hi, setHi] = React.useState(defHi);
  // Re-sync the window whenever the selection's span changes (e.g. a preset is
  // applied or new months are parsed). Manual "earlier" extensions persist until
  // then because defLo/defHi only change by value.
  React.useEffect(() => {
    setLo(defLo);
    setHi(defHi);
  }, [defLo, defHi]);

  const options = monthRange(lo, hi);
  const apply = (list) => onChange([...new Set(list)].sort());

  const toggle = (ym) => {
    const next = new Set(selected);
    next.has(ym) ? next.delete(ym) : next.add(ym);
    apply([...next]);
  };

  const presets = [
    { id: "all", label: "Select all shown", months: options },
    { id: "this-month", label: "This month only", months: [base] },
    { id: "last-6", label: "Last 6 months", months: monthRange(addMonths(base, -5), base) },
    { id: "last-12", label: "Last 12 months", months: monthRange(addMonths(base, -11), base) },
  ];

  const total = Math.round(amount * months.length * 100) / 100;

  return (
    <div className={cn("space-y-3", className)} data-testid="month-picker">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Apply to months
        </span>
        <span className="text-xs text-muted-foreground">
          {months.length} selected · {formatINR(total)} total
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            data-testid={`month-preset-${p.id}`}
            onClick={() => apply(p.months)}
          >
            {p.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => apply([])}
        >
          Clear all
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background/50">
        <button
          type="button"
          onClick={() => setLo(addMonths(lo, -1))}
          className="w-full border-b border-border/60 px-3 py-1.5 text-center text-xs font-medium text-muted-foreground hover:bg-accent/40"
          data-testid="month-extend-earlier"
        >
          ↑ Add an earlier month
        </button>
        <ul className="max-h-52 divide-y divide-border/60 overflow-y-auto">
          {options.map((ym) => {
            const on = selected.has(ym);
            return (
              <li key={ym}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/40",
                    on && "bg-primary/5"
                  )}
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={() => toggle(ym)}
                    className="h-5 w-5 shrink-0"
                    data-testid={`month-${ym}`}
                  />
                  <span className={cn("flex-1 font-medium", on && "text-primary")}>
                    {formatMonthLabel(ym, base)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatINR(amount)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
