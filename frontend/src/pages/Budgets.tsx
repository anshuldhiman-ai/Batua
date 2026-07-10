import React from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatINR, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const STATUS = {
  ok: { variant: "success", bar: "bg-emerald-500" },
  warn: { variant: "warning", bar: "bg-amber-500" },
  over: { variant: "destructive", bar: "bg-rose-500" },
};

export default function Budgets() {
  const [rows, setRows] = React.useState(null);
  const [month, setMonth] = React.useState("");
  const [categories, setCategories] = React.useState([]);
  const [newCat, setNewCat] = React.useState("");
  const [newLimit, setNewLimit] = React.useState("");

  const load = React.useCallback(async () => {
    const { data } = await api.get("/budgets/status");
    setRows(data.rows);
    setMonth(data.month);
  }, []);

  React.useEffect(() => {
    load();
    api.get("/categories/").then((r) => setCategories(r.data.categories.filter((c) => c !== "Income")));
  }, [load]);

  const addBudget = async () => {
    if (!newCat || !newLimit) return toast.error("Pick a category and limit");
    await api.post("/budgets/", { category: newCat, limit: parseFloat(newLimit) });
    toast.success("Budget saved");
    setNewCat("");
    setNewLimit("");
    load();
  };

  const removeBudget = async (id) => {
    await api.delete(`/budgets/${id}`);
    toast.success("Budget removed");
    load();
  };

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Budgets"
        subtitle="Set monthly limits per category and track how you're pacing"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Set a Monthly Budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              data-testid="budget-category"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Select category…</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Input
              data-testid="budget-limit"
              type="number"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="Monthly limit (₹)"
              className="sm:max-w-[200px]"
            />
            <Button onClick={addBudget} data-testid="budget-add-btn">
              <Plus className="h-4 w-4" /> Save Budget
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">Showing spend for <span className="font-medium text-foreground">{month}</span></div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows === null ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)
        ) : rows.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No budgets yet. Add one above to track your spending against limits.
            </CardContent>
          </Card>
        ) : (
          rows.map((b) => {
            const s = STATUS[b.status] || STATUS.ok;
            return (
              <Card key={b.id} className="card-hover" data-testid={`budget-card-${b.category}`}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: categoryColor(b.category) }} />
                      <span className="font-display font-semibold">{b.category}</span>
                    </div>
                    <button
                      onClick={() => removeBudget(b.id)}
                      data-testid={`budget-delete-${b.category}`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="kpi-number text-2xl">{formatINR(b.spent)}</span>
                    <span className="text-sm text-muted-foreground">/ {formatINR(b.limit)}</span>
                  </div>
                  <Progress value={b.pct} indicatorClassName={s.bar} className="my-2" />
                  <div className="flex items-center justify-between">
                    <Badge variant={s.variant}>{b.pct}% used</Badge>
                    <span className={cn("text-xs", b.remaining < 0 ? "text-rose-500" : "text-muted-foreground")}>
                      {b.remaining < 0 ? `${formatINR(Math.abs(b.remaining))} over` : `${formatINR(b.remaining)} left`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
