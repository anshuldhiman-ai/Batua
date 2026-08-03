import React from "react";
import { Download, FileSpreadsheet, Loader2, Rows3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { api, apiUrl, formatDate } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

/** "YYYY-MM" → "MM/YYYY" — compact and unambiguous in the dropdown. */
const monthLabel = (ym: string) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : "");

type Scope = "all" | "month" | "range";

/**
 * Export dialog: pick a format (Excel stacked expenditure sheet / CSV), then
 * scope — all time, a single past/current month, or a custom date range.
 * The month dropdown is fed by /api/export/months (months with expense data,
 * newest first) plus the current month, so future months never appear.
 */
export default function ExportDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const [format, setFormat] = React.useState<"excel" | "csv">("excel");
  const [scope, setScope] = React.useState<Scope>("all");
  const [month, setMonth] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const monthsQuery = useQuery({
    queryKey: ["export-months"],
    queryFn: async () => {
      const { data } = await api.get("/export/months");
      const today = todayISO().slice(0, 7);
      const list = Array.isArray(data?.months) ? data.months : [];
      // Current month is always selectable (even before any expense is logged);
      // dedupe and keep newest-first.
      const merged = Array.from(new Set([...list, today]));
      return merged.sort((a, b) => (a > b ? -1 : 1));
    },
    enabled: open,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setScope("all");
    setMonth(monthsQuery.data?.[0] ?? todayISO().slice(0, 7));
    setFrom("");
    setTo("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => setOpen(false);

  const doDownload = () => {
    const params = new URLSearchParams();
    if (scope === "month" && month) params.set("month", month);
    if (scope === "range") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    const qs = params.toString();
    const url = apiUrl(`/export/${format}${qs ? `?${qs}` : ""}`);
    setBusy(true);
    // Probe with HEAD-ish fetch so we can fail fast and toast instead of a
    // silent browser download of an error body.
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        window.open(url, "_blank");
        reset();
      })
      .catch((err) => {
        toast.error(err.message || "Export failed — is the backend running?");
      })
      .finally(() => setBusy(false));
  };

  const scopeLabel = {
    all: "All time",
    month: month ? monthLabel(month) : "a month",
    range:
      from && to
        ? `${formatDate(from)} → ${formatDate(to)}`
        : from
        ? `From ${formatDate(from)} onward`
        : to
        ? `Until ${formatDate(to)}`
        : "Custom date range",
  };

  return (
    <>
      {React.cloneElement(trigger, { onClick: () => setOpen(true) })}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClose={reset}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Download className="h-4 w-4" /> Export expenses
            </DialogTitle>
            <DialogDescription>
              Excel produces the stacked “Expense Table : MM/YYYY” sheet — each
              month its own headline + TOTAL, the same layout as your expenditure
              files. CSV is a flat data dump.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Format */}
            <div className="grid grid-cols-2 gap-2">
              <FormatCard
                active={format === "excel"}
                onClick={() => setFormat("excel")}
                icon={<FileSpreadsheet className="h-4 w-4" />}
                title="Excel"
                subtitle="Monthly blocks"
              />
              <FormatCard
                active={format === "csv"}
                onClick={() => setFormat("csv")}
                icon={<Rows3 className="h-4 w-4" />}
                title="CSV"
                subtitle="Flat rows"
              />
            </div>

            {/* Scope */}
            <div>
              <Label>Scope</Label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted p-1">
                {(["all", "month", "range"] as Scope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      scope === s
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s === "all" ? "All time" : s === "month" ? "Pick a month" : "Date range"}
                  </button>
                ))}
              </div>
            </div>

            {/* Month dropdown */}
            {scope === "month" && (
              <div>
                <Label>Month</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a month" />
                  </SelectTrigger>
                  <SelectContent className="max-h-40 min-w-[240px]">
                    {monthsQuery.isLoading && (
                      <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                      </div>
                    )}
                    {!monthsQuery.isLoading &&
                      monthsQuery.data?.map((ym) => (
                        <SelectItem key={ym} value={ym}>
                          {monthLabel(ym)}
                        </SelectItem>
                      ))}
                    {!monthsQuery.isLoading && monthsQuery.data?.length === 0 && (
                      <div className="p-3 text-xs text-muted-foreground">No expenses yet</div>
                    )}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Current or any past month — future months are not available.
                </p>
              </div>
            )}

            {/* Custom range */}
            {scope === "range" && (
              <div>
                <Label>Date range</Label>
                <div className="flex items-center gap-2">
                  <DateInput className="w-[150px] shrink-0" value={from} onChange={setFrom} max={to || todayISO()} placeholder="From" />
                  <span className="shrink-0 text-muted-foreground">→</span>
                  <DateInput className="w-[150px] shrink-0" value={to} onChange={setTo} max={todayISO()} min={from || undefined} placeholder="To" />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Inclusive. Leave a side blank to go open-ended (e.g. “from 01/01/2026 onward”).
                </p>
              </div>
            )}

            {/* Summary */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              <span className="shrink-0 text-muted-foreground">Export</span>
              <span className="truncate text-right font-medium">
                {format === "excel" ? "batua_expenditure.xlsx" : "batua_transactions.csv"} · {scopeLabel[scope]}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={reset} data-testid="export-cancel">
              Cancel
            </Button>
            <Button size="sm" onClick={doDownload} disabled={busy} className="gap-2" data-testid="export-download">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</div>;
}

function FormatCard({ active, onClick, icon, title, subtitle }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/30"
          : "border-border bg-card hover:bg-accent/50"
      )}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
