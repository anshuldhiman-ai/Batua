import React from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Wallet, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, formatINR, categoryColor } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { spring } from "@/lib/motion";

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
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showDropdown, setShowDropdown] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoadError(null);
      const { data } = await api.get("/budgets/status");
      setRows(data.rows);
      setMonth(data.month);
    } catch (err: any) {
      setLoadError(err?.response?.data?.detail || "Could not load budgets");
      toast.error(err?.response?.data?.detail || "Could not load budgets");
    }
  }, []);

  React.useEffect(() => {
    load();
    api.get("/categories/")
      .then((r) => setCategories(r.data.categories.filter((c) => c !== "Income")))
      .catch(() => {});
  }, [load]);

  const addBudget = async () => {
    if (!newCat || !newLimit) return toast.error("Pick a category and limit");
    if (saving) return;
    setSaving(true);
    try {
      await api.post("/budgets/", { category: newCat, limit: parseFloat(newLimit) });
      toast.success("Budget saved");
      setNewCat("");
      setNewLimit("");
      setSearchQuery("");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not save the budget");
    } finally {
      setSaving(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = React.useState<any>(null);
  const [deleting, setDeleting] = React.useState(false);

  const confirmRemoveBudget = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/budgets/${deleteTarget.id}`);
      toast.success("Budget removed");
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not remove the budget");
    } finally {
      setDeleting(false);
    }
  };

  const filteredCategories = React.useMemo(() => {
    return categories.filter(c => 
      c.toLowerCase().includes(searchQuery.toLowerCase()) && 
      !rows?.some(r => r.category === c)
    );
  }, [categories, searchQuery, rows]);

  const selectCategory = (cat: string) => {
    setNewCat(cat);
    setSearchQuery(cat);
    setShowDropdown(false);
  };

  const clearSelection = () => {
    setNewCat("");
    setSearchQuery("");
  };

  // Close dropdown when clicking outside
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const dropdownContainerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Don't close if clicking inside the input container or the dropdown
      if (dropdownRef.current && dropdownRef.current.contains(target)) {
        return;
      }
      if (dropdownContainerRef.current && dropdownContainerRef.current.contains(target)) {
        return;
      }
      setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Budgets"
        subtitle="Set monthly spending limits and track your progress"
      />

      <Card className="border-border/50 bg-gradient-to-br from-card to-muted/30/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" /> Add a budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            {/* Modern Category Selector */}
            <div className="relative flex-1" ref={dropdownRef}>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Search className="h-4 w-4" />
                </div>
                <Input
                  data-testid="budget-category"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search category..."
                  className="pl-10 h-11 bg-background/50"
                />
                {newCat && (
                  <button
                    onClick={clearSelection}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Dropdown with Portal to render outside stacking context */}
              {showDropdown && filteredCategories.length > 0 && typeof document !== 'undefined' && createPortal(
                <motion.div
                  ref={dropdownContainerRef}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={spring}
                  className="fixed z-[9999] mt-2 w-72 rounded-xl border border-border/60 bg-background shadow-2xl max-h-60 overflow-auto"
                  style={{
                    top: dropdownRef.current?.getBoundingClientRect().bottom + 8 || 0,
                    left: dropdownRef.current?.getBoundingClientRect().left || 0,
                  }}
                >
                  {filteredCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectCategory(cat);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(cat) }} />
                      <span className="text-sm font-medium">{cat}</span>
                    </button>
                  ))}
                </motion.div>,
                document.body
              )}
            </div>

            <Input
              data-testid="budget-limit"
              type="number"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="Monthly limit (₹)"
              className="sm:max-w-[200px] h-11 bg-background/50"
            />
            <Button 
              onClick={addBudget} 
              disabled={saving || !newCat || !newLimit} 
              data-testid="budget-add-btn"
              className="h-11 gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Budget
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">Tracking for <span className="font-medium text-foreground">{month}</span></div>

      {loadError && rows === null && (
        <Card className="border-rose-500/30">
          <CardContent className="p-6 text-center text-sm text-rose-500">
            {loadError}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="budget-progress">
        {rows === null ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)
        ) : rows.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3 border-dashed">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No budgets yet. Add one above to track your spending against limits.
            </CardContent>
          </Card>
        ) : (
          rows.map((b, i) => {
            const s = STATUS[b.status] || STATUS.ok;
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className="border-border/50 bg-gradient-to-br from-card to-muted/30/50 shadow-sm hover:shadow-md transition-shadow"
                  data-testid={`budget-card-${b.category}`}
                >
                  <CardContent className="p-5">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="inline-block h-3 w-3 rounded-full shadow-sm" style={{ background: categoryColor(b.category) }} />
                        <span className="font-display font-semibold text-base">{b.category}</span>
                      </div>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        aria-label={`Delete ${b.category} budget`}
                        title={`Delete ${b.category} budget`}
                        data-testid={`budget-delete-${b.category}`}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mb-3 flex items-baseline justify-between">
                      <span className="kpi-number text-2xl font-bold">{formatINR(b.spent)}</span>
                      <span className="text-sm text-muted-foreground">of {formatINR(b.limit)}</span>
                    </div>
                    <div className="group relative">
                      <Progress value={b.pct} indicatorClassName={s.bar} className="mb-3 h-1.5 transition-all duration-300 group-hover:h-2" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={s.variant} className="text-xs">{b.pct}% used</Badge>
                      <span className={cn("text-xs font-medium", b.remaining < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                        {b.remaining < 0 ? `${formatINR(Math.abs(b.remaining))} over` : `${formatINR(b.remaining)} left`}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget ? `Delete the ${deleteTarget.category} budget?` : "Delete this budget?"}
        description="This removes the monthly limit for this category. Your transactions are not affected."
        confirmLabel="Delete budget"
        busy={deleting}
        onConfirm={confirmRemoveBudget}
        testId="delete-budget-dialog"
      />
    </div>
  );
}
