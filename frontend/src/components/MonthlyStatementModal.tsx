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
} from "lucide-react";
import { api, formatINR } from "@/lib/utils-finance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThemeContext } from "@/App";

interface MonthlyStatementModalProps {
  open: boolean;
  onClose: () => void;
  initialMonth?: string;
}

export default function MonthlyStatementModal({
  open,
  onClose,
  initialMonth,
}: MonthlyStatementModalProps) {
  const currentMonth = useMemo(() => {
    return initialMonth || new Date().toISOString().slice(0, 7);
  }, [initialMonth]);

  const { theme: appTheme } = useContext(ThemeContext);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  // docTheme defaults to app theme, but user can explicitly toggle White Paper vs Dark Native
  const [docTheme, setDocTheme] = useState<"light" | "dark">(
    appTheme === "dark" ? "dark" : "light"
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txns, setTxns] = useState<any[]>([]);

  // Sync docTheme when appTheme changes if user hasn't explicitly diverged
  useEffect(() => {
    setDocTheme(appTheme === "dark" ? "dark" : "light");
  }, [appTheme]);

  // Calculate start and end date for selected month safely
  const { startDate, endDate, monthName } = useMemo(() => {
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
      monthName: mName,
    };
  }, [selectedMonth]);

  // Fetch month transactions
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);

    api
      .get("/transactions/", {
        params: {
          start_date: startDate,
          end_date: endDate,
          page_size: 500,
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
        console.error("Failed to load month transactions:", err);
        setTxns([]);
        toast.error("Could not load transactions for this month");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, startDate, endDate]);

  // Compute month totals with robust numeric parsing & safety guards
  const { income, expense, net, savingsRate, categoryTotals, topExpenses } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const catMap: Record<string, number> = {};

    txns.forEach((t) => {
      const amt = typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0;
      if (amt > 0) {
        inc += amt;
      } else if (amt < 0) {
        const absVal = Math.abs(amt);
        exp += absVal;
        const cat = (t.category || "Other").trim() || "Other";
        catMap[cat] = (catMap[cat] || 0) + absVal;
      }
    });

    const netVal = inc - exp;
    const rawRate = inc > 0 ? (netVal / inc) * 100 : 0;
    const safeRate = Number.isFinite(rawRate) ? Math.max(-100, Math.min(100, rawRate)) : 0;

    const cats = Object.entries(catMap)
      .map(([name, amount]) => ({
        name,
        amount,
        pct: exp > 0 ? (amount / exp) * 100 : 0,
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
        return aAmt - bAmt; // Most negative first
      })
      .slice(0, 5);

    return {
      income: Math.round(inc * 100) / 100,
      expense: Math.round(exp * 100) / 100,
      net: Math.round(netVal * 100) / 100,
      savingsRate: safeRate,
      categoryTotals: cats,
      topExpenses: tops,
    };
  }, [txns]);

  const handlePrint = () => {
    document.body.classList.add("batua-printing");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("batua-printing");
    }, 500);
  };

  const handleCopySummary = () => {
    const text = `📊 **Batua Financial Statement — ${monthName}**
--------------------------------------------------
• Total Income:   ${formatINR(income)}
• Total Expenses: ${formatINR(expense)}
• Net Savings:    ${formatINR(net)} (${savingsRate.toFixed(1)}%)
• Total Entries:  ${txns.length} transactions

**Top Spending Categories:**
${
  categoryTotals.length > 0
    ? categoryTotals
        .slice(0, 5)
        .map((c) => `  - ${c.name}: ${formatINR(c.amount)} (${c.pct.toFixed(1)}%)`)
        .join("\n")
    : "  - No expenses recorded"
}
--------------------------------------------------
Generated via Batua Smart Finance`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Statement summary copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCSV = () => {
    if (!txns.length) {
      toast.error("No transactions to export for this month");
      return;
    }
    const headers = ["Date", "Description", "Category", "Payment Method", "Amount", "Notes"];
    const rows = txns.map((t) => [
      t.date || "",
      `"${String(t.description || "").replace(/"/g, '""')}"`,
      `"${String(t.category || "").replace(/"/g, '""')}"`,
      `"${String(t.payment_method || "").replace(/"/g, '""')}"`,
      typeof t.amount === "number" ? t.amount : parseFloat(t.amount) || 0,
      `"${String(t.notes || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `batua-statement-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${txns.length} transactions as CSV`);
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

          {/* Statement Container - Fixed height with internal scroll to ensure cards never overflow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-label="Monthly Financial Statement"
            className={cn(
              "relative w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border shadow-2xl z-10 my-auto",
              "print:border-none print:shadow-none print:m-0 print:p-0 print:max-w-none print:max-h-none print:overflow-visible",
              isDarkDoc
                ? "bg-zinc-950 border-zinc-800 text-zinc-100"
                : "bg-white border-zinc-200 text-zinc-900"
            )}
          >
            {/* Header / Action bar (hidden in print) */}
            <div
              className={cn(
                "shrink-0 flex flex-wrap items-center justify-between border-b px-4 sm:px-6 py-3.5 gap-2.5 print:hidden",
                isDarkDoc ? "bg-zinc-900/80 border-zinc-800" : "bg-zinc-50 border-zinc-200"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                <h2 className="text-sm sm:text-base font-semibold truncate">
                  Monthly Financial Statement
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {/* Month Picker */}
                <div className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
                  <Calendar className="h-3.5 w-3.5 opacity-60 shrink-0" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent text-xs font-medium outline-none cursor-pointer"
                  />
                </div>

                {/* Document Theme Toggle (White Paper vs Dark Native) */}
                <button
                  type="button"
                  onClick={() => setDocTheme(isDarkDoc ? "light" : "dark")}
                  title={`Switch to ${isDarkDoc ? "White Document" : "Dark Native Theme"}`}
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
                      <span className="hidden md:inline">White Doc</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="hidden md:inline">Dark Doc</span>
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

                {/* Download CSV */}
                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  title="Export CSV"
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

                {/* Print PDF Button */}
                <button
                  type="button"
                  onClick={handlePrint}
                  title="Print / Save PDF"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print PDF</span>
                </button>

                {/* Close Dialog */}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ml-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Printable Statement Body - Internally scrollable to guarantee responsiveness on all viewport sizes */}
            <div
              id="printable-statement"
              data-theme={docTheme}
              className={cn(
                "flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6",
                isDarkDoc ? "bg-zinc-950 text-zinc-100" : "bg-white text-zinc-900"
              )}
            >
              {/* Statement Brand Header */}
              <div
                className={cn(
                  "flex flex-col sm:flex-row sm:items-start justify-between border-b pb-5 gap-3",
                  isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-brand text-2xl font-bold tracking-tight">Batua</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider",
                        isDarkDoc
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      )}
                    >
                      Monthly Statement
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                    )}
                  >
                    Personal Wealth & Expenditure Record
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-lg font-bold">{monthName}</div>
                  <div
                    className={cn(
                      "text-xs font-mono",
                      isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                    )}
                  >
                    Period: {startDate} → {endDate}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] mt-0.5",
                      isDarkDoc ? "text-zinc-500" : "text-zinc-400"
                    )}
                  >
                    Generated: {new Date().toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </div>
                </div>
              </div>

              {loading ? (
                <div
                  className={cn(
                    "py-16 text-center text-sm animate-pulse",
                    isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                  )}
                >
                  Aggregating monthly financials…
                </div>
              ) : (
                <>
                  {/* KPI Summary Cards - Fully responsive grid that never overflows */}
                  <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Income */}
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
                          Total Income
                        </span>
                        <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                      </div>
                      <div className="mt-2 text-base sm:text-lg font-bold text-emerald-500 truncate">
                        {formatINR(income)}
                      </div>
                    </div>

                    {/* Expenses */}
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
                          Total Expenses
                        </span>
                        <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" />
                      </div>
                      <div className="mt-2 text-base sm:text-lg font-bold text-rose-500 truncate">
                        {formatINR(expense)}
                      </div>
                    </div>

                    {/* Net Savings */}
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
                          Net Savings
                        </span>
                        <Wallet className="h-4 w-4 text-primary shrink-0" />
                      </div>
                      <div
                        className={cn(
                          "mt-2 text-base sm:text-lg font-bold truncate",
                          net >= 0 ? "text-primary" : "text-rose-500"
                        )}
                      >
                        {formatINR(net)}
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
                          Savings Rate
                        </span>
                        <PiggyBank className="h-4 w-4 text-primary shrink-0" />
                      </div>
                      <div className="mt-2 text-base sm:text-lg font-bold truncate">
                        {savingsRate.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Spending Category Breakdown */}
                  <div>
                    <h3
                      className={cn(
                        "text-xs font-bold uppercase tracking-wider mb-2.5",
                        isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                      )}
                    >
                      Category Breakdown
                    </h3>
                    {categoryTotals.length === 0 ? (
                      <div
                        className={cn(
                          "text-xs py-3 italic",
                          isDarkDoc ? "text-zinc-500" : "text-zinc-400"
                        )}
                      >
                        No expense records found for this period.
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "overflow-x-auto w-full max-w-full rounded-xl border no-scrollbar",
                          isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                        )}
                      >
                        <table className="w-full text-xs min-w-[300px]">
                          <thead
                            className={cn(
                              "border-b",
                              isDarkDoc
                                ? "bg-zinc-900 text-zinc-400 border-zinc-800"
                                : "bg-zinc-100 text-zinc-600 border-zinc-200"
                            )}
                          >
                            <tr>
                              <th className="py-2.5 px-3 text-left font-semibold">Category</th>
                              <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                              <th className="py-2.5 px-3 text-right font-semibold">% Share</th>
                            </tr>
                          </thead>
                          <tbody
                            className={cn(
                              "divide-y",
                              isDarkDoc ? "divide-zinc-850" : "divide-zinc-200/80"
                            )}
                          >
                            {categoryTotals.map((cat) => (
                              <tr key={cat.name}>
                                <td className="py-2 px-3 font-medium truncate max-w-[150px]">
                                  {cat.name}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold font-mono">
                                  {formatINR(cat.amount)}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div
                                      className={cn(
                                        "h-1.5 w-14 rounded-full overflow-hidden shrink-0",
                                        isDarkDoc ? "bg-zinc-800" : "bg-zinc-200"
                                      )}
                                    >
                                      <div
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${Math.min(100, Math.max(0, cat.pct))}%` }}
                                      />
                                    </div>
                                    <span className="w-9 font-mono text-[11px] opacity-80 shrink-0">
                                      {cat.pct.toFixed(1)}%
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

                  {/* Top Expenses */}
                  {topExpenses.length > 0 && (
                    <div>
                      <h3
                        className={cn(
                          "text-xs font-bold uppercase tracking-wider mb-2.5",
                          isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                        )}
                      >
                        Largest Individual Outflows
                      </h3>
                      <div
                        className={cn(
                          "overflow-x-auto w-full max-w-full rounded-xl border no-scrollbar",
                          isDarkDoc ? "border-zinc-800" : "border-zinc-200"
                        )}
                      >
                        <table className="w-full text-xs min-w-[360px]">
                          <thead
                            className={cn(
                              "border-b",
                              isDarkDoc
                                ? "bg-zinc-900 text-zinc-400 border-zinc-800"
                                : "bg-zinc-100 text-zinc-600 border-zinc-200"
                            )}
                          >
                            <tr>
                              <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                              <th className="py-2.5 px-3 text-left font-semibold">Description</th>
                              <th className="py-2.5 px-3 text-left font-semibold">Category</th>
                              <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody
                            className={cn(
                              "divide-y",
                              isDarkDoc ? "divide-zinc-850" : "divide-zinc-200/80"
                            )}
                          >
                            {topExpenses.map((t) => (
                              <tr key={t.id || `${t.date}-${t.description}`}>
                                <td
                                  className={cn(
                                    "py-2 px-3 font-mono text-[11px] whitespace-nowrap",
                                    isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                                  )}
                                >
                                  {t.date}
                                </td>
                                <td className="py-2 px-3 font-medium truncate max-w-[180px]">
                                  {t.description || "Untitled"}
                                </td>
                                <td
                                  className={cn(
                                    "py-2 px-3 whitespace-nowrap",
                                    isDarkDoc ? "text-zinc-400" : "text-zinc-500"
                                  )}
                                >
                                  {t.category || "Other"}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-rose-500 font-mono whitespace-nowrap">
                                  {formatINR(Math.abs(t.amount || 0))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Footer Statement */}
                  <div
                    className={cn(
                      "pt-4 border-t flex flex-col sm:flex-row items-center justify-between text-[11px] gap-2",
                      isDarkDoc
                        ? "border-zinc-800 text-zinc-500"
                        : "border-zinc-200 text-zinc-400"
                    )}
                  >
                    <div>Total Activity: {txns.length} ledger operations recorded</div>
                    <div className="italic">Batua Smart Finance — End of Statement</div>
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
