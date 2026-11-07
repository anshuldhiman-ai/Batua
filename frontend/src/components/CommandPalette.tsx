import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  LayoutDashboard,
  ReceiptText,
  ChartColumnBig,
  Wallet,
  Target,
  Users,
  Brain,
  Settings as SettingsIcon,
  PlusCircle,
  FileSpreadsheet,
  Moon,
  Sun,
  CircleHelp,
  Download,
  CornerDownLeft,
  X,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeContext } from "@/App";
import { api, formatINR } from "@/lib/utils-finance";
import { useDebounce } from "@/hooks/useDebounce";

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "Navigation" | "Actions" | "Transactions";
  badge?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenStatement?: () => void;
}

export default function CommandPalette({ open, onClose, onOpenStatement }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveTxns, setLiveTxns] = useState<any[]>([]);
  const [isSearchingTxns, setIsSearchingTxns] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = React.useContext(ThemeContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 200);

  // Auto focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setLiveTxns([]);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Live transaction search when query is 2+ characters
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setLiveTxns([]);
      setIsSearchingTxns(false);
      return;
    }

    let active = true;
    setIsSearchingTxns(true);
    api
      .get("/transactions/", { params: { search: q, page_size: 5 } })
      .then((res) => {
        if (!active) return;
        const items = res.data?.items || [];
        setLiveTxns(items);
      })
      .catch(() => {
        if (!active) return;
        setLiveTxns([]);
      })
      .finally(() => {
        if (active) setIsSearchingTxns(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const navItems: CommandItem[] = useMemo(
    () => [
      {
        id: "nav-dashboard",
        title: "Go to Dashboard",
        subtitle: "Overview, summary metrics and recent activity",
        icon: LayoutDashboard,
        category: "Navigation",
        badge: "G then D",
        onSelect: () => {
          navigate("/dashboard");
          onClose();
        },
      },
      {
        id: "nav-transactions",
        title: "Go to Transactions",
        subtitle: "Full ledger, filtering, exports, and bulk operations",
        icon: ReceiptText,
        category: "Navigation",
        badge: "G then T",
        onSelect: () => {
          navigate("/transactions");
          onClose();
        },
      },
      {
        id: "nav-analytics",
        title: "Go to Analytics",
        subtitle: "Spending breakdowns, charts, and trends",
        icon: ChartColumnBig,
        category: "Navigation",
        badge: "G then A",
        onSelect: () => {
          navigate("/analytics");
          onClose();
        },
      },
      {
        id: "nav-budgets",
        title: "Go to Budgets",
        subtitle: "Category limits, tracking, and overspending warnings",
        icon: Wallet,
        category: "Navigation",
        badge: "G then B",
        onSelect: () => {
          navigate("/budgets");
          onClose();
        },
      },
      {
        id: "nav-goals",
        title: "Go to Goals",
        subtitle: "Savings targets and milestone progress",
        icon: Target,
        category: "Navigation",
        badge: "G then O",
        onSelect: () => {
          navigate("/goals");
          onClose();
        },
      },
      {
        id: "nav-people",
        title: "Go to People Ledger",
        subtitle: "Debt tracking, lent/borrowed balances",
        icon: Users,
        category: "Navigation",
        badge: "G then P",
        onSelect: () => {
          navigate("/people");
          onClose();
        },
      },
      {
        id: "nav-ai",
        title: "Go to AI Insights",
        subtitle: "Spending anomalies, forecast, and assistant",
        icon: Brain,
        category: "Navigation",
        badge: "AI",
        onSelect: () => {
          navigate("/ml-insights");
          onClose();
        },
      },
      {
        id: "nav-settings",
        title: "Go to Settings",
        subtitle: "Theme, shortcuts, backup, and system status",
        icon: SettingsIcon,
        category: "Navigation",
        badge: "G then S",
        onSelect: () => {
          navigate("/settings");
          onClose();
        },
      },
    ],
    [navigate, onClose]
  );

  const actionItems: CommandItem[] = useMemo(
    () => [
      {
        id: "action-add-txn",
        title: "Add New Transaction",
        subtitle: "Quick-record an expense or income entry",
        icon: PlusCircle,
        category: "Actions",
        badge: "N",
        onSelect: () => {
          navigate("/transactions");
          window.dispatchEvent(new CustomEvent("shortcut:add-transaction"));
          onClose();
        },
      },
      {
        id: "action-statement",
        title: "Generate Monthly Statement",
        subtitle: "1-Click printable financial report & PDF summary",
        icon: FileSpreadsheet,
        category: "Actions",
        badge: "Statement",
        onSelect: () => {
          onClose();
          if (onOpenStatement) {
            onOpenStatement();
          } else {
            window.dispatchEvent(new CustomEvent("statement:open"));
          }
        },
      },
      {
        id: "action-toggle-theme",
        title: `Toggle Theme (Currently ${theme === "dark" ? "Dark" : "Light"})`,
        subtitle: "Switch between light and dark modes",
        icon: theme === "dark" ? Sun : Moon,
        category: "Actions",
        badge: "T",
        onSelect: () => {
          toggle();
          onClose();
        },
      },
      {
        id: "action-guide",
        title: "Open User Guide & Shortcuts",
        subtitle: "Learn power user tricks and workflows",
        icon: CircleHelp,
        category: "Actions",
        badge: "?",
        onSelect: () => {
          window.dispatchEvent(new CustomEvent("shortcut:show-help"));
          onClose();
        },
      },
      {
        id: "action-export-backup",
        title: "Download Full JSON Backup",
        subtitle: "Export all transactions, budgets, goals, and people data",
        icon: Download,
        category: "Actions",
        onSelect: async () => {
          try {
            const { data } = await api.get("/backup");
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `batua-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          } catch {
            // fallback
          }
          onClose();
        },
      },
    ],
    [navigate, onClose, onOpenStatement, theme, toggle]
  );

  const txnItems: CommandItem[] = useMemo(
    () =>
      liveTxns.map((t) => ({
        id: `txn-${t.id}`,
        title: t.description || "Untitled Transaction",
        subtitle: `${t.date} • ${t.category || "Other"}${t.payment_method ? ` • ${t.payment_method}` : ""}`,
        icon: CreditCard,
        category: "Transactions" as const,
        badge: formatINR(Math.abs(t.amount || 0)),
        onSelect: () => {
          navigate("/transactions");
          onClose();
        },
      })),
    [liveTxns, navigate, onClose]
  );

  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      return [...actionItems, ...navItems];
    }
    const filter = (item: CommandItem) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle?.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q);

    return [...txnItems, ...actionItems.filter(filter), ...navItems.filter(filter)];
  }, [query, actionItems, navItems, txnItems]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  // Key navigation
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? Math.max(0, filteredItems.length - 1) : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredItems[selectedIndex];
      if (current) current.onSelect();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
            role="dialog"
            aria-modal="true"
            aria-label="Universal Command Palette"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl z-10"
          >
            {/* Search Input Bar */}
            <div className="relative flex items-center border-b border-border/60 px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground mr-3" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={filteredItems.length > 0}
                aria-controls="command-palette-results"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Type a command, navigate, or search transactions…"
                className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/70"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Results List */}
            <div
              id="command-palette-results"
              role="listbox"
              className="max-h-[380px] overflow-y-auto p-2 space-y-1 no-scrollbar"
            >
              {isSearchingTxns && (
                <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse">
                  Searching live ledger…
                </div>
              )}

              {filteredItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No matching commands or transactions found for &ldquo;{query}&rdquo;
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={item.onSelect}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-accent/50"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                            isSelected
                              ? "border-primary/30 bg-primary/20 text-primary"
                              : "border-border/60 bg-muted/40 text-muted-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="truncate">
                          <div className="truncate text-sm">{item.title}</div>
                          {item.subtitle && (
                            <div className="truncate text-xs text-muted-foreground">
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {item.badge && (
                          <span
                            className={cn(
                              "rounded-md border px-1.5 py-0.5 text-[11px] font-mono",
                              item.category === "Transactions"
                                ? "border-primary/20 bg-primary/10 text-primary font-semibold"
                                : "border-border/60 bg-muted/50 text-muted-foreground"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                        {isSelected && (
                          <CornerDownLeft className="h-3.5 w-3.5 text-primary opacity-80" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer with shortcut hints */}
            <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
                    ↑
                  </kbd>
                  <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
                    ↓
                  </kbd>{" "}
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
                    ↵
                  </kbd>{" "}
                  Select
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
                  ESC
                </kbd>{" "}
                Close
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
