import React from "react";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/card";
import CountUp from "@/components/CountUp";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

// Per-accent styling: icon chip colour gives each tile its own identity.
// The cursor-tracking glow itself is a single neutral highlight (see
// .glow-card in index.css) — deliberately not tinted per accent.
// `spark` colours the sparkline by the card's identity (rose card = rose
// line) so users never read a green line on the Expense card as income —
// the ↑/↓ chip alone carries the good/bad signal.
const ACCENT = {
  primary: { chip: "bg-primary/10 text-primary", spark: "hsl(var(--primary))" },
  rose: { chip: "bg-rose-500/10 text-rose-500", spark: "hsl(var(--chart-expense))" },
  emerald: { chip: "bg-emerald-500/10 text-emerald-500", spark: "hsl(var(--chart-income))" },
  sky: { chip: "bg-sky-500/10 text-sky-500", spark: "hsl(199 89% 48%)" },
  violet: { chip: "bg-violet-500/10 text-violet-500", spark: "hsl(258 90% 66%)" },
};

/**
 * Reusable KPI metric card.
 * @param change     percentage change vs previous month
 * @param goodWhenUp whether an increase is "good" (green) — false for expenses
 * @param count      optional raw number → animated count-up (with countFormat)
 * @param countFormat (n:number)=>string formatter used when `count` is provided
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
  count,
  countFormat,
}: any) {
  const reduce = useReducedMotion();
  const hasChange = change !== undefined && change !== null;
  const up = (change || 0) >= 0;
  const positive = goodWhenUp ? up : !up;
  const clickable = typeof onClick === "function";
  const hasSparkline = sparkline && sparkline.length > 0;
  const sparkMax = hasSparkline ? Math.max(...sparkline, 1) : 1;
  const hasCount = typeof count === "number" && typeof countFormat === "function";
  const tone = ACCENT[accent] || ACCENT.primary;

  return (
    <motion.div
      whileHover={clickable && !reduce ? { y: -4, scale: 1.015 } : undefined}
      whileTap={clickable && !reduce ? { scale: 0.985 } : undefined}
      transition={spring}
      className="h-full"
    >
      <Card
        className={cn(
          "relative group h-full overflow-hidden",
          hero ? "px-4 py-3.5" : "px-3 py-2.5",
          clickable &&
            "cursor-pointer transition-shadow hover:shadow-[0_16px_40px_-16px_hsl(var(--foreground)/0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
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
        {/* Corner gradient wash removed — the cursor-tracking glow (.glow-card)
            now carries the hover identity; the wash competed with it. */}

        <div className="relative">
          {/* Header row: label + icon */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "font-medium text-muted-foreground truncate",
                hero ? "text-sm" : "text-xs"
              )}
            >
              {label}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {Icon && (
                <span
                  className={cn(
                    "flex items-center justify-center rounded-md",
                    hero ? "h-7 w-7" : "h-6 w-6",
                    tone.chip
                  )}
                >
                  <Icon className={cn(hero ? "h-3.5 w-3.5" : "h-3 w-3")} />
                </span>
              )}
              {clickable && (
                <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              )}
            </div>
          </div>

          {/* Value */}
          <div
            className={cn(
              "kpi-number leading-tight",
              hero ? "mt-1 text-lg md:text-xl" : "mt-0.5 text-base",
              valueClassName
            )}
          >
            {hasCount ? (
              <CountUp value={count} format={countFormat} />
            ) : (
              <>
                {showSign &&
                typeof value === "string" &&
                !value.startsWith("₹") &&
                !value.startsWith("-")
                  ? "+"
                  : ""}
                {value}
              </>
            )}
          </div>

          {/* Note + change — inline to save vertical space */}
          {(note || hasChange) && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-0",
                hero ? "mt-1" : "mt-0.5"
              )}
            >
              {note && (
                <span
                  className={cn(
                    "text-muted-foreground",
                    hero ? "text-xs" : "text-[10px]"
                  )}
                >
                  {note}
                </span>
              )}
              {hasChange && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-semibold",
                    hero ? "text-xs" : "text-[10px]",
                    positive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-500"
                  )}
                >
                  {up ? "↑" : "↓"} {Math.abs(change)}%
                </span>
              )}
            </div>
          )}

          {/* Sparkline — animated draw-in */}
          {hasSparkline && (
            <div className="mt-1.5 h-5 w-full">
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${sparkline.length * 10} 24`}
                preserveAspectRatio="none"
              >
                <motion.polyline
                  fill="none"
                  stroke={tone.spark}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparkline
                    .map((val, i) => `${i * 10},${22 - (val / sparkMax) * 20}`)
                    .join(" ")}
                  initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                  animate={reduce ? undefined : { pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
