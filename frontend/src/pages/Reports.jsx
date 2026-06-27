import React from "react";
import { Download, FileSpreadsheet, Repeat, Wallet, Banknote, Smartphone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl, formatINR, formatMonth, categoryColor } from "@/lib/utils-finance";

export default function Reports() {
  const [timeline, setTimeline] = React.useState(null);
  const [recurring, setRecurring] = React.useState(null);
  const [payment, setPayment] = React.useState(null);

  React.useEffect(() => {
    api.get("/analytics/timeline").then((r) => setTimeline([...r.data.series].reverse()));
    api.get("/recurring").then((r) => setRecurring(r.data.recurring));
    api.get("/analytics/payment-method").then((r) => setPayment(r.data));
  }, []);

  const totals = React.useMemo(() => {
    if (!timeline) return null;
    return timeline.reduce(
      (a, m) => ({
        income: a.income + m.income,
        expense: a.expense + m.expense,
        net: a.net + m.net,
      }),
      { income: 0, expense: 0, net: 0 }
    );
  }, [timeline]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Month-by-month performance, payment mix and recurring spends — export anytime.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.open(apiUrl("/export/excel"))} data-testid="report-export-excel">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={() => window.open(apiUrl("/export/csv"))} data-testid="report-export-csv">
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {/* Payment mix — Online vs Cash */}
      <PaymentMix payment={payment} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Monthly summary */}
        <Card>
          <CardHeader><CardTitle>Monthly Summary</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3">Month</th>
                    <th className="p-3 text-right">Income</th>
                    <th className="p-3 text-right">Expense</th>
                    <th className="p-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline === null ? (
                    <tr><td colSpan={4} className="p-6 text-center"><Skeleton className="h-4 w-full" /></td></tr>
                  ) : timeline.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No data.</td></tr>
                  ) : (
                    timeline.map((m) => (
                      <tr key={m.month} className="border-b border-border/60 transition-colors hover:bg-accent/40">
                        <td className="p-3 font-medium">{formatMonth(m.month)}</td>
                        <td className="p-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(m.income)}</td>
                        <td className="p-3 text-right tabular-nums text-rose-500">{formatINR(m.expense)}</td>
                        <td className={`p-3 text-right tabular-nums font-medium ${m.net < 0 ? "text-rose-500" : ""}`}>{formatINR(m.net)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {totals && timeline && timeline.length > 0 && (
                  <tfoot>
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

        {/* Recurring */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" /> Recurring Expenses
            </CardTitle>
            <p className="text-sm text-muted-foreground">Merchants seen in 3+ different months</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {recurring === null ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recurring patterns detected yet.</p>
            ) : (
              recurring.map((r) => (
                <div key={r.merchant} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-accent/40" data-testid={`recurring-${r.merchant}`}>
                  <div>
                    <div className="font-medium">{r.merchant}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: categoryColor(r.category) }} />
                        {r.category}
                      </Badge>
                      <span>{r.months} months · {r.occurrences}×</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="kpi-number text-lg">{formatINR(r.total)}</div>
                    <div className="text-xs text-muted-foreground">avg {formatINR(r.avg)}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PaymentMix({ payment }) {
  const data = payment?.data || [];
  const total = payment?.total || 0;
  const get = (m) => data.find((d) => d.method === m) || { amount: 0, count: 0 };
  const online = get("Online");
  const cash = get("Cash");
  const onlinePct = total > 0 ? (online.amount / total) * 100 : 0;
  const cashPct = total > 0 ? (cash.amount / total) * 100 : 0;

  return (
    <Card data-testid="payment-mix">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Payment Mix
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          How you actually paid — online vs cash. Mixed entries are split by amount; money given by others is excluded.
        </p>
      </CardHeader>
      <CardContent>
        {payment === null ? (
          <Skeleton className="h-28 w-full" />
        ) : total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No spending to categorize yet.</p>
        ) : (
          <div className="space-y-4">
            {/* Proportion bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-sky-500" style={{ width: `${onlinePct}%` }} title={`Online ${onlinePct.toFixed(0)}%`} />
              <div className="bg-emerald-500" style={{ width: `${cashPct}%` }} title={`Cash ${cashPct.toFixed(0)}%`} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MixStat
                icon={Smartphone}
                label="Online"
                amount={online.amount}
                pct={onlinePct}
                count={online.count}
                tone="sky"
              />
              <MixStat
                icon={Banknote}
                label="Cash"
                amount={cash.amount}
                pct={cashPct}
                count={cash.count}
                tone="emerald"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MIX_TONE = {
  sky: { ring: "border-sky-500/30 bg-sky-500/5", icon: "bg-sky-500/10 text-sky-500", text: "text-sky-600 dark:text-sky-400" },
  emerald: { ring: "border-emerald-500/30 bg-emerald-500/5", icon: "bg-emerald-500/10 text-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
};

function MixStat({ icon: Icon, label, amount, pct, count, tone }) {
  const c = MIX_TONE[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${c.ring}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.icon}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className={`text-xs font-semibold ${c.text}`}>{pct.toFixed(0)}%</span>
        </div>
        <div className="kpi-number text-2xl">{formatINR(amount)}</div>
        <div className="text-xs text-muted-foreground">{count} transaction{count === 1 ? "" : "s"}</div>
      </div>
    </div>
  );
}
