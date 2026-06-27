import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ReceiptText,
  ChartColumnBig,
  Wallet,
  FileBarChart,
  Settings as SettingsIcon,
  Moon,
  Sun,
  ChevronRight,
  Brain,
} from "lucide-react";

import { ThemeContext } from "@/App";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
  { to: "/analytics", label: "Analytics", icon: ChartColumnBig },
  { to: "/budgets", label: "Budgets", icon: Wallet },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/ml-insights", label: "AI Insights", icon: Brain },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-lg font-bold tracking-tight">Batua</div>
        <div className="text-[11px] text-muted-foreground">Personal Finance</div>
      </div>
    </div>
  );
}

function NavItems({ orientation = "vertical" }) {
  return (
    <nav
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-1 px-3"
          : "flex flex-row gap-1 px-3 overflow-x-auto no-scrollbar"
      )}
    >
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          data-testid={`nav-${label.toLowerCase()}`}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
              isActive
                ? "bg-primary/10 text-primary border-l-2 border-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground border-l-2 border-transparent"
            )
          }
        >
          <Icon className="h-[18px] w-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function DarkModeToggle() {
  const { theme, toggle } = React.useContext(ThemeContext);
  return (
    <button
      onClick={toggle}
      data-testid="dark-mode-toggle"
      aria-label="Toggle dark mode"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

export default function Layout() {
  const location = useLocation();
  const active = NAV.find((n) => location.pathname.startsWith(n.to));
  const crumb = active ? active.label : "Dashboard";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card/40">
        <div className="flex h-16 items-center border-b border-border">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavItems orientation="vertical" />
        </div>
        <div className="border-t border-border p-4 text-[11px] text-muted-foreground">
          Currency: INR (₹) · Single user
        </div>
      </aside>

      <div className="flex flex-1 flex-col md:pl-64">
        {/* Sticky header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-display font-semibold text-muted-foreground">Batua</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-display font-semibold">{crumb}</span>
          </div>
          <DarkModeToggle />
        </header>

        {/* Mobile nav — horizontal scroll */}
        <div className="md:hidden border-b border-border bg-card/40 py-2">
          <NavItems orientation="horizontal" />
        </div>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
