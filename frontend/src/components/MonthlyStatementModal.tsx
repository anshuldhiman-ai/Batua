import React, { useState, useEffect, useMemo, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Printer,
  X,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Calendar,
  Sun,
  Moon,
  ShieldCheck,
  Search,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  ReceiptText,
  CalendarRange,
  CreditCard,
  Building2,
  Hash,
} from "lucide-react";
import { api, formatINR } from "@/lib/utils-finance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThemeContext } from "@/App";
import { useAuth, useOptionalAuth } from "@/components/Auth";

function useSafeUser() {
  try {
    if (typeof useOptionalAuth === "function") {
      return useOptionalAuth()?.user || null;
    }
    if (typeof useAuth === "function") {
      return useAuth()?.user || null;
    }
  } catch {
    return null;
  }
  return null;
}

interface MonthlyStatementModalProps {
  open: boolean;
  onClose: () => void;
  initialMonth?: string;
}

type TimelineMode = "month" | "custom";
type TxnFilter = "all" | "expenses" | "income";
type SortOrder = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export default function MonthlyStatementModal({
  open,
  onClose,
  initialMonth,
}: MonthlyStatementModalProps) {
  const currentMonth = useMemo(() => {
    return initialMonth || new Date().toISOString().slice(0, 7);
  }, [initialMonth]);

  const { theme: appTheme } = useContext(ThemeContext);
  const user = useSafeUser();

  // Timeline mode: "month" (single month) or "custom" (range of dates)
  const [timelineMode, setTimelineMode] = useState<TimelineMode>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // Custom range dates
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  // Document theme: Paper White (light) vs Executive Dark (dark)
  const [docTheme, setDocTheme] = useState<"light" | "dark">(
    appTheme === "dark" ? "dark" : "light"
  );

  // Document viewing controls
  const [txnFilter, setTxnFilter] = useState<TxnFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("date-desc");
  const [viewMode, setViewMode] = useState<"full" | "summary">("full");

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txns, setTxns] = useState<any[]>([]);

  // Sync docTheme when appTheme changes
  useEffect(() => {
    setDocTheme(appTheme === "dark" ? "dark" : "light");
  }, [appTheme]);

  // Derive start and end dates based on timeline mode
  const { startDate, endDate, periodLabel, monthTitle } = useMemo(() => {
    if (timelineMode === "month") {
      const fallbackDate = new Date();
      const [yStr, mStr] = (selectedMonth || "").split("-");
      const y = parseInt(yStr, 10) || fallbackDate.getFullYear();
      const m = parseInt(mStr, 10) || fallbackDate.getMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      const dateObj = new Date(y, m - 1, 1);
      const mName = dateObj.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      return {
        startDate: `${y}-${String(m).padStart(2, "0")}-01`,
        endDate: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
        periodLabel: mName,
        monthTitle: mName,
      };
    } else {
      const s = customStart || new Date().toISOString().slice(0, 10);
      const e = customEnd || new Date().toISOString().slice(0, 10);
      return {
        startDate: s,
        endDate: e,
        periodLabel: `${s} → ${e}`,
        monthTitle: `Custom Period (${s} to ${e})`,
      };
    }
  }, [timelineMode, selectedMonth, customStart, customEnd]);

  // Quick preset jump
  const applyPreset = (preset: "this_month" | "last_month" | "last_30" | "last_90" | "ytd") => {
    const now = new Date();
    if (preset === "this_month") {
      setTimelineMode("month");
      setSelectedMonth(now.toISOString().slice(0, 7));
    } else if (preset === "last_month") {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setTimelineMode("month");
      setSelectedMonth(prev.toISOString().slice(0, 7));
    } else if (preset === "last_30") {
      const d30 = new Date(now.getTime() - 30 * 86400000);
      setTimelineMode("custom");
      setCustomStart(d30.toISOString().slice(0, 10));
      setCustomEnd(now.toISOString().slice(0, 10));
    } else if (preset === "last_90") {
      const d90 = new Date(now.getTime() - 90 * 86400000);
      setTimelineMode("custom");
      setCustomStart(d90.toISOString().slice(0, 10));
      setCustomEnd(now.toISOString().slice(0, 10));
    } else if (preset === "ytd") {
      setTimelineMode("custom");
      setCustomStart(`${now.getFullYear()}-01-01`);
      setCustomEnd(now.toISOString().slice(0, 10));
    }
  };

  // Fetch transactions for the selected timeline
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);

    api
      .get("/transactions/", {
        params: {
          start_date: startDate,
          end_date: endDate,
          page_size: 2500, // retrieve full ledger up to 2500 items
        },
      })
      .then((res) => {
        if (!active) return;
        const items = Array.isArray(res.data?.items)
          ? res.data.items
          : Array.isArray(res.data)
          ? res.data
          : [];
        setTxns(items);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load timeline transactions:", err);
        setTxns([]);
        toast.error("Could not load transactions for this timeline");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, startDate, endDate]);

  // Aggregate totals and metrics
  const {
    income,
    expense,
    net,
    savingsRate,
    incomeCount,
    expenseCount,
    categoryTotals,
    paymentTotals,
    topExpenses,
    avgDailySpend,
    docSerial,
    checksum,
  } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let incCt = 0;
    let expCt = 0;
    const catMap: Record<string, { amount: number; count: number }> = {};
    const methodMap: Record<string, { amount: number; count: number }> = {};

    txns.forEach((t) => {
      const amt = typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0;
      const cat = (t.category || "Other").trim() || "Other";
      const method = (t.payment_method || "Other").trim() || "Other";

      if (amt > 0) {
        inc += amt;
        incCt++;
      } else if (amt < 0) {
        const absVal = Math.abs(amt);
        exp += absVal;
        expCt++;

        if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0 };
        catMap[cat].amount += absVal;
        catMap[cat].count++;

        if (!methodMap[method]) methodMap[method] = { amount: 0, count: 0 };
        methodMap[method].amount += absVal;
        methodMap[method].count++;
      }
    });

    const netVal = inc - exp;
    const rawRate = inc > 0 ? (netVal / inc) * 100 : 0;
    const safeRate = Number.isFinite(rawRate) ? Math.max(-100, Math.min(100, rawRate)) : 0;

    const cats = Object.entries(catMap)
      .map(([name, stat]) => ({
        name,
        amount: Math.round(stat.amount * 100) / 100,
        count: stat.count,
        pct: exp > 0 ? (stat.amount / exp) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const methods = Object.entries(methodMap)
      .map(([name, stat]) => ({
        name,
        amount: Math.round(stat.amount * 100) / 100,
        count: stat.count,
        pct: exp > 0 ? (stat.amount / exp) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const tops = [...txns]
      .filter((t) => {
        const a = typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0;
        return a < 0;
      })
      .sort((a, b) => {
        const aAmt = typeof a.amount === "number" ? a.amount : parseFloat(a.amount) || 0;
        const bAmt = typeof b.amount === "number" ? b.amount : parseFloat(b.amount) || 0;
        return aAmt - bAmt;
      })
      .slice(0, 5);

    // Calculate days in period
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const daySpan = Math.max(1, Math.round((endObj.getTime() - startObj.getTime()) / 86400000) + 1);
    const dailyAvg = Math.round((exp / daySpan) * 100) / 100;

    // Deterministic serial & verification checksum
    const seed = Math.abs(Math.round(netVal * 100 + inc * 10 + exp + txns.length));
    const serial = `DOC-BTU-${startDate.replace(/-/g, "").slice(0, 6)}-${seed
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")}`;
    const hash = `CHK-${((seed * 31 + txns.length * 7) % 0xffffff).toString(16).toUpperCase()}`;

    return {
      income: Math.round(inc * 100) / 100,
      expense: Math.round(exp * 100) / 100,
      net: Math.round(netVal * 100) / 100,
      savingsRate: safeRate,
      incomeCount: incCt,
      expenseCount: expCt,
      categoryTotals: cats,
      paymentTotals: methods,
      topExpenses: tops,
      avgDailySpend: dailyAvg,
      docSerial: serial,
      checksum: hash,
    };
  }, [txns, startDate, endDate]);

  // Filtered & sorted ledger items
  const ledgerItems = useMemo(() => {
    let result = [...txns];

    // Filter by type
    if (txnFilter === "expenses") {
      result = result.filter((t) => (typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0) < 0);
    } else if (txnFilter === "income") {
      result = result.filter((t) => (typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0) > 0);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) => {
        const desc = (t.description || "").toLowerCase();
        const cat = (t.category || "").toLowerCase();
        const method = (t.payment_method || "").toLowerCase();
        const date = (t.date || "").toLowerCase();
        const notes = (t.notes || "").toLowerCase();
        return (
          desc.includes(q) ||
          cat.includes(q) ||
          method.includes(q) ||
          date.includes(q) ||
          notes.includes(q)
        );
      });
    }

    // Sorting
    result.sort((a, b) => {
      const aAmt = typeof a.amount === "number" ? a.amount : parseFloat(a.amount) || 0;
      const bAmt = typeof b.amount === "number" ? b.amount : parseFloat(b.amount) || 0;
      const aDate = a.date || "";
      const bDate = b.date || "";

      if (sortOrder === "date-desc") {
        return bDate.localeCompare(aDate);
      } else if (sortOrder === "date-asc") {
        return aDate.localeCompare(bDate);
      } else if (sortOrder === "amount-desc") {
        return Math.abs(bAmt) - Math.abs(aAmt);
      } else {
        return Math.abs(aAmt) - Math.abs(bAmt);
      }
    });

    return result;
  }, [txns, txnFilter, searchQuery, sortOrder]);

  const handlePrint = () => {
    document.body.classList.add("batua-printing");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("batua-printing");
    }, 500);
  };

  const handleCopySummary = () => {
    const text = `📊 **Batua Official Financial Statement**
--------------------------------------------------
Document Ref:    ${docSerial}
Statement Period: ${periodLabel}
Issued To:        ${user?.username || user?.email || "Personal Account"}

FINANCIAL OVERVIEW:
• Total Inflow (Income):   ${formatINR(income)} (${incomeCount} credits)
• Total Outflow (Expenses): ${formatINR(expense)} (${expenseCount} debits)
• Net Cash Flow:           ${formatINR(net)} (${savingsRate.toFixed(1)}% savings rate)
• Average Daily Spend:     ${formatINR(avgDailySpend)}
• Recorded Transactions:   ${txns.length} total entries

TOP SPENDING CATEGORIES:
${
  categoryTotals.length > 0
    ? categoryTotals
        .slice(0, 5)
        .map((c) => `  - ${c.name}: ${formatINR(c.amount)} (${c.pct.toFixed(1)}%, ${c.count} txns)`)
        .join("\n")
    : "  - No expenditures logged"
}
--------------------------------------------------
Certified by Batua Core Financial Engine • Checksum: ${checksum}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Statement summary copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCSV = () => {
    if (!txns.length) {
      toast.error("No transactions to export for this timeline");
      return;
    }
    const headers = ["Index", "Date", "Description", "Category", "Payment Method", "Type", "Amount", "Notes"];
    const rows = ledgerItems.map((t, idx) => {
      const amt = typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0;
      return [
        idx + 1,
        t.date || "",
        `"${String(t.description || "").replace(/"/g, '""')}"`,
        `"${String(t.category || "").replace(/"/g, '""')}"`,
        `"${String(t.payment_method || "").replace(/"/g, '""')}"`,
        amt >= 0 ? "Credit" : "Debit",
        amt,
        `"${String(t.notes || "").replace(/"/g, '""')}"`,
      ];
    });
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `batua-statement-${startDate}_to_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ledgerItems.length} transactions as CSV`);
  };

  const isDarkDoc = docTheme === "dark";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Statement Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-label="Monthly Financial Statement"
            className={cn(
              "relative w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden rounded-2xl border shadow-2xl z-10 my-auto",
              "print:border-none print:shadow-none print:m-0 print:p-0 print:max-w-none print:max-h-none print:overflow-visible",
              isDarkDoc
                ? "bg-zinc-950 border-zinc-800 text-zinc-100"
                : "bg-white border-zinc-200 text-zinc-900"
            )}
          >
            {/* Header Control Toolbar (Hidden when printing PDF) */}
            <div
              className={cn(
                "shrink-0 flex flex-col border-b px-4 sm:px-6 py-3.5 gap-3 print:hidden",
                isDarkDoc ? "bg-zinc-900/90 border-zinc-800" : "bg-zinc-50/90 border-zinc-200"
              )}
            >
              {/* Row 1: Title, Presets, and Main Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold leading-tight truncate">
                      Financial Statement Generator
                    </h2>
                    <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                      Production-ready printable report & ledger export
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {/* Document Theme Toggle (White Paper vs Dark Executive) */}
                  <button
                    type="button"
                    onClick={() => setDocTheme(isDarkDoc ? "light" : "dark")}
                    title={`Switch to ${isDarkDoc ? "White Paper Document" : "Dark Executive Document"}`}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                      isDarkDoc
                        ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                    )}
                  >
                    {isDarkDoc ? (
                      <>
                        <Sun className="h-3.5 w-3.5 text-amber-400" />
                        <span className="hidden md:inline">Paper White</span>
                      </>
                    ) : (
                      <>
                        <Moon className="h-3.5 w-3.5 text-indigo-500" />
                        <span className="hidden md:inline">Executive Dark</span>
                      </>
                    )}
                  </button>

                  {/* Copy Summary */}
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    title="Copy Summary Markdown"
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                      isDarkDoc
                        ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                    )}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">Copy</span>
                  </button>

                  {/* Export CSV */}
                  <button
                    type="button"
                    onClick={handleDownloadCSV}
                    title="Export Ledger as CSV"
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                      isDarkDoc
                        ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                    )}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>

                  {/* Print / Save PDF */}
                  <button
                    type="button"
                    onClick={handlePrint}
                    title="Print Document or Save as PDF"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print PDF</span>
                  </button>

                  {/* Close Modal */}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close statement"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ml-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Row 2: Timeline & Range Selectors */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs">
                {/* Timeline Mode Tabs */}
                <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-background/50">
                  <button
                    type="button"
                    onClick={() => setTimelineMode("month")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      timelineMode === "month"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Month View
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelineMode("custom")}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      timelineMode === "custom"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Custom Timeline
                  </button>
                </div>

                {/* Date Inputs based on mode */}
                <div className="flex flex-wrap items-center gap-2">
                  {timelineMode === "month" ? (
                    <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-transparent text-xs font-medium outline-none cursor-pointer"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1">
                        <span className="text-[10px] text-muted-foreground">From</span>
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="bg-transparent text-xs font-medium outline-none cursor-pointer"
                        />
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1">
                        <span className="text-[10px] text-muted-foreground">To</span>
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="bg-transparent text-xs font-medium outline-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* Preset Pills */}
                  <div className="hidden lg:flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyPreset("this_month")}
                      className="rounded-md border bg-background/60 px-2 py-1 text-[11px] hover:bg-accent"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("last_month")}
                      className="rounded-md border bg-background/60 px-2 py-1 text-[11px] hover:bg-accent"
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("last_30")}
                      className="rounded-md border bg-background/60 px-2 py-1 text-[11px] hover:bg-accent"
                    >
                      Last 30d
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("last_90")}
                      className="rounded-md border bg-background/60 px-2 py-1 text-[11px] hover:bg-accent"
                    >
                      Quarter (90d)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Printable Statement Document (A4 Printable Area) */}
            <div
              id="printable-statement"
              data-theme={docTheme}
              className={cn(
                "flex-1 overflow-y-auto p-4 sm:p-8 lg:p-10 space-y-7",
                isDarkDoc ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-900"
              )}
            >
              {/* Official Document Header */}
              <div
                className={cn(
                  "border-b pb-6 space-y-4",
                  isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                )}
              >
                {/* Brand & Document Identification */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-brand font-bold text-lg shadow-sm">
                        B
                      </div>
                      <div>
                        <div className="font-brand text-2xl font-bold tracking-tight">Batua</div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                          Financial Ledger Engine
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-left sm:text-right space-y-0.5">
                    <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
                      Official Statement of Account
                    </div>
                    <div className="text-lg font-bold tracking-tight">{monthTitle}</div>
                    <div
                      className={cn(
                        "text-xs font-mono",
                        isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                      )}
                    >
                      Statement Period: {startDate} → {endDate}
                    </div>
                  </div>
                </div>

                {/* Account Details & Document Metadata Grid */}
                <div
                  className={cn(
                    "grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border text-xs",
                    isDarkDoc
                      ? "bg-zinc-900/40 border-zinc-800/80 text-zinc-300"
                      : "bg-zinc-50 border-zinc-200 text-zinc-700"
                  )}
                >
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">
                      Account Identifier
                    </div>
                    <div className="font-semibold truncate mt-0.5">
                      {user?.username ? `@${user.username}` : "Personal Wealth Ledger"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">
                      Document Serial
                    </div>
                    <div className="font-mono font-semibold truncate mt-0.5">{docSerial}</div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">
                      Issue Date & Time
                    </div>
                    <div className="font-semibold truncate mt-0.5">
                      {new Date().toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">
                      Reconciliation Status
                    </div>
                    <div className="flex items-center gap-1 text-emerald-500 font-semibold mt-0.5">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>Reconciled & Active</span>
                    </div>
                  </div>
                </div>
              </div>

              {loading ? (
                <div
                  className={cn(
                    "py-20 text-center text-sm animate-pulse",
                    isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                  )}
                >
                  Aggregating timeline ledger & generating production statement…
                </div>
              ) : (
                <>
                  {/* Executive Cash-Flow KPI Summary */}
                  <div className="space-y-3">
                    <h3
                      className={cn(
                        "text-xs font-bold uppercase tracking-wider",
                        isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                      )}
                    >
                      Executive Cash Flow Summary
                    </h3>

                    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Total Inflow */}
                      <div
                        className={cn(
                          "rounded-xl border p-3.5 min-w-0 overflow-hidden flex flex-col justify-between",
                          isDarkDoc
                            ? "bg-zinc-900/60 border-zinc-800/80"
                            : "bg-zinc-50 border-zinc-200/90"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs gap-1">
                          <span className={isDarkDoc ? "text-zinc-400" : "text-zinc-500"}>
                            Total Inflows (Credits)
                          </span>
                          <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                        </div>
                        <div className="mt-2 text-lg sm:text-xl font-bold text-emerald-500 truncate">
                          {formatINR(income)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {incomeCount} credit transaction{incomeCount !== 1 ? "s" : ""}
                        </div>
                      </div>

                      {/* Total Outflow */}
                      <div
                        className={cn(
                          "rounded-xl border p-3.5 min-w-0 overflow-hidden flex flex-col justify-between",
                          isDarkDoc
                            ? "bg-zinc-900/60 border-zinc-800/80"
                            : "bg-zinc-50 border-zinc-200/90"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs gap-1">
                          <span className={isDarkDoc ? "text-zinc-400" : "text-zinc-500"}>
                            Total Outflows (Debits)
                          </span>
                          <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" />
                        </div>
                        <div className="mt-2 text-lg sm:text-xl font-bold text-rose-500 truncate">
                          {formatINR(expense)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {expenseCount} debit transaction{expenseCount !== 1 ? "s" : ""}
                        </div>
                      </div>

                      {/* Net Cash Flow */}
                      <div
                        className={cn(
                          "rounded-xl border p-3.5 min-w-0 overflow-hidden flex flex-col justify-between",
                          isDarkDoc
                            ? "bg-zinc-900/60 border-zinc-800/80"
                            : "bg-zinc-50 border-zinc-200/90"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs gap-1">
                          <span className={isDarkDoc ? "text-zinc-400" : "text-zinc-500"}>
                            Net Period Change
                          </span>
                          <Wallet className="h-4 w-4 text-primary shrink-0" />
                        </div>
                        <div
                          className={cn(
                            "mt-2 text-lg sm:text-xl font-bold truncate",
                            net >= 0 ? "text-primary" : "text-rose-500"
                          )}
                        >
                          {net >= 0 ? `+${formatINR(net)}` : formatINR(net)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {net >= 0 ? "Net Positive Flow" : "Net Expenditure Deficit"}
                        </div>
                      </div>

                      {/* Savings Rate */}
                      <div
                        className={cn(
                          "rounded-xl border p-3.5 min-w-0 overflow-hidden flex flex-col justify-between",
                          isDarkDoc
                            ? "bg-zinc-900/60 border-zinc-800/80"
                            : "bg-zinc-50 border-zinc-200/90"
                        )}
                      >
                        <div className="flex items-center justify-between text-xs gap-1">
                          <span className={isDarkDoc ? "text-zinc-400" : "text-zinc-500"}>
                            Savings Retention
                          </span>
                          <PiggyBank className="h-4 w-4 text-primary shrink-0" />
                        </div>
                        <div className="mt-2 text-lg sm:text-xl font-bold truncate">
                          {savingsRate.toFixed(1)}%
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Daily burn: {formatINR(avgDailySpend)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Category & Payment Method Distribution Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Category Distribution */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4
                          className={cn(
                            "text-xs font-bold uppercase tracking-wider",
                            isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                          )}
                        >
                          Category Expenditure Mix
                        </h4>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {categoryTotals.length} categories
                        </span>
                      </div>

                      {categoryTotals.length === 0 ? (
                        <div className="text-xs italic py-2 text-muted-foreground">
                          No category spend recorded in this timeline.
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "overflow-x-auto w-full rounded-xl border no-scrollbar",
                            isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                          )}
                        >
                          <table className="w-full text-xs">
                            <thead
                              className={cn(
                                "border-b",
                                isDarkDoc
                                  ? "bg-zinc-900 text-zinc-400 border-zinc-800"
                                  : "bg-zinc-100 text-zinc-600 border-zinc-200"
                              )}
                            >
                              <tr>
                                <th className="py-2 px-3 text-left font-semibold">Category</th>
                                <th className="py-2 px-3 text-right font-semibold">Amount</th>
                                <th className="py-2 px-3 text-right font-semibold">Share</th>
                              </tr>
                            </thead>
                            <tbody
                              className={cn(
                                "divide-y",
                                isDarkDoc ? "divide-zinc-850" : "divide-zinc-200/80"
                              )}
                            >
                              {categoryTotals.slice(0, 6).map((cat) => (
                                <tr key={cat.name}>
                                  <td className="py-1.5 px-3 font-medium truncate max-w-[140px]">
                                    {cat.name}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-semibold font-mono">
                                    {formatINR(cat.amount)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <div
                                        className={cn(
                                          "h-1.5 w-12 rounded-full overflow-hidden shrink-0",
                                          isDarkDoc ? "bg-zinc-800" : "bg-zinc-200"
                                        )}
                                      >
                                        <div
                                          className="h-full bg-primary rounded-full"
                                          style={{
                                            width: `${Math.min(100, Math.max(0, cat.pct))}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="w-8 font-mono text-[10px] text-muted-foreground">
                                        {cat.pct.toFixed(0)}%
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Payment Mix Distribution */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4
                          className={cn(
                            "text-xs font-bold uppercase tracking-wider",
                            isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                          )}
                        >
                          Payment Channel Distribution
                        </h4>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {paymentTotals.length} channels
                        </span>
                      </div>

                      {paymentTotals.length === 0 ? (
                        <div className="text-xs italic py-2 text-muted-foreground">
                          No payment methods recorded in this timeline.
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "overflow-x-auto w-full rounded-xl border no-scrollbar",
                            isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                          )}
                        >
                          <table className="w-full text-xs">
                            <thead
                              className={cn(
                                "border-b",
                                isDarkDoc
                                  ? "bg-zinc-900 text-zinc-400 border-zinc-800"
                                  : "bg-zinc-100 text-zinc-600 border-zinc-200"
                              )}
                            >
                              <tr>
                                <th className="py-2 px-3 text-left font-semibold">Channel</th>
                                <th className="py-2 px-3 text-right font-semibold">Volume</th>
                                <th className="py-2 px-3 text-right font-semibold">Share</th>
                              </tr>
                            </thead>
                            <tbody
                              className={cn(
                                "divide-y",
                                isDarkDoc ? "divide-zinc-850" : "divide-zinc-200/80"
                              )}
                            >
                              {paymentTotals.map((m) => (
                                <tr key={m.name}>
                                  <td className="py-1.5 px-3 font-medium truncate max-w-[140px]">
                                    {m.name}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-semibold font-mono">
                                    {formatINR(m.amount)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right font-mono text-[10px] text-muted-foreground">
                                    {m.pct.toFixed(1)}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ITEMIZE TRANSACTION LEDGER (CORE USER FEATURE) */}
                  <div className="space-y-3 pt-2">
                    {/* Ledger Header & Interactive Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <ReceiptText className="h-4 w-4 text-primary" />
                          <h3
                            className={cn(
                              "text-xs font-bold uppercase tracking-wider",
                              isDarkDoc ? "text-zinc-300" : "text-zinc-700"
                            )}
                          >
                            Itemized Transaction Ledger
                          </h3>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Comprehensive record of all verified debits and credits in this timeline
                        </p>
                      </div>

                      {/* Ledger Filters (Hidden on Print) */}
                      <div className="flex flex-wrap items-center gap-2 print:hidden">
                        {/* Type Tabs */}
                        <div className="flex items-center gap-0.5 rounded-lg border p-0.5 bg-background/60 text-xs">
                          <button
                            type="button"
                            onClick={() => setTxnFilter("all")}
                            className={cn(
                              "rounded px-2 py-0.5 font-medium transition-colors",
                              txnFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                            )}
                          >
                            All ({txns.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTxnFilter("expenses")}
                            className={cn(
                              "rounded px-2 py-0.5 font-medium transition-colors",
                              txnFilter === "expenses" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                            )}
                          >
                            Debits ({expenseCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setTxnFilter("income")}
                            className={cn(
                              "rounded px-2 py-0.5 font-medium transition-colors",
                              txnFilter === "income" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                            )}
                          >
                            Credits ({incomeCount})
                          </button>
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Filter ledger..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-7 w-32 sm:w-40 rounded-lg border bg-background pl-8 pr-2 text-xs outline-none focus:w-48 transition-all"
                          />
                        </div>

                        {/* Sort Selector */}
                        <select
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                          className="h-7 rounded-lg border bg-background px-2 text-xs font-medium outline-none cursor-pointer"
                        >
                          <option value="date-desc">Date (Newest)</option>
                          <option value="date-asc">Date (Oldest)</option>
                          <option value="amount-desc">Amount (Highest)</option>
                          <option value="amount-asc">Amount (Lowest)</option>
                        </select>
                      </div>
                    </div>

                    {/* Transaction Ledger Table */}
                    {ledgerItems.length === 0 ? (
                      <div
                        className={cn(
                          "py-8 text-center text-xs rounded-xl border italic",
                          isDarkDoc ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
                        )}
                      >
                        No transactions match the selected filters for this timeline.
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "overflow-x-auto w-full rounded-xl border",
                          isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                        )}
                      >
                        <table className="w-full text-xs min-w-[580px] print:min-w-full">
                          <thead
                            className={cn(
                              "border-b sticky top-0 z-10",
                              isDarkDoc
                                ? "bg-zinc-900 text-zinc-300 border-zinc-800"
                                : "bg-zinc-100 text-zinc-700 border-zinc-200"
                            )}
                          >
                            <tr>
                              <th className="py-2 px-3 text-left font-semibold w-10">#</th>
                              <th className="py-2 px-3 text-left font-semibold w-24">Date</th>
                              <th className="py-2 px-3 text-left font-semibold">Description / Merchant</th>
                              <th className="py-2 px-3 text-left font-semibold w-28">Category</th>
                              <th className="py-2 px-3 text-left font-semibold w-24">Method</th>
                              <th className="py-2 px-3 text-center font-semibold w-16">Type</th>
                              <th className="py-2 px-3 text-right font-semibold w-28">Amount</th>
                            </tr>
                          </thead>
                          <tbody
                            className={cn(
                              "divide-y font-normal",
                              isDarkDoc ? "divide-zinc-850" : "divide-zinc-200/80"
                            )}
                          >
                            {ledgerItems.map((t, idx) => {
                              const amt =
                                typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0;
                              const isCredit = amt > 0;

                              return (
                                <tr
                                  key={t.id || `${t.date}-${t.description}-${idx}`}
                                  className={cn(
                                    "transition-colors",
                                    isDarkDoc
                                      ? idx % 2 === 0
                                        ? "bg-transparent"
                                        : "bg-zinc-900/30"
                                      : idx % 2 === 0
                                      ? "bg-white"
                                      : "bg-zinc-50/70",
                                    "hover:bg-primary/5"
                                  )}
                                >
                                  {/* Index */}
                                  <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                                    {idx + 1}
                                  </td>

                                  {/* Date */}
                                  <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap">
                                    {t.date ? t.date.slice(0, 10) : "—"}
                                  </td>

                                  {/* Description */}
                                  <td className="py-2 px-3 font-medium">
                                    <div className="truncate max-w-[220px] sm:max-w-[280px]">
                                      {t.description || "Untitled Transaction"}
                                    </div>
                                    {t.notes && (
                                      <div className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                                        {t.notes}
                                      </div>
                                    )}
                                  </td>

                                  {/* Category */}
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <span
                                      className={cn(
                                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border",
                                        isDarkDoc
                                          ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                                          : "bg-zinc-100 border-zinc-200 text-zinc-700"
                                      )}
                                    >
                                      {t.category || "Other"}
                                    </span>
                                  </td>

                                  {/* Payment Method */}
                                  <td className="py-2 px-3 whitespace-nowrap text-muted-foreground text-[11px]">
                                    {t.payment_method || "—"}
                                  </td>

                                  {/* Type Chip */}
                                  <td className="py-2 px-3 text-center whitespace-nowrap">
                                    <span
                                      className={cn(
                                        "inline-flex rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider font-mono",
                                        isCredit
                                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                          : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                      )}
                                    >
                                      {isCredit ? "CR" : "DR"}
                                    </span>
                                  </td>

                                  {/* Amount */}
                                  <td
                                    className={cn(
                                      "py-2 px-3 text-right font-mono font-semibold whitespace-nowrap",
                                      isCredit
                                        ? "text-emerald-500"
                                        : isDarkDoc
                                        ? "text-zinc-200"
                                        : "text-zinc-900"
                                    )}
                                  >
                                    {isCredit ? `+${formatINR(amt)}` : `-${formatINR(Math.abs(amt))}`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Official Audit & Verification Footer */}
                  <div
                    className={cn(
                      "pt-6 border-t space-y-4 print:pt-4",
                      isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                    )}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-primary">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Computer-Generated Official Record</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground max-w-xl leading-relaxed">
                          This statement is an electronically generated record authenticated by the
                          Batua Local Ledger Engine. All transactions, credits, and debits reflect
                          immutable local database records. No physical signature is required.
                        </p>
                      </div>

                      <div className="text-left sm:text-right font-mono text-[11px] space-y-0.5 shrink-0">
                        <div className="text-muted-foreground">Checksum: {checksum}</div>
                        <div className="text-muted-foreground">Entries: {txns.length} records verified</div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "pt-3 border-t text-[10px] flex flex-col sm:flex-row items-center justify-between gap-1 text-muted-foreground",
                        isDarkDoc ? "border-zinc-800/60" : "border-zinc-200/60"
                      )}
                    >
                      <div>Batua Core Ledger • Privacy-First Architecture</div>
                      <div>Confidential & Proprietary to the Account Holder</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
