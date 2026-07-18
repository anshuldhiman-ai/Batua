import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  ReceiptText,
  ChartColumnBig,
  Wallet,
  Target,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Brain,
  Menu,
  X,
} from "lucide-react";

import { ThemeContext } from "@/App";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

// Pick the right on-brand logo tile for the current theme.
// In light UI we want the dark-tile logo to stand out; in dark UI we want the
// light-tile logo so the tile is visible against a dark background.
function brandLogoSrc(theme) {
  return theme === "dark" ? "/batua-logo-dark.png" : "/batua-logo-light.png";
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
  { to: "/analytics", label: "Analytics", icon: ChartColumnBig },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/ml-insights", label: "AI Insights", icon: Brain },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function ThemeToggle({ className }) {
  const { theme, toggle } = React.useContext(ThemeContext);
  const reduce = useReducedMotion();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
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
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center"
        >
          {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/* ─── Desktop sidebar ─────────────────────────────────────────────── */
function DesktopSidebar() {
  const location = useLocation();
  const { theme } = React.useContext(ThemeContext);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-border/50 bg-card/80 backdrop-blur-xl lg:flex xl:w-56"
      aria-label="Sidebar navigation"
    >
      <NavLink to="/dashboard" className="flex items-center gap-3 pl-9 pr-1 py-5 xl:px-9">
        <img
          src={brandLogoSrc(theme)}
          alt="Batua"
          className="h-7 w-7 shrink-0 rounded object-cover shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.5)]"
        />
        <span className="hidden font-brand text-xl tracking-wide xl:inline">
          Batua
        </span>
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
              <span className="relative hidden truncate xl:inline">{tab.label}</span>
              {isActive && (
                <span className="relative ml-auto hidden h-1.5 w-1.5 rounded-full bg-primary xl:inline-block" />
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border/50 p-3">
        <ThemeToggle className="w-full xl:w-10" />
      </div>
    </aside>
  );
}

/* ─── Mobile top bar + drawer ─────────────────────────────────────── */
function MobileNav() {
  const location = useLocation();
  const { theme } = React.useContext(ThemeContext);
  const [isOpen, setIsOpen] = useState(false);

  const activeIndex = Math.max(
    0,
    NAV.findIndex((item) => location.pathname.startsWith(item.to))
  );

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 top-0 z-50 lg:hidden">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          "[padding-left:max(1rem,env(safe-area-inset-left))]",
          "[padding-right:max(1rem,env(safe-area-inset-right))]",
          "[padding-top:max(0.75rem,env(safe-area-inset-top))]",
          "border-b border-border/40 bg-card/90 backdrop-blur-xl"
        )}
      >
        <NavLink to="/dashboard" className="flex items-center gap-2.5">
          <img src={brandLogoSrc(theme)} alt="Batua" className="h-6 w-6 rounded object-cover" />
          <span className="font-brand text-lg tracking-wide">Batua</span>
        </NavLink>
        <div className="flex items-center gap-2">
          <ThemeToggle className="h-9 w-9" data-testid="dark-mode-toggle-mobile" />
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

      <div
        className={cn(
          "fixed inset-0 bg-background/60 backdrop-blur-sm transition-opacity lg:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        style={{ top: "calc(57px + env(safe-area-inset-top))" }}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <div
        className={cn(
          "fixed inset-x-0 border-b border-border/40 bg-card/95 backdrop-blur-xl transition-all lg:hidden",
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        )}
        style={{ top: "calc(57px + env(safe-area-inset-top))" }}
      >
        <div className="space-y-0.5 px-3 py-2">
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
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/40"
                )}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>
      <DesktopSidebar />
      <MobileNav />

      <main
        id="main-content"
        className={cn(
          "mx-auto w-full max-w-[1600px] px-4 pb-10 pt-20 lg:pl-[88px] lg:pr-6 lg:pt-8 xl:pl-60",
          "[padding-left:max(1rem,env(safe-area-inset-left))]",
          "[padding-right:max(1rem,env(safe-area-inset-right))]",
          "[padding-bottom:max(2.5rem,env(safe-area-inset-bottom))]",
          "lg:[padding-left:calc(88px+max(0px,env(safe-area-inset-left)))]",
          "xl:[padding-left:calc(15rem+max(0px,env(safe-area-inset-left)))]"
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
