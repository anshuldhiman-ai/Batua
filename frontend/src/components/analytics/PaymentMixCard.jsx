import React from "react";
import { Wallet, Banknote, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatINR } from "@/lib/utils-finance";

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

/**
 * Online-vs-cash payment split (absorbed from the old Reports page).
 * Self-fetching; covers all recorded spending.
 */
export default function PaymentMixCard() {
  const [payment, setPayment] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    api
      .get("/analytics/payment-method")
      .then((r) => active && setPayment(r.data))
      .catch(() => active && setPayment({ data: [], total: 0 }));
    return () => {
      active = false;
    };
  }, []);

  const data = payment?.data || [];
  const total = payment?.total || 0;
  const get = (m) => data.find((d) => d.method === m) || { amount: 0, count: 0 };
  const online = get("Online");
  const cash = get("Cash");
  const onlinePct = total > 0 ? (online.amount / total) * 100 : 0;
  const cashPct = total > 0 ? (cash.amount / total) * 100 : 0;

  return (
    <Card data-testid="payment-mix" className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Payment Mix
        </CardTitle>
        <CardDescription>
          How you actually paid — online vs cash, across all recorded spending. Mixed entries are split by amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
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
              <MixStat icon={Smartphone} label="Online" amount={online.amount} pct={onlinePct} count={online.count} tone="sky" />
              <MixStat icon={Banknote} label="Cash" amount={cash.amount} pct={cashPct} count={cash.count} tone="emerald" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
