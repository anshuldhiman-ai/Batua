import React from "react";
import {
  Plus,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Trash2,
  Edit,
  Check,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, formatINR, formatDate } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

// "I gave X to Rahul" — they owe me
// "I took X from Mom" — I owe her
const DIRECTIONS = [
  { value: "gave", label: "Gave", help: "I gave money — they owe me" },
  { value: "took", label: "Took", help: "I took/borrowed — I owe them" },
];

const emptyForm = {
  person_name: "",
  direction: "gave",
  amount: "",
  reason: "",
  date: new Date().toISOString().slice(0, 10),
};

function netToneClass(net) {
  if (net > 0) return "text-emerald-600 dark:text-emerald-400";
  if (net < 0) return "text-rose-600 dark:text-rose-400";
  return "text-muted-foreground";
}

function netBadgeVariant(net) {
  if (net > 0) return "default"; // green-ish
  if (net < 0) return "destructive";
  return "secondary";
}

function netLabel(net) {
  if (net > 0) return `Owes you ${formatINR(net)}`;
  if (net < 0) return `You owe ${formatINR(Math.abs(net))}`;
  return "Settled";
}

export default function People() {
  const [summary, setSummary] = React.useState(null);
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(emptyForm);
  const [expanded, setExpanded] = React.useState({}); // person_name -> bool
  const reduce = useReducedMotion();

  const reload = React.useCallback(async () => {
    try {
      const [sum, list] = await Promise.all([
        api.get("/people/summary"),
        api.get("/people/"),
      ]);
      setSummary(sum.data);
      setEntries(list.data.entries || []);
    } catch (e) {
      console.error("Failed to load people ledger", e);
      toast.error("Failed to load people");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (entry) => {
    setEditing(entry);
    setForm({
      person_name: entry.person_name,
      direction: entry.direction,
      amount: String(entry.amount),
      reason: entry.reason || "",
      date: entry.date,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const person_name = form.person_name.trim();
    const amount = parseFloat(form.amount);
    if (!person_name) {
      toast.error("Person name is required");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    if (!form.date) {
      toast.error("Date is required");
      return;
    }

    const payload = {
      person_name,
      direction: form.direction,
      amount,
      reason: form.reason.trim(),
      date: form.date,
    };

    try {
      if (editing) {
        await api.put(`/people/${editing.id}`, payload);
        toast.success("Entry updated");
      } else {
        await api.post("/people/", payload);
        toast.success("Entry added");
      }
      closeDialog();
      reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save entry");
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete this ${entry.direction} entry for ${entry.person_name}?`)) return;
    try {
      await api.delete(`/people/${entry.id}`);
      toast.success("Entry deleted");
      reload();
    } catch (e) {
      toast.error("Failed to delete entry");
    }
  };

  const toggleSettle = async (entry) => {
    try {
      await api.put(`/people/${entry.id}`, { settled: !entry.settled });
      reload();
    } catch (e) {
      toast.error("Failed to update entry");
    }
  };

  const togglePerson = (name) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  if (loading) {
    return (
      <div className="page-enter">
        <PageHeader title="People" subtitle="Track who owes you and whom you owe" />
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading people...</div>
        </div>
      </div>
    );
  }

  const totals = summary?.totals || { to_receive: 0, to_give: 0, net: 0 };
  const people = summary?.people || [];
  const knownNames = summary?.names || [];

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="People"
        subtitle="Track money you've lent or borrowed — keep tabs on who owes you, and whom you owe"
        actions={
          <Button onClick={openCreate} data-testid="add-entry-btn">
            <Plus className="h-4 w-4 mr-2" /> Add Entry
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="summary-to-receive">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  To receive
                </p>
                <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {formatINR(totals.to_receive)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Others owe you</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="summary-to-give">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  To give
                </p>
                <p className="text-2xl font-bold mt-1 text-rose-600 dark:text-rose-400">
                  {formatINR(totals.to_give)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">You owe others</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <ArrowUpFromLine className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="summary-net">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Net</p>
                <p className={cn("text-2xl font-bold mt-1", netToneClass(totals.net))}>
                  {totals.net >= 0 ? "+" : "−"}
                  {formatINR(Math.abs(totals.net))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totals.net > 0 ? "In your favour" : totals.net < 0 ? "Against you" : "All square"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* People list */}
      {people.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No one in your ledger yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Record money you've lent to a friend, or borrowed from family.
              Each entry becomes a small credit that auto-aggregates into a
              per-person balance.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Add your first entry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="people-list">
          {people.map((p) => {
            const isOpen = !!expanded[p.person_name];
            return (
              <Card key={p.person_name} data-testid={`person-card-${p.person_name}`}>
                <button
                  type="button"
                  onClick={() => togglePerson(p.person_name)}
                  className="w-full text-left"
                  data-testid={`person-toggle-${p.person_name}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                            p.net > 0 && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                            p.net < 0 && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                            p.net === 0 && "bg-muted text-muted-foreground",
                          )}
                        >
                          {p.person_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{p.person_name}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.open_count} open {p.open_count === 1 ? "entry" : "entries"} ·{" "}
                            {p.entries.length} total
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={netBadgeVariant(p.net)} className="text-xs">
                          {netLabel(p.net)}
                        </Badge>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduce ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <CardContent className="pt-0 space-y-2">
                        {p.entries.map((entry) => (
                          <div
                            key={entry.id}
                            data-testid={`entry-${entry.id}`}
                            className={cn(
                              "flex items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-3 py-2.5",
                              entry.settled && "opacity-60",
                            )}
                          >
                            <div
                              className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                                entry.direction === "gave"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                              )}
                              title={entry.direction === "gave" ? "You gave" : "You took"}
                            >
                              {entry.direction === "gave" ? (
                                <ArrowDownToLine className="h-4 w-4" />
                              ) : (
                                <ArrowUpFromLine className="h-4 w-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={cn(
                                    "font-semibold",
                                    entry.settled && "line-through",
                                    entry.direction === "gave"
                                      ? "text-emerald-700 dark:text-emerald-300"
                                      : "text-rose-700 dark:text-rose-300",
                                  )}
                                >
                                  {entry.direction === "gave" ? "+" : "−"}
                                  {formatINR(entry.amount)}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(entry.date)}
                                </span>
                                {entry.settled && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Settled
                                  </Badge>
                                )}
                              </div>
                              {entry.reason && (
                                <p
                                  className={cn(
                                    "text-sm text-muted-foreground truncate",
                                    entry.settled && "line-through",
                                  )}
                                >
                                  {entry.reason}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => toggleSettle(entry)}
                                title={entry.settled ? "Mark as open" : "Mark as settled"}
                                data-testid={`settle-${entry.id}`}
                              >
                                <Check
                                  className={cn(
                                    "h-4 w-4",
                                    entry.settled ? "text-emerald-600" : "text-muted-foreground",
                                  )}
                                />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEdit(entry)}
                                data-testid={`edit-${entry.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteEntry(entry)}
                                data-testid={`delete-${entry.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent onClose={closeDialog}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit entry" : "Add a ledger entry"}</DialogTitle>
            <DialogDescription>
              Record money you gave to or took from a person. Each entry is standalone —
              Batua keeps the per-person balance up to date automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Person</label>
              <Input
                placeholder="e.g. Rahul, Mom, Flatmate"
                value={form.person_name}
                onChange={(e) => setForm({ ...form, person_name: e.target.value })}
                list="known-people"
                data-testid="entry-person-input"
                required
              />
              {knownNames.length > 0 && (
                <datalist id="known-people">
                  {knownNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Direction</label>
              <div className="grid grid-cols-2 gap-2" data-testid="entry-direction-toggle">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setForm({ ...form, direction: d.value })}
                    data-testid={`direction-${d.value}`}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      form.direction === d.value
                        ? d.value === "gave"
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        : "border-border/60 hover:bg-accent/40",
                    )}
                  >
                    <div className="font-medium">{d.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{d.help}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="500"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  data-testid="entry-amount-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  data-testid="entry-date-input"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Reason <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                placeholder="lunch, rent share, cab, etc."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                data-testid="entry-reason-input"
                maxLength={200}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" data-testid="entry-save-btn">
                {editing ? "Update" : "Add"} entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
