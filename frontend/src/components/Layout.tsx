import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  ReceiptText,
  ChartColumnBig,
  Wallet,
  Target,
  Users,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Brain,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LogOut,
  Search,
  LayoutGrid,
  ArrowRight,
} from "lucide-react";

import { api, formatINR, formatDate } from "@/lib/utils-finance";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Lazy-load Tour & its steps so initial dashboard paint is not blocked by tour bundle
const Tour = React.lazy(() => import("@/components/Tour"));

import { ThemeContext } from "@/App";
import Logo from "@/components/Logo";
import ManageProfileMenu from "@/components/ManageProfileMenu";
import { useAuth } from "@/components/Auth";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useDebounce } from "@/hooks/useDebounce";
import UserGuide from "@/components/UserGuide";
import CommandPalette from "@/components/CommandPalette";
import MonthlyStatementModal from "@/components/MonthlyStatementModal";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useScrollDirection } from "@/hooks/useScrollDirection";

/**
 * Cross-page transaction search, shared by the top navbar and any page
 * that wants to consume it (Transactions reads it today). Kept in one
 * module-level store so every Layout instance — and the tests — agree.
 */
type SearchListener = (value: string) => void;
const searchListeners = new Set<SearchListener>();
let sharedSearchValue = "";

export function getNavSearch(): string {
  return sharedSearchValue;
}

export function setNavSearch(value: string): void {
  sharedSearchValue = value;
  searchListeners.forEach((listener) => listener(value));
}

export function useNavSearch(): [string, (value: string) => void] {
  const [value, setValue] = useState(sharedSearchValue);
  useEffect(() => {
    const listener: SearchListener = setValue;
    searchListeners.add(listener);
    return () => {
      searchListeners.delete(listener);
    };
  }, []);
  return [value, setNavSearch];
}

/** Routes that show the navbar search box — Dashboard and Transactions only. */
const SEARCH_ROUTES = ["/dashboard", "/transactions"] as const;

function routeHasSearch(pathname: string): boolean {
  return SEARCH_ROUTES.some((r) => pathname.startsWith(r));
}

/**
 * Scoped navbar search — rendered on Dashboard and Transactions.
 * On Dashboard: provides live matching transactions in a dropdown below the search.
 * On Transactions: drives the transactions ledger table filter without redirecting.
 */
