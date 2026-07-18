import React from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  Search,
  Plus,
  Pencil,
  Trash2,
  Download,
  FileSpreadsheet,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api, apiUrl, formatINR, formatDate, categoryColor } from "@/lib/utils-finance";
import { sortTransactions } from "@/lib/analytics-utils";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import NLInputBar from "@/components/NLInputBar";
import PageHeader from "@/components/PageHeader";
import UploadProgress from "@/components/UploadProgress";

const PAGE_SIZE = 15;
const EMPTY = { date: "", description: "", amount: 0, category: "Other", payment_method: "", notes: "", quantity: 1, price: 0, price_text: "" };

// Per-item price of a transaction — falls back to |amount| ÷ quantity for
// rows saved before the price column existed.
const unitPrice = (t) =>
  t.price && t.price > 0 ? t.price : Math.abs(t.amount || 0) / (t.quantity > 0 ? t.quantity : 1);

// Verbatim price cell from the imported file (e.g. "120+240"); shown exactly
// as written when present, otherwise the formatted per-item price.
const priceDisplay = (t) => (t.price_text ? t.price_text : null);

const round2 = (n) => Math.round(n * 100) / 100;

export default function Transactions() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [category, setCategory] = React.useState("All");
  const [page, setPage] = React.useState(1);
  const [categories, setCategories] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [uploading, setUploading] = React.useState(false);
  const [uploadStage, setUploadStage] = React.useState("uploading"); // uploading | reading | categorizing | saving | complete | error
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadMessage, setUploadMessage] = React.useState("");
  const [aiCategorize, setAiCategorize] = useLocalStorage("batua-import-ai", false);
  const [sortBy, setSortBy] = React.useState("date");
  const [sortOrder, setSortOrder] = React.useState("desc");
  const [paymentMethodFilter, setPaymentMethodFilter] = React.useState("All");
  const [transactionTypeFilter, setTransactionTypeFilter] = React.useState("All");
  const [dateRange, setDateRange] = React.useState({ start: "", end: "" });

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY);

  // Invalidate helper to clear React Query caches when transactions list changes
  const invalidateAll = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics_timeline"] });
    queryClient.invalidateQueries({ queryKey: ["category_breakdown"] });
  }, [queryClient]);

  // useQuery hook to fetch and sort transactions
  const transactionsQuery = useQuery({
    queryKey: [
      "transactions",
      {
        search: debouncedSearch,
        category,
        paymentMethodFilter,
        transactionTypeFilter,
        dateRange,
        page,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: async () => {
      const { data } = await api.get("/transactions/", {
        params: {
          search: debouncedSearch || undefined,
          category: category !== "All" ? category : undefined,
          payment_method: paymentMethodFilter !== "All" ? paymentMethodFilter : undefined,
          txn_type:
            transactionTypeFilter === "credit"
              ? "income"
              : transactionTypeFilter === "debit"
                ? "expense"
                : undefined,
          start_date: dateRange.start || undefined,
          end_date: dateRange.end || undefined,
          page,
          page_size: PAGE_SIZE,
        },
      });
      const sorted = sortTransactions(data.items || [], sortBy, sortOrder);
      return { ...data, items: sorted };
    },
  });

  const data = transactionsQuery.data || { items: [], total: 0, pages: 1 };
  const loading = transactionsQuery.isLoading;

  React.useEffect(() => {
    api.get("/categories/").then((r) => setCategories(r.data.categories));
  }, []);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedSearch, category, paymentMethodFilter, transactionTypeFilter, dateRange, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const onDrop = React.useCallback(async (files) => {
    if (!files.length) return;
    setUploading(true);
    setUploadStage("uploading");
    setUploadProgress(0);
    setUploadMessage("Uploading your file…");
    const fd = new FormData();
    fd.append("file", files[0]);
    let pollHandle = null;
    try {
      // Kick off the staged background job.
      const { data: start } = await api.post(
        `/upload-excel/start?replace=true&use_ai=${aiCategorize ? "true" : "false"}`,
        fd,
        {
          // NB: do NOT set Content-Type manually. The browser must generate
          // the multipart boundary itself; hard-coding "multipart/form-data"
          // omits it and the server can't parse the body.
          timeout: 300000, // 5 min hard cap
          onUploadProgress: (progressEvent) => {
            // Map real bytes-uploaded progress to the first 25% of the bar.
            if (!progressEvent.total) return;
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            const mapped = Math.round((pct / 100) * 25);
            setUploadProgress((p) => Math.max(p, mapped));
          },
        }
      );
      const taskId = start.task_id;
      // Poll backend progress every 400ms until complete or error.
      const tick = async () => {
        try {
          const { data } = await api.get(`/upload-progress/${taskId}`, { timeout: 15000 });
          setUploadStage(data.stage);
          setUploadProgress(data.progress ?? 0);
          if (data.message) setUploadMessage(data.message);
          if (data.stage === "complete") {
            return true;
          }
          if (data.stage === "error") {
            throw new Error(data.error || "Upload failed");
          }
          return false;
        } catch (err) {
          if (err?.response?.status === 404) {
            throw new Error("Upload progress lost. Please try again.");
          }
          // Transient network blip — keep polling.
          return false;
        }
      };
      // Add safety timeout to prevent infinite polling (max 5 minutes)
      const maxPollTime = 300000; // 5 minutes
      const startTime = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - startTime > maxPollTime) {
          throw new Error("Upload timed out after 5 minutes");
        }
        // eslint-disable-next-line no-await-in-loop
        const done = await tick();
        if (done) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 400));
      }
      const finalState = (await api.get(`/upload-progress/${taskId}`)).data;
      const result = finalState.result || {};
      toast.success(
        `Imported ${result.inserted ?? 0} transactions (replaced previous data)` +
          (result.skipped ? ` · skipped ${result.skipped} duplicates` : "")
      );
      invalidateAll();
      // Hold "complete" state briefly so users see the success.
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setUploadStage("uploading");
        setUploadMessage("");
      }, 1200);
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || "Upload failed";
      setUploadStage("error");
      setUploadMessage(msg);
      toast.error(msg);
      // Keep error state visible for a bit so users can read it.
      setTimeout(() => setUploading(false), 2500);
    } finally {
      if (pollHandle) clearTimeout(pollHandle);
    }
  }, [invalidateAll, aiCategorize]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    multiple: false,
  });

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allChecked = data.items.length > 0 && data.items.every((t) => selected.has(t.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(data.items.map((t) => t.id)));
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY, date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };
  const openEdit = (txn) => {
    setEditing(txn);
    setForm({ ...txn, price: Number(unitPrice(txn).toFixed(2)) });
    setModalOpen(true);
  };

  const saveForm = async () => {
    if (!form.date) return toast.error("Enter a valid date");
    try {
      if (editing) {
        await api.put(`/transactions/${editing.id}`, form);
        toast.success("Transaction updated");
      } else {
        await api.post("/transactions/", form);
        toast.success("Transaction added");
      }
      setModalOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error("Save failed");
    }
  };

  // Re-insert deleted rows (new ids — content is what matters). Powers the
  // "Undo" action on delete toasts.
  const restoreTxns = async (txns) => {
    try {
      await api.post("/transactions/bulk", { items: txns });
      toast.success(txns.length === 1 ? "Transaction restored" : `Restored ${txns.length} transactions`);
      invalidateAll();
    } catch (e) {
      toast.error("Restore failed");
    }
  };

  const deleteOne = async (id) => {
    const txn = data.items.find((t) => t.id === id);
    try {
      await api.delete(`/transactions/${id}`);
      invalidateAll();
      toast.success("Deleted", txn ? { action: { label: "Undo", onClick: () => restoreTxns([txn]) } } : undefined);
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const bulkDelete = async () => {
    // Only rows visible on this page can be captured for undo; if the
    // selection spans pages we skip the offer rather than half-restore.
    const captured = data.items.filter((t) => selected.has(t.id));
    const canUndo = captured.length === selected.size;
    try {
      await api.post("/transactions/bulk-delete", { ids: Array.from(selected) });
      setSelected(new Set());
      invalidateAll();
      toast.success(
        `Deleted ${captured.length || selected.size} transactions`,
        canUndo ? { action: { label: "Undo", onClick: () => restoreTxns(captured) } } : undefined
      );
    } catch (e) {
      toast.error("Bulk delete failed");
    }
  };

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Transactions"
        subtitle="Add, import, search and manage every entry"
      />

      <NLInputBar onSaved={invalidateAll} />

      {/* Upload zone */}
      <div
        {...getRootProps()}
        data-testid="excel-dropzone"
        className={cn(
          "rounded-xl border-2 border-dashed p-6 transition-colors",
          uploading
            ? "border-primary/50 bg-primary/5 cursor-default"
            : "border-border hover:border-primary/50 cursor-pointer",
          !uploading && isDragActive && "border-primary bg-primary/5"
        )}
      >
        <input {...getInputProps()} data-testid="excel-input" />
        {uploading ? (
          <div className="space-y-4" data-testid="upload-progress-panel">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Importing your file…</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); setUploading(false); setUploadStage("uploading"); setUploadProgress(0); setUploadMessage(""); toast.info("Upload cancelled"); }}
                className="h-7 w-7"
                title="Hide panel (upload will keep running)"
                data-testid="upload-hide-btn"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <UploadProgress stage={uploadStage} progress={uploadProgress} message={uploadMessage} />
            <p className="text-center text-[11px] text-muted-foreground">
              You can keep using Batua — we'll refresh transactions when import finishes.
            </p>
          </div>
        ) : (
          <div className="flex cursor-pointer flex-col items-center justify-center text-center">
            <UploadCloud className="h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              {isDragActive
                ? "Drop your file"
                : "Drag & drop an Excel or CSV file, or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-detects columns, debit/credit & dates · understands most bank statements
            </p>
          </div>
        )}
      </div>

      {/* Import options */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card/40 px-4 py-2.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Import options
        </span>
        <label className="flex cursor-pointer items-center gap-2" data-testid="opt-ai">
          <Checkbox checked={aiCategorize} onCheckedChange={setAiCategorize} />
          <span>Smart categorize with AI <span className="text-muted-foreground">(slower)</span></span>
        </label>
        <span className="text-xs text-amber-600 dark:text-amber-400">
          Each upload replaces all existing transactions with the new file — no duplicates.
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="txn-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description…"
              className="pl-9"
            />
          </div>
          <select
            data-testid="txn-category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="All">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={transactionTypeFilter}
            onChange={(e) => setTransactionTypeFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="All">All types</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
          <select
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="All">All payment methods</option>
            <option value="UPI">UPI</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
            <span className="text-xs text-muted-foreground">From:</span>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="h-8 w-32 rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs text-muted-foreground">To:</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="h-8 w-32 rounded border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={bulkDelete} data-testid="bulk-delete-btn">
              <Trash2 className="h-4 w-4" /> Delete ({selected.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.open(apiUrl("/export/csv"))} data-testid="export-csv-btn">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(apiUrl("/export/excel"))} data-testid="export-excel-btn">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button size="sm" onClick={openAdd} data-testid="add-txn-btn">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 p-3"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
                  <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("date")}>
                    Date {sortBy === "date" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("description")}>
                    Description {sortBy === "description" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("category")}>
                    Category {sortBy === "category" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("payment_method")}>
                    Payment {sortBy === "payment_method" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("quantity")}>
                    Qty {sortBy === "quantity" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("price")}>
                    Price {sortBy === "price" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 cursor-pointer hover:text-foreground" onClick={() => handleSort("amount")}>
                    Type {sortBy === "amount" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("amount")}>
                    Amount {sortBy === "amount" && (sortOrder === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="w-20 p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : data.items.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No transactions found.</td></tr>
                ) : (
                  data.items.map((t) => (
                    <tr key={t.id} data-testid={`txn-row-${t.id}`} className="border-b border-border/60 hover:bg-accent/40">
                      <td className="p-3"><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></td>
                      <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDate(t.date)}</td>
                      <td className="p-3 font-medium">{t.description}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: categoryColor(t.category) }} />
                          {t.category}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{t.payment_method || "—"}</td>
                      <td className="p-3 text-center font-medium tabular-nums text-muted-foreground">{t.quantity ?? 1}</td>
                      <td className="whitespace-nowrap p-3 text-right tabular-nums text-muted-foreground" data-testid={`price-${t.id}`}>
                        {priceDisplay(t) ?? formatINR(unitPrice(t))}
                        {!priceDisplay(t) && (t.quantity ?? 1) > 1 && <span className="text-[10px] text-muted-foreground/70"> /item</span>}
                      </td>
                      <td className="p-3">
                        <Badge variant={t.amount >= 0 ? "success" : "secondary"} data-testid={`type-${t.id}`}>
                          {t.amount >= 0 ? "Credit" : "Debit"}
                        </Badge>
                      </td>
                      <td className={cn("whitespace-nowrap p-3 text-right tabular-nums font-medium", t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
                        {formatINR(t.amount)}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(t)} data-testid={`edit-${t.id}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteOne(t.id)} data-testid={`delete-${t.id}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data.total} transactions</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="prev-page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">Page {data.page || page} of {data.pages || 1}</span>
          <Button variant="outline" size="icon" disabled={page >= (data.pages || 1)} onClick={() => setPage((p) => p + 1)} data-testid="next-page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Add / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent onClose={() => setModalOpen(false)} data-testid="txn-modal">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" full>
              <DateInput value={form.date} onChange={(v) => setForm({ ...form, date: v })} data-testid="form-date" />
            </Field>
            <Field label="Description" full>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="form-description" />
            </Field>
            <Field label="Type">
              <select
                value={form.amount >= 0 ? "credit" : "debit"}
                onChange={(e) => {
                  const mag = Math.abs(form.amount) || 0;
                  setForm({ ...form, amount: e.target.value === "credit" ? mag : -mag });
                }}
                data-testid="form-type"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="credit">Credit (money in)</option>
                <option value="debit">Debit (money out)</option>
              </select>
            </Field>
            <Field label="Amount (₹)">
              <Input
                type="number"
                value={Math.abs(form.amount)}
                onChange={(e) => {
                  const mag = Math.abs(parseFloat(e.target.value) || 0);
                  const qty = form.quantity > 0 ? form.quantity : 1;
                  setForm({
                    ...form,
                    amount: form.amount < 0 ? -mag : mag,
                    price: round2(mag / qty),
                    price_text: "",
                  });
                }}
                data-testid="form-amount"
              />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="form-category" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Payment Method">
              <Input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} data-testid="form-payment" />
            </Field>
            <Field label="Quantity">
              <Input
                type="number"
                min="1"
                value={form.quantity ?? 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  const qty = val > 0 ? val : 1;
                  setForm({ ...form, quantity: qty, price: round2(Math.abs(form.amount) / qty), price_text: "" });
                }}
                data-testid="form-quantity"
              />
            </Field>
            <Field label="Price / item (₹)">
              <Input
                type="number"
                min="0"
                value={form.price ?? 0}
                onChange={(e) => {
                  const price = Math.abs(parseFloat(e.target.value) || 0);
                  const qty = form.quantity > 0 ? form.quantity : 1;
                  const mag = round2(price * qty);
                  setForm({ ...form, price, amount: form.amount < 0 ? -mag : mag, price_text: "" });
                }}
                data-testid="form-price"
              />
              {form.price_text ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  From file: <span className="font-medium tabular-nums">{form.price_text}</span> — editing clears this
                </p>
              ) : null}
            </Field>
            <Field label="Notes">
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="form-notes" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={saveForm} data-testid="form-save">{editing ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "col-span-2")}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
