import React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { api, formatINR, formatDate, formatMonth, categoryColor } from "@/lib/utils-finance";

// Each drillable KPI maps to a transaction filter for the current month.
const CONFIG = {
  income: { title: "Income", params: { txn_type: "income" }, empty: "No income recorded this month." },
  expense: { title: "Expenses", params: { txn_type: "expense" }, empty: "No expenses recorded this month." },
  investments: {
    title: "Investments / SIP",
    params: { category: "Investments" },
    empty: "No investments recorded this month. Try: \"sip 1k monthly since aug 2025\".",
  },
};

export default function CardDetailDialog({ kind, metrics, onClose }: any) {
  const open = !!kind;
  const month = metrics?.current_month || "";
  const isList = kind === "income" || kind === "expense" || kind === "investments";

  const [items, setItems] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !isList || !month) return;
    let active = true;
    setLoading(true);
    setItems(null);
    api
      .get("/transactions", {
        params: {
          ...CONFIG[kind].params,
          start_date: `${month}-01`,
          end_date: `${month}-31`,
          page_size: 500,
        },
      })
      .then((r) => active && setItems(r.data.items || []))
      .catch(() => active && setItems([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, kind, isList, month]);

  if (!open) return null;

  const cfg = CONFIG[kind];
  const total = (items || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isList ? cfg.title : "This month at a glance"}
          </DialogTitle>
          <DialogDescription>
            {month ? formatMonth(month) : "Current month"}
            {isList && items ? ` · ${items.length} transaction${items.length === 1 ? "" : "s"} · ${formatINR(total)} total` : ""}
          </DialogDescription>
        </DialogHeader>

        {isList ? (
          loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items && items.length ? (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" data-testid="drill-list">
              {items.map((t) => (
                <li
                  key={`${kind}-${t.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      style={{ borderColor: categoryColor(t.category), color: categoryColor(t.category) }}
                    >
                      {t.category}
                    </Badge>
                    <span
                      className={`tabular-nums text-sm font-semibold ${
                        t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                      }`}
                    >
                      {formatINR(t.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{cfg.empty}</p>
          )
        ) : (
          <SummaryGrid metrics={metrics} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryGrid({ metrics }: any) {
  if (!metrics) return null;
  const rows = [
    { label: "Income", value: formatINR(metrics.income), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Expense", value: formatINR(metrics.expense), tone: "text-rose-500" },
    { label: "Investments / SIP", value: formatINR(metrics.investments), tone: "text-violet-500" },
    { label: "Net savings", value: formatINR(metrics.net), tone: "text-foreground" },
    { label: "Savings rate", value: `${metrics.savings_rate}%`, tone: "text-sky-500" },
    { label: "Total invested (all time)", value: formatINR(metrics.investments_total), tone: "text-violet-500" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="drill-summary">
      {rows.map((r) => (
        <div key={r.label} className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">{r.label}</p>
          <p className={`mt-1 kpi-number text-xl ${r.tone}`}>{r.value}</p>
        </div>
      ))}
    </div>
  );
}