function NavSearchBar({
  className,
  placeholder = "Search transactions…",
}: {
  className?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useNavSearch();
  const debounced = useDebounce(value, 200);
  const location = useLocation();
  const navigate = useNavigate();
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const isDashboard = location.pathname.startsWith("/dashboard");

  // Fetch live matching transactions ONLY on the dashboard page
  const [searchResults, setSearchResults] = useState<{ items: any[]; total: number }>({
    items: [],
    total: 0,
  });
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  useEffect(() => {
    if (!isDashboard || !debounced.trim()) {
      setSearchResults({ items: [], total: 0 });
      setIsSearchLoading(false);
      return;
    }
    let cancelled = false;
    setIsSearchLoading(true);
    api
      .get("/transactions", {
        params: { search: debounced.trim(), page_size: 6 },
      })
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.items || (Array.isArray(res.data) ? res.data : []);
        const tot = res.data?.total ?? list.length;
        setSearchResults({ items: list, total: tot });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Dashboard live search failed", err);
        setSearchResults({ items: [], total: 0 });
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debounced, isDashboard]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsFocused(false);
      (e.target as HTMLElement).blur();
    }
  };

  const onClear = () => {
    setValue("");
    setIsFocused(false);
  };

  const showDropdown = isDashboard && isFocused && debounced.trim().length > 0;
  const items = searchResults.items;
  const total = searchResults.total;

  return (
    <div
      ref={containerRef}
      role="search"
      aria-label="Search transactions"
      className={cn("relative w-full", className)}
    >
      <div
        className={cn(
          "group relative flex items-center w-full rounded-xl border transition-all duration-300",
          "bg-background/80 hover:bg-background/95",
          "border-border/70 hover:border-border",
          isFocused
            ? "border-primary/60 shadow-[0_0_20px_-3px_hsl(var(--primary)/0.25)] ring-2 ring-primary/20 bg-background"
            : "shadow-xs"
        )}
      >
        <Search
          className={cn(
            "pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200",
            isFocused ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground"
          )}
        />
        <input
          type="search"
          data-testid="nav-search"
          aria-label={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (!isFocused) setIsFocused(true);
          }}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "h-10 w-full rounded-xl bg-transparent pl-10 pr-20 text-sm font-medium text-foreground",
            "placeholder:text-muted-foreground/60 placeholder:font-normal",
            "focus:outline-none"
          )}
        />
        <div className="absolute right-2.5 flex items-center gap-1.5">
          {value ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("command-palette:open"))}
            title={`Open Command Palette (${isMac ? "⌘" : "Ctrl"}+K)`}
            className="hidden sm:flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <span>{isMac ? "⌘" : "Ctrl"}</span>
            <span>K</span>
          </button>
        </div>
      </div>

      {/* Floating transaction dropdown ONLY on Dashboard */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <ReceiptText className="h-3.5 w-3.5 text-primary" />
                Matching Transactions {total > 0 && `(${total})`}
              </span>
              <span className="text-[10px] text-muted-foreground/60 lowercase">
                live search
              </span>
            </div>

            {/* Content */}
            {isSearchLoading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 animate-pulse">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-36 bg-muted/60 rounded" />
                      <div className="h-2.5 w-24 bg-muted/40 rounded" />
                    </div>
                    <div className="h-4 w-16 bg-muted/60 rounded" />
                  </div>
                ))}
              </div>
            ) : items.length > 0 ? (
              <div className="p-1.5 max-h-[340px] overflow-y-auto divide-y divide-border/20">
                {items.map((txn: any) => {
                  const isIncome = Number(txn.amount) > 0;
                  return (
                    <div
                      key={txn.id}
                      onClick={() => {
                        setIsFocused(false);
                        navigate(`/transactions?search=${encodeURIComponent(txn.description)}`);
                      }}
                      className="group flex items-center justify-between p-2.5 rounded-xl transition-all duration-150 hover:bg-accent/60 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                            isIncome
                              ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/20"
                              : "bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/20"
                          )}
                        >
                          {isIncome ? "+" : "-"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {txn.description}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{formatDate(txn.date)}</span>
                            <span>•</span>
                            <span className="truncate">{txn.category || "General"}</span>
                            {txn.payment_method && (
                              <>
                                <span>•</span>
                                <span className="rounded bg-muted/60 px-1.5 py-0.2 text-[10px] font-mono">
                                  {txn.payment_method}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={cn(
                            "font-mono text-sm font-semibold",
                            isIncome ? "text-emerald-500" : "text-rose-500"
                          )}
                        >
                          {isIncome ? "+" : ""}{formatINR(txn.amount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground/80">No matching transactions</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  No records found matching &ldquo;{debounced}&rdquo;
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/30 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsFocused(false);
                  navigate(`/transactions?search=${encodeURIComponent(debounced.trim())}`);
                }}
                className="font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                View all in Transactions <ArrowRight className="h-3 w-3" />
              </button>
              <span className="text-[10px] text-muted-foreground/60">
                Press <kbd className="px-1 py-0.5 rounded border border-border/60 bg-muted/50 font-mono">Esc</kbd> to close
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
  { to: "/analytics", label: "Analytics", icon: ChartColumnBig },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/people", label: "People", icon: Users },
  { to: "/ml-insights", label: "AI Insights", icon: Brain },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/transactions": "Transactions",
  "/analytics": "Analytics",
  "/budgets": "Budgets",
  "/goals": "Goals",
  "/people": "People",
  "/ml-insights": "AI Insights",
  "/settings": "Settings",
};

function ThemeToggle({ className }) {
  const { theme, toggle, toggleAt } = React.useContext(ThemeContext);
  const reduce = useReducedMotion();
  const isDark = theme === "dark";
  const btnRef = React.useRef<HTMLButtonElement>(null);

  // Circular reveal grows from the button's centre. Falls back to the plain
  // toggle (instant change) when the View Transitions API or layout metrics
  // aren't available.
  const onToggle = () => {
    const el = btnRef.current;
    if (el && typeof toggleAt === "function") {
      const r = el.getBoundingClientRect();
      toggleAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    } else {
      toggle();
    }
  };

  return (
    <button
      ref={btnRef}
      onClick={onToggle}
      data-testid="dark-mode-toggle"
      aria-label="Toggle dark mode"
      className={cn(
        "relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl",
        "text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "sun" : "moon"}
          initial={reduce ? false : { rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={reduce ? undefined : { rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center"
        >
          {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/* ─── Desktop top navbar ─────────────────────────────────────── */
function DesktopTopNav({
  onRequestSignOut,
  collapsed,
}: {
  onRequestSignOut: () => void;
  collapsed: boolean;
}) {
  const location = useLocation();
  const showSearch = routeHasSearch(location.pathname);
  const pageTitle = PAGE_TITLES[location.pathname];
  const { isVisible } = useScrollDirection({ threshold: 12, topOffset: 45 });
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <motion.header
      aria-label="Desktop top navigation"
      initial={false}
      animate={{
        y: isVisible ? 0 : -85,
        opacity: isVisible ? 1 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: 350,
        damping: 28,
        mass: 0.6,
      }}
      className={cn(
        "fixed top-0 right-0 z-30 hidden lg:flex h-16 items-center justify-between border-b border-border/40 bg-background/80 px-6 backdrop-blur-xl transition-[left] duration-300",
        collapsed ? "left-[72px]" : "left-56"
      )}
    >
      {/* Left side: Clean page context indicator - without duplicate 'Batua' text */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          {pageTitle ? (
            <>
              <LayoutGrid className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold tracking-tight text-foreground">
                {pageTitle}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Dashboard
            </span>
          )}
        </div>
      </div>

      {/* Center: Premium Search Bar */}
      <div className="flex-1 max-w-xl mx-auto px-6">
        {showSearch ? (
          <NavSearchBar
            className="w-full"
            placeholder={
              location.pathname.startsWith("/dashboard")
                ? "Search dashboard…"
                : "Search transactions…"
            }
          />
        ) : null}
      </div>

      {/* Right side: Action controls (clean unboxed icons) */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("command-palette:open"))}
          aria-label="Universal Command Palette"
          title={`Universal Command Palette (${isMac ? "⌘" : "Ctrl"}+K)`}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        <ThemeToggle className="h-9 w-9" />
        <ManageProfileMenu onSignOut={onRequestSignOut} />
        <button
          type="button"
          onClick={onRequestSignOut}
          aria-label="Sign out"
          data-testid="sign-out"
          title="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all duration-150 hover:bg-rose-500/10 hover:text-rose-500 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </motion.header>
  );
}

/* ─── Desktop sidebar ─────────────────────────────────────────────── */
function DesktopSidebar({
  collapsed,
  onToggle,
  onLaunchTour,
  onHelp,
  onRequestSignOut,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onLaunchTour: () => void;
  onHelp?: () => void;
  onRequestSignOut: () => void;
}) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl lg:flex",
        collapsed ? "w-[72px]" : "w-56"
      )}
      aria-label="Sidebar navigation"
    >
      <NavLink
        to="/dashboard"
        className={cn(
          "flex items-center",
          // Expanded: match the nav icons' left padding (px-2 xl:px-3) so the
          // logo row lines up with the items below instead of being centered.
          collapsed ? "justify-center px-0 py-5" : "gap-3 px-2 py-5 xl:px-3"
        )}
      >
        <Logo className="h-11 w-11 shrink-0" />
        {!collapsed && (
          <span className="hidden font-brand text-[22px] leading-none tracking-wide lg:inline">
            Batua
          </span>
        )}
      </NavLink>

      <nav className="flex flex-1 flex-col gap-1 px-2 xl:px-3">
        {NAV.map((tab) => {
          const isActive = location.pathname.startsWith(tab.to);
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-testid={`nav-${tab.label.toLowerCase().replace(/\s/g, "-")}`}
              title={tab.label}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Shared-element pill — slides between tabs on navigation. */}
              {isActive && (
                <motion.span
                  layoutId="nav-active-pill"
                  transition={spring}
                  className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/15"
                />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.75}
                className="relative shrink-0"
              />
              <span className={cn("relative hidden truncate", !collapsed && "lg:inline")}>{tab.label}</span>
              {isActive && (
                <span className={cn("relative ml-auto hidden h-1.5 w-1.5 rounded-full bg-primary", !collapsed && "lg:inline-block")} />
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-border/50 p-3">
        {/* Profile manager — bottom-left corner. Hover shows the
            account basics; click opens the manage-profile window. */}
        <ManageProfileMenu variant="bottom-left" onSignOut={onRequestSignOut} />
        <button
          type="button"
          onClick={() => (onHelp ? onHelp() : onLaunchTour())}
          aria-label="User Guide & Shortcuts (Press ?)"
          data-testid="sidebar-help"
          title="User Guide & Shortcuts (Press ?)"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          data-testid="sidebar-toggle"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-accent/40 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

/* ─── Mobile top bar + drawer ─────────────────────────────────────── */
function MobileNav({ onRequestSignOut }: { onRequestSignOut: () => void }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { isVisible } = useScrollDirection({ threshold: 12, topOffset: 45 });

  const activeIndex = Math.max(
    0,
    NAV.findIndex((item) => location.pathname.startsWith(item.to))
  );

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const showSearch = routeHasSearch(location.pathname);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <motion.nav
      aria-label="Mobile navigation"
      initial={false}
      animate={{
        y: isVisible || isOpen ? 0 : -85,
        opacity: isVisible || isOpen ? 1 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: 350,
        damping: 28,
        mass: 0.6,
      }}
      className="fixed inset-x-0 top-0 z-50 pointer-events-none lg:hidden"
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center justify-between border-b border-border/40 bg-background/85 px-4 py-2.5 backdrop-blur-xl shadow-xs",
          "[padding-left:max(1rem,env(safe-area-inset-left))]",
          "[padding-right:max(1rem,env(safe-area-inset-right))]",
          "[padding-top:max(0.625rem,env(safe-area-inset-top))]"
        )}
      >
        <NavLink to="/dashboard" className="flex items-center gap-2" aria-label="Batua Dashboard">
          <Logo className="h-8 w-8 shrink-0" />
        </NavLink>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("command-palette:open"))}
            aria-label="Open Command Palette"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/50"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <ThemeToggle className="h-9 w-9" data-testid="dark-mode-toggle-mobile" />
          <ManageProfileMenu onSignOut={onRequestSignOut} />
          <button
            onClick={onRequestSignOut}
            aria-label="Sign out"
            data-testid="sign-out-mobile"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
          >
            <LogOut className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/50"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Search — below the bar on small screens, Dashboard/Transactions only */}
      {showSearch && (
        <div className="pointer-events-auto border-b border-border/40 bg-background/85 px-3 py-2 backdrop-blur-xl">
          <NavSearchBar
            placeholder={
              location.pathname.startsWith("/dashboard")
                ? "Search dashboard…"
                : "Search transactions…"
            }
          />
        </div>
      )}

      <div
        className={cn(
          "fixed inset-0 bg-background/60 backdrop-blur-sm transition-opacity lg:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "pointer-events-none opacity-0"
        )}
        style={{ top: "calc(60px + env(safe-area-inset-top))" }}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <div
        className={cn(
          "fixed inset-x-3 rounded-2xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-xl transition-all lg:hidden",
          isOpen ? "translate-y-0 opacity-100 pointer-events-auto" : "pointer-events-none -translate-y-2 opacity-0"
        )}
        style={{ top: "calc(60px + env(safe-area-inset-top))" }}
      >
        {/* Brand Header inside the drawer when expanded */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border/40 mb-1">
          <Logo className="h-8 w-8 shrink-0" />
          <span className="font-brand text-xl font-bold tracking-wide">Batua</span>
        </div>
        <div className="space-y-0.5 p-2.5">
          {NAV.map((tab, i) => {
            const isActive = i === activeIndex;
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                data-testid={`nav-mobile-${tab.label.toLowerCase().replace(/\s/g, "-")}`}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onRequestSignOut();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </motion.nav>
  );
}

interface LayoutProps {
  splashVisible?: boolean;
}

export default function Layout({ splashVisible }: LayoutProps) {
  const [collapsed, setCollapsed] = useLocalStorage("batua-sidebar-collapsed", false);
  const [tourSeen, setTourSeen] = useLocalStorage("batua-tour-seen", false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourSteps, setTourSteps] = useState<any[] | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const { logout } = useAuth();
  const location = useLocation();

  const handleConfirmSignOut = async () => {
    setConfirmSignOutOpen(false);
    await logout();
  };

  // Enable productivity keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    const handleShowHelp = () => setHelpOpen(true);
    const handleOpenCmd = () => setCmdPaletteOpen(true);
    const handleOpenStatement = () => setStatementOpen(true);

    window.addEventListener("shortcut:show-help", handleShowHelp);
    window.addEventListener("command-palette:open", handleOpenCmd);
    window.addEventListener("statement:open", handleOpenStatement);
    return () => {
      window.removeEventListener("shortcut:show-help", handleShowHelp);
      window.removeEventListener("command-palette:open", handleOpenCmd);
      window.removeEventListener("statement:open", handleOpenStatement);
    };
  }, []);

  // Lazy-load tour steps only when tour is triggered
  useEffect(() => {
    if (tourOpen && !tourSteps) {
      import("@/tour-steps").then((mod) => setTourSteps(mod.TOUR_STEPS));
    }
  }, [tourOpen, tourSteps]);

  // Update document title based on current route
  useEffect(() => {
    const path = location.pathname;
    const pageTitle = PAGE_TITLES[path] || "Batua";
    document.title = `${pageTitle} — Batua`;
  }, [location.pathname]);

  // Search is scoped to Dashboard + Transactions. Leaving those pages clears
  // the shared value so a stale query never filters the next visit.
  useEffect(() => {
    if (!routeHasSearch(location.pathname)) setNavSearch("");
  }, [location.pathname]);

  // Removed aggressive ML preload - let React Query cache handle it on-demand
  // Preloading 3 heavy ML endpoints on every mount was adding ~2-5s of startup time
  // Users will now only load ML data when they actually visit the ML Insights page

  // First-time visitors get the onboarding tour automatically — after the page
  // has painted, so the tour never feels like it snatches the screen. (Body
  // scroll is locked/unlocked inside Tour itself, which knows whether the
  // current step blurs the page or is a full-page interactive step.)
  useEffect(() => {
    if (tourSeen) return;
    const t = window.setTimeout(() => setTourOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [tourSeen]);

  const closeTour = () => {
    setTourOpen(false);
    setTourSeen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      {!splashVisible && (
        <DesktopTopNav
          onRequestSignOut={() => setConfirmSignOutOpen(true)}
          collapsed={collapsed}
        />
      )}
      {!splashVisible && (
        <DesktopSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onLaunchTour={() => setTourOpen(true)}
          onHelp={() => setHelpOpen(true)}
          onRequestSignOut={() => setConfirmSignOutOpen(true)}
        />
      )}
      {!splashVisible && (
        <MobileNav onRequestSignOut={() => setConfirmSignOutOpen(true)} />
      )}

      <ConfirmDialog
        open={confirmSignOutOpen}
        onOpenChange={setConfirmSignOutOpen}
        title="Sign out of Batua?"
        description="Are you sure you want to sign out? Your financial vault and data remain securely stored on your device."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleConfirmSignOut}
        testId="confirm-sign-out-dialog"
      />

      <UserGuide open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onOpenStatement={() => setStatementOpen(true)}
      />
      <MonthlyStatementModal
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
      />

      <AnimatePresence>
        {tourOpen && tourSteps && (
          <React.Suspense fallback={null}>
            <Tour steps={tourSteps} open onClose={closeTour} onFinish={closeTour} />
          </React.Suspense>
        )}
      </AnimatePresence>

      <main
        id="main-content"
        className={cn(
          "mx-auto w-full max-w-[1600px] px-4 pb-10 pt-[5.75rem] lg:pr-6 lg:pt-[5.5rem]",
          "[padding-right:max(1rem,env(safe-area-inset-right))]",
          "[padding-bottom:max(2.5rem,env(safe-area-inset-bottom))]",
          "[padding-left:max(1rem,env(safe-area-inset-left))]",
          collapsed
            ? "lg:pl-[88px] lg:[padding-left:calc(88px+max(0px,env(safe-area-inset-left)))]"
            : "lg:pl-60 lg:[padding-left:calc(15rem+max(0px,env(safe-area-inset-left)))]"
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
