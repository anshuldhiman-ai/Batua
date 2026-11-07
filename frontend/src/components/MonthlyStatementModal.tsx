import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { api, formatINR } from "@/lib/utils-finance";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txns, setTxns] = useState<any[]>([]);

  // Calculate start and end date for selected month
  const { startDate, endDate, monthName } = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const dateObj = new Date(y, m - 1, 1);
    const mName = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return {
      startDate: `${selectedMonth}-01`,
      endDate: `${selectedMonth}-${String(lastDay).padStart(2, "0")}`,
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
        setTxns(res.data?.items || []);
      })
      .catch(() => {
        if (!active) return;
        setTxns([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, startDate, endDate]);

  // Compute month totals
  const { income, expense, net, savingsRate, categoryTotals, topExpenses } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const catMap: Record<string, number> = {};

    txns.forEach((t) => {
      const amt = t.amount || 0;
      if (amt > 0) {
        inc += amt;
      } else if (amt < 0) {
        const absVal = Math.abs(amt);
        exp += absVal;
        const cat = t.category || "Other";
        catMap[cat] = (catMap[cat] || 0) + absVal;
      }
    });

    const netVal = inc - exp;
    const rate = inc > 0 ? (netVal / inc) * 100 : 0;

    const cats = Object.entries(catMap)
      .map(([name, amount]) => ({
        name,
        amount,
        pct: exp > 0 ? (amount / exp) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const tops = [...txns]
      .filter((t) => (t.amount || 0) < 0)
      .sort((a, b) => (a.amount || 0) - (b.amount || 0))
      .slice(0, 5);

    return {
      income: inc,
      expense: exp,
      net: netVal,
      savingsRate: rate,
      categoryTotals: cats,
      topExpenses: tops,
    };
  }, [txns]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const text = `📊 **Batua Financial Statement — ${monthName}**
--------------------------------------------------
• Total Income:   ${formatINR(income)}
• Total Expenses: ${formatINR(expense)}
• Net Savings:    ${formatINR(net)} (${savingsRate.toFixed(1)}%)
• Total Entries:  ${txns.length} transactions

**Top Spending Categories:**
${categoryTotals
  .slice(0, 5)
  .map((c) => `  - ${c.name}: ${formatINR(c.amount)} (${c.pct.toFixed(1)}%)`)
  .join("\n")}
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
      `"${(t.description || "").replace(/"/g, '""')}"`,
      `"${(t.category || "").replace(/"/g, '""')}"`,
      `"${(t.payment_method || "").replace(/"/g, '""')}"`,
      t.amount || 0,
      `"${(t.notes || "").replace(/"/g, '""')}"`,
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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
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
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl z-10 my-8 print:border-none print:shadow-none print:m-0 print:p-0 print:max-w-none"
          >
            {/* Header / Action bar (hidden in print) */}
            <div className="flex flex-wrap items-center justify-between border-b border-border/60 bg-muted/30 px-6 py-4 print:hidden">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Monthly Financial Statement</h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 mr-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCopySummary}
                  title="Copy Summary"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Copy</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  title="Export CSV"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  title="Print / Save PDF"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print PDF</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="ml-2 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Printable Statement Body */}
            <div id="printable-statement" className="p-6 sm:p-8 space-y-6">
              {/* Statement Brand Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-border/80 pb-6 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-brand text-2xl font-bold tracking-tight">Batua</span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Official Statement
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Personal Wealth & Expenditure Record
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-lg font-bold text-foreground">{monthName}</div>
                  <div className="text-xs text-muted-foreground">
                    Period: {startDate} to {endDate}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Generated: {new Date().toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                  Aggregating monthly financials…
                </div>
              ) : (
                <>
                  {/* KPI Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Total Income</span>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="mt-2 text-lg font-bold text-emerald-500">
                        {formatINR(income)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Total Expenses</span>
                        <TrendingDown className="h-4 w-4 text-rose-500" />
                      </div>
                      <div className="mt-2 text-lg font-bold text-rose-500">
                        {formatINR(expense)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Net Savings</span>
                        <Wallet className="h-4 w-4 text-primary" />
                      </div>
                      <div
                        className={cn(
                          "mt-2 text-lg font-bold",
                          net >= 0 ? "text-primary" : "text-rose-500"
                        )}
                      >
                        {formatINR(net)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Savings Rate</span>
                        <PiggyBank className="h-4 w-4 text-primary" />
                      </div>
                      <div className="mt-2 text-lg font-bold text-foreground">
                        {savingsRate.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Spending Category Breakdown */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                      Category Breakdown
                    </h3>
                    {categoryTotals.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-2 italic">
                        No expense records found for this period.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-border/60">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="py-2.5 px-3 text-left font-semibold">Category</th>
                              <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                              <th className="py-2.5 px-3 text-right font-semibold">% Share</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {categoryTotals.map((cat) => (
                              <tr key={cat.name} className="hover:bg-muted/10">
                                <td className="py-2 px-3 font-medium text-foreground">
                                  {cat.name}
                                </td>
                                <td className="py-2 px-3 text-right text-foreground font-semibold">
                                  {formatINR(cat.amount)}
                                </td>
                                <td className="py-2 px-3 text-right text-muted-foreground">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${Math.min(100, cat.pct)}%` }}
                                      />
                                    </div>
                                    <span className="w-9 font-mono text-[11px]">
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
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Largest Individual Outflows
                      </h3>
                      <div className="overflow-hidden rounded-xl border border-border/60">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                              <th className="py-2.5 px-3 text-left font-semibold">Description</th>
                              <th className="py-2.5 px-3 text-left font-semibold">Category</th>
                              <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {topExpenses.map((t) => (
                              <tr key={t.id} className="hover:bg-muted/10">
                                <td className="py-2 px-3 text-muted-foreground font-mono">
                                  {t.date}
                                </td>
                                <td className="py-2 px-3 font-medium text-foreground">
                                  {t.description || "Untitled"}
                                </td>
                                <td className="py-2 px-3 text-muted-foreground">
                                  {t.category || "Other"}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-rose-500">
                                  {formatINR(Math.abs(t.amount))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Footer Statement */}
                  <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between text-[11px] text-muted-foreground gap-2">
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
