import React from "react";
import type { TourStep } from "@/components/Tour";

export type FeatureKey =
  | "kpi-net"
  | "dashboard-timeline"
  | "nl-card"
  | "nl-input"
  | "nl-preview"
  | "fragment-split"
  | "comparison-toggle-btn"
  | "category-chart"
  | "trend-chart"
  | "budget-add-btn"
  | "budget-progress"
  | "budget-health"
  | "goal-add-btn"
  | "goal-progress"
  | "person-add-btn"
  | "person-list"
  | "qa-chat-fab"
  | "qa-chat-input"
  | "settings";

export interface FeatureTourStep extends TourStep {
  featureKey: FeatureKey;
  route: string;
  category: "Dashboard" | "Transactions" | "Analytics" | "Budgets" | "Goals" | "People" | "AI Insights" | "Settings";
}

/**
 * Rich Feature Registry
 * Maps interactive element selectors / feature keys to contextual explanations.
 * When a user clicks any element during the tour, this registry resolves the explanation.
 */
export const FEATURE_REGISTRY: Record<string, FeatureTourStep> = {
  // ── Dashboard ─────────────────────────────────────────────────────────────
  "[data-testid='kpi-net']": {
    featureKey: "kpi-net",
    route: "/dashboard",
    category: "Dashboard",
    target: "[data-testid='kpi-net']",
    kind: "spotlight",
    placement: "right",
    title: "Net Balance & Summary",
    body: "Your monthly snapshot — green indicates savings, red indicates net deficit. Click any KPI card to see specific transaction breakdowns.",
    contextual: true,
  },
  "[data-testid='dashboard-timeline']": {
    featureKey: "dashboard-timeline",
    route: "/dashboard",
    category: "Dashboard",
    target: "[data-testid='dashboard-timeline']",
    kind: "hint",
    placement: "bottom",
    title: "Income vs Expense Flow",
    body: "A visual timeline of your cash flow over time. Look for spending spikes and track your savings momentum across months.",
    contextual: true,
  },

  // ── Transactions ─────────────────────────────────────────────────────────
  "[data-testid='nl-card']": {
    featureKey: "nl-card",
    route: "/transactions",
    category: "Transactions",
    target: "[data-testid='nl-card']",
    kind: "spotlight",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    title: "Smart Transaction Adder",
    body: "Add one-off, recurring, or bulk transactions in plain English. Batua extracts merchant, amount, category, and payment method automatically.",
    contextual: true,
  },
  "[data-testid='nl-input']": {
    featureKey: "nl-input",
    route: "/transactions",
    category: "Transactions",
    target: "[data-testid='nl-input']",
    kind: "spotlight",
    placement: "right",
    full: true,
    allowInteraction: true,
    title: "Natural Language Input",
    body: "Simply type what you spent — like 'zomato 450 yesterday upi' or 'salary 85k on 5th' — no tedious form dropdowns required.",
    contextual: true,
  },
  "[data-testid='nl-preview']": {
    featureKey: "nl-preview",
    route: "/transactions",
    category: "Transactions",
    target: "[data-testid='nl-preview']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    title: "Parsed Transaction Preview",
    body: "Review every pre-filled field here before saving. You can adjust categories, amounts, or dates with a single tap.",
    contextual: true,
  },
  "[data-testid='fragment-split']": {
    featureKey: "fragment-split",
    route: "/transactions",
    category: "Transactions",
    target: "[data-testid='fragment-split']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    title: "Multi-Item Split",
    body: "When your sentence contains multiple purchases (e.g. 'chai 20 and samosa 30'), Batua lets you split them into separate categorized entries.",
    contextual: true,
  },

  // ── Analytics ────────────────────────────────────────────────────────────
  "[data-testid='comparison-toggle-btn']": {
    featureKey: "comparison-toggle-btn",
    route: "/analytics",
    category: "Analytics",
    target: "[data-testid='comparison-toggle-btn']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    title: "Period Comparison",
    body: "Toggle comparison mode to compare this month's spending against previous months or historical averages side-by-side.",
    contextual: true,
  },
  "[data-testid='category-chart']": {
    featureKey: "category-chart",
    route: "/analytics",
    category: "Analytics",
    target: "[data-testid='category-chart']",
    kind: "hint",
    placement: "right",
    full: true,
    allowInteraction: true,
    fallback: {
      route: "/analytics",
      target: "main",
      kind: "hint",
      title: "Category Breakdown",
      body: "Visual distribution of your spending by category. Click any slice to inspect matching transactions.",
    },
    title: "Category Breakdown Chart",
    body: "See exactly where your money goes by category. Hover or tap segments to inspect exact totals.",
    contextual: true,
  },
  "[data-testid='trend-chart']": {
    featureKey: "trend-chart",
    route: "/analytics",
    category: "Analytics",
    target: "[data-testid='trend-chart']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    fallback: {
      route: "/analytics",
      target: "main",
      kind: "hint",
      title: "Spending Trends",
      body: "Track historical trends across food, transport, and utilities.",
    },
    title: "Spending Trends & Patterns",
    body: "Track your spending velocity over time. Identify recurring monthly surges and seasonal shifts.",
    contextual: true,
  },

  // ── Budgets ──────────────────────────────────────────────────────────────
  "[data-testid='budget-add-btn']": {
    featureKey: "budget-add-btn",
    route: "/budgets",
    category: "Budgets",
    target: "[data-testid='budget-add-btn']",
    kind: "hint",
    placement: "left",
    title: "Create Category Budget",
    body: "Set monthly spending limits for categories like Food, Entertainment, or Shopping to prevent overspending.",
    contextual: true,
  },
  "[data-testid='budget-progress']": {
    featureKey: "budget-progress",
    route: "/budgets",
    category: "Budgets",
    target: "[data-testid='budget-progress']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    fallback: {
      route: "/budgets",
      target: "[data-testid='budget-add-btn']",
      kind: "hint",
      placement: "left",
      title: "Budget Progress Tracker",
      body: "Create your first category budget to see real-time color-coded progress bars (Green = Safe, Red = Exceeded).",
    },
    title: "Real-Time Budget Limits",
    body: "Color-coded progress bars show how much you've spent versus your limit (Green = Safe, Yellow = Warning, Red = Limit Exceeded).",
    contextual: true,
  },
  "[data-testid='budget-health']": {
    featureKey: "budget-health",
    route: "/budgets",
    category: "Budgets",
    target: "[data-testid='budget-health']",
    kind: "hint",
    placement: "left",
    fallback: {
      route: "/budgets",
      target: "main",
      kind: "hint",
      title: "Budget Health Score",
      body: "Overall financial discipline score computed from your active budgets.",
    },
    title: "Overall Budget Health Score",
    body: "A single health index evaluating your overall spending discipline across all budgeted categories.",
    contextual: true,
  },

  // ── Goals ────────────────────────────────────────────────────────────────
  "[data-testid='goal-add-btn']": {
    featureKey: "goal-add-btn",
    route: "/goals",
    category: "Goals",
    target: "[data-testid='goal-add-btn']",
    kind: "hint",
    placement: "left",
    title: "Add Savings Goal",
    body: "Create target funds for vacations, emergency cushions, or major purchases with target amounts and dates.",
    contextual: true,
  },
  "[data-testid='add-goal-btn']": {
    featureKey: "goal-add-btn",
    route: "/goals",
    category: "Goals",
    target: "[data-testid='add-goal-btn']",
    kind: "hint",
    placement: "left",
    title: "Add Savings Goal",
    body: "Create target funds for vacations, emergency cushions, or major purchases with target amounts and dates.",
    contextual: true,
  },
  "[data-testid='goal-progress']": {
    featureKey: "goal-progress",
    route: "/goals",
    category: "Goals",
    target: "[data-testid='goal-progress']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    fallback: {
      route: "/goals",
      target: "[data-testid='add-goal-btn']",
      kind: "hint",
      placement: "left",
      title: "Goal Savings Tracker",
      body: "Add a savings goal to track your percentage completed and estimated completion date.",
    },
    title: "Savings Goal Progress",
    body: "Track percentage completed toward your financial milestone and see your estimated completion date.",
    contextual: true,
  },

  // ── People ───────────────────────────────────────────────────────────────
  "[data-testid='person-add-btn']": {
    featureKey: "person-add-btn",
    route: "/people",
    category: "People",
    target: "[data-testid='person-add-btn']",
    kind: "hint",
    placement: "left",
    title: "Track Shared Expenses",
    body: "Add friends, family, or roommates to track shared bills, IOUs, and split transactions effortlessly.",
    contextual: true,
  },
  "[data-testid='add-entry-btn']": {
    featureKey: "person-add-btn",
    route: "/people",
    category: "People",
    target: "[data-testid='add-entry-btn']",
    kind: "hint",
    placement: "left",
    title: "Track Shared Expenses",
    body: "Add friends, family, or roommates to track shared bills, IOUs, and split transactions effortlessly.",
    contextual: true,
  },
  "[data-testid='person-list']": {
    featureKey: "person-list",
    route: "/people",
    category: "People",
    target: "[data-testid='person-list']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    fallback: {
      route: "/people",
      target: "[data-testid='person-add-btn']",
      kind: "hint",
      placement: "left",
      title: "People Balances",
      body: "Add a person to track net balances (+ they owe you, - you owe them) and record settlements.",
    },
    title: "People Balances & Debt Tracker",
    body: "View net balances per person (+ green means they owe you, - red means you owe them) and settle up with one click.",
    contextual: true,
  },

  // ── AI Insights & Chat ────────────────────────────────────────────────────
  "[data-testid='qa-chat-fab']": {
    featureKey: "qa-chat-fab",
    route: "/ml-insights",
    category: "AI Insights",
    target: "[data-testid='qa-chat-fab']",
    kind: "hint",
    placement: "left",
    title: "Local AI Finance Assistant",
    body: "Ask questions about your finances in plain English — answers are processed entirely on your device with complete privacy.",
    contextual: true,
  },
  "[data-testid='qa-chat-input']": {
    featureKey: "qa-chat-input",
    route: "/ml-insights",
    category: "AI Insights",
    target: "[data-testid='qa-chat-input']",
    kind: "hint",
    placement: "top",
    full: true,
    allowInteraction: true,
    title: "Ask Custom Financial Questions",
    body: "Query your data: 'How much did I spend on food in May?' or 'What is my average monthly coffee expense?'",
    contextual: true,
  },
};

/**
 * Match a clicked element or selector string to a registered feature step
 */
export function findFeatureStepForSelector(selectorOrTestId: string): FeatureTourStep | null {
  if (!selectorOrTestId) return null;
  
  // Exact match
  if (FEATURE_REGISTRY[selectorOrTestId]) {
    return FEATURE_REGISTRY[selectorOrTestId];
  }

  // Format as data-testid if missing
  const testIdKey = `[data-testid='${selectorOrTestId.replace(/^[\["']|["'\]]$/g, "")}']`;
  if (FEATURE_REGISTRY[testIdKey]) {
    return FEATURE_REGISTRY[testIdKey];
  }

  return null;
}
