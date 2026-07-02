import React from "react";
import { Link } from "react-router-dom";
import { Wallet, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatINR, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

// Mirrors the status colours used on the Budgets page so the two read the same.
const STATUS = {
  ok: { bar: "bg-emerald-500", badge: "success" },
  warn: { bar: "bg-amber-500", badge: "warning" },
  over: { bar: "bg-rose-500", badge: "destructive" },
};

/**
 * Dashboard budget-health summary for a given month. Reuses the existing
 * `/budgets/status?month=` endpoint (no backend changes) and answers the core
 * finance question at a glance: "am I within budget this month?".
 */
export default function BudgetHealth({ month }) {
  const [rows, setRows] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    setRows(null);
    api
      .get("/budgets/status", { params: month ? { month } : {} })
      .then((r) => active && setRows(r.data.rows || []))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, [month]);

  const overCount = (rows || []).filter((r) => r.status === "over").length;

  return (
    <Card data-testid="budget-health">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Budget Health
            {rows && overCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {overCount} over
              </Badge>
            )}
          </span>
          <Link
            to="/budgets"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">No budgets set for this month yet.</p>
            <Link
              to="/budgets"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Set a budget <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.slice(0, 6).map((b) => {
              const s = STATUS[b.status] || STATUS.ok;
              return (
                <div key={b.id} data-testid={`budget-health-${b.category}`}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: categoryColor(b.category) }}
                      />
                      <span className="truncate">{b.category}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatINR(b.spent, { compact: true })} / {formatINR(b.limit, { compact: true })}
                    </span>
                  </div>
                  <Progress value={b.pct} indicatorClassName={s.bar} />
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <Badge variant={s.badge}>{b.pct}% used</Badge>
                    <span className={cn(b.remaining < 0 ? "text-rose-500" : "text-muted-foreground")}>
                      {b.remaining < 0
                        ? `${formatINR(Math.abs(b.remaining), { compact: true })} over`
                        : `${formatINR(b.remaining, { compact: true })} left`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
