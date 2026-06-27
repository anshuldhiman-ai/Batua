import React from "react";
import { Loader2, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryDonut } from "@/components/Charts";
import { api, formatINR, formatDate, categoryColor } from "@/lib/utils-finance";

/**
 * Interactive category breakdown: a donut plus a clickable list of categories.
 * Clicking a category opens a dialog listing every transaction in it.
 * `data` = [{ category, amount }] sorted by amount desc.
 */
export default function CategoryExplorer({ data }) {
  const [active, setActive] = React.useState(null);

  if (data === null) return <Skeleton className="h-[340px]" />;
  if (!data.length)
    return <p className="py-10 text-center text-sm text-muted-foreground">No spending to break down yet.</p>;

  const total = data.reduce((s, d) => s + d.amount, 0);
  const max = data[0]?.amount || 1;

  return (
    <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
      <CategoryDonut data={data} />

      <div>
        <p className="mb-2 text-xs text-muted-foreground">Click a category to see its transactions</p>
        <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
          {data.map((d) => {
            const pct = total > 0 ? (d.amount / total) * 100 : 0;
            return (
              <button
                key={d.category}
                onClick={() => setActive(d.category)}
                data-testid={`cat-row-${d.category}`}
                className="group w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/50"
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(d.category) }} />
                    <span className="truncate">{d.category}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                    {formatINR(d.amount)} · {pct.toFixed(0)}%
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(d.amount / max) * 100}%`, background: categoryColor(d.category) }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <CategoryTxnDialog category={active} onClose={() => setActive(null)} />
    </div>
  );
}

function CategoryTxnDialog({ category, onClose }) {
  const open = !!category;
  const [items, setItems] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setItems(null);
    api
      .get("/transactions", { params: { category, page_size: 500 } })
      .then((r) => active && setItems(r.data.items || []))
      .catch(() => active && setItems([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, category]);

  if (!open) return null;
  const total = (items || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: categoryColor(category) }} />
            {category}
          </DialogTitle>
          <DialogDescription>
            {items ? `${items.length} transaction${items.length === 1 ? "" : "s"} · ${formatINR(total)} total` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items && items.length ? (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" data-testid="cat-txn-list">
            {items.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(t.date)}
                    {t.payment_method ? ` · ${t.payment_method}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 tabular-nums text-sm font-semibold ${
                    t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                  }`}
                >
                  {formatINR(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No transactions in this category.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
