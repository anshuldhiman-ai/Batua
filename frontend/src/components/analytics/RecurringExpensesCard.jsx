import React from "react";
import { Repeat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatINR, categoryColor } from "@/lib/utils-finance";

/**
 * Recurring merchant spends (absorbed from the old Reports page).
 * Self-fetching; detection runs across full history.
 */
export default function RecurringExpensesCard() {
  const [recurring, setRecurring] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    api
      .get("/recurring")
      .then((r) => active && setRecurring(r.data.recurring || []))
      .catch(() => active && setRecurring([]));
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" /> Recurring Expenses
        </CardTitle>
        <CardDescription>Merchants seen in 3+ different months</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[360px] space-y-3 overflow-y-auto">
        {recurring === null ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)
        ) : recurring.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No recurring patterns detected yet.</p>
        ) : (
          recurring.map((r) => (
            <div
              key={r.merchant}
              className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
              data-testid={`recurring-${r.merchant}`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.merchant}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: categoryColor(r.category) }} />
                    {r.category}
                  </Badge>
                  <span>{r.months} months · {r.occurrences}×</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="kpi-number text-lg">{formatINR(r.total)}</div>
                <div className="text-xs text-muted-foreground">avg {formatINR(r.avg)}</div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
