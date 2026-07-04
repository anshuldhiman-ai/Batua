import React from "react";
import { Table2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatMonth } from "@/lib/utils-finance";

/**
 * Month-by-month income/expense/net table (absorbed from the old Reports
 * page). Scoped to the same period as the rest of the Analytics page.
 */
export default function MonthlySummaryTable({ series, loading, periodLabel }) {
  // Latest month first for reading; totals across the visible period.
  const rows = React.useMemo(() => [...(series || [])].reverse(), [series]);
  const totals = React.useMemo(
    () =>
      rows.reduce(
        (a, m) => ({
          income: a.income + (m.income || 0),
          expense: a.expense + (m.expense || 0),
          net: a.net + (m.net || 0),
        }),
        { income: 0, expense: 0, net: 0 }
      ),
    [rows]
  );

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-primary" /> Monthly Summary
        </CardTitle>
        {periodLabel && <CardDescription>{periodLabel}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="p-3">Month</th>
                <th className="p-3 text-right">Income</th>
                <th className="p-3 text-right">Expense</th>
                <th className="p-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-6 text-center"><Skeleton className="h-4 w-full" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No data for this period.</td></tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.month} className="border-b border-border/60 transition-colors hover:bg-accent/40">
                    <td className="p-3 font-medium">{formatMonth(m.month)}</td>
                    <td className="p-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(m.income)}</td>
                    <td className="p-3 text-right tabular-nums text-rose-500">{formatINR(m.expense)}</td>
                    <td className={`p-3 text-right tabular-nums font-medium ${m.net < 0 ? "text-rose-500" : ""}`}>{formatINR(m.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-card">
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="p-3">Total</td>
                  <td className="p-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(totals.income)}</td>
                  <td className="p-3 text-right tabular-nums text-rose-500">{formatINR(totals.expense)}</td>
                  <td className={`p-3 text-right tabular-nums ${totals.net < 0 ? "text-rose-500" : ""}`}>{formatINR(totals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
