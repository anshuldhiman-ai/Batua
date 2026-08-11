import React from "react";
import type { TourStep } from "@/components/Tour";

/**
 * Onboarding tour — a 12-step narrative that lands the four things that make
 * Batua special:
 *
 *   1. The dashboard — the KPI rail and trend line tell you where the money
 *      went in one glance (the "tough to understand" parts).
 *   2. Type it → the flagship. Steps 4–7 are a *live demo*: the tour auto-types
 *      a real line into the actual input, the user presses Parse, the tour
 *      *detects* the resulting preview and walks through the parsed details —
 *      including the split-payment feature.
 *   3. See it → analytics, budgets, AI chat.
 *   4. Make it yours → settings.
 *
 * Targets are stable `data-testid` selectors (the audit-verified id list in
 * CLAUDE.md), plus `dashboard-timeline` added for this tour.
 */

/** Inline example — "zomato 450 upi" — rendered as a theme-contrast chip so it
 *  stays readable on both light and dark cards (text-white was invisible on the
 *  white card in light mode). */
function Example({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
      {children}
    </span>
  );
}

export const TOUR_STEPS: TourStep[] = [
  // ── Welcome — one calm, single-action moment ──────────────────────
  {
    route: "/dashboard",
    hero: true,
    cta: "Start tour",
    title: "Meet Batua",
    body: (
      <>
        Type what you spent in plain English — one line in, one tracked
        transaction out. Everything stays on this device.
      </>
    ),
  },

  // ── The dashboard's core: the money KPI rail ─────────────────────
  {
    route: "/dashboard",
    target: "[data-testid='kpi-net']",
    kind: "spotlight",
    cta: "Next",
    title: "Money, at a glance",
    body: (
      <>
        What's left this month — <span className="font-semibold text-emerald-600 dark:text-emerald-400">green</span> is
        saving, <span className="font-semibold text-rose-500">red</span> is overspending. Tap any card to drill into it.
      </>
    ),
  },

  // ── The trend line ───────────────────────────────────────────────
  {
    route: "/dashboard",
    target: "[data-testid='dashboard-timeline']",
    kind: "hint",
    placement: "right",
    cta: "Next",
    title: "Where money flows",
    body: <>Your income vs expense over time — spot the spikes, ride the streaks.</>,
  },

  // ── The flagship: natural-language entry ──────────────────────────
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    kind: "spotlight",
    placement: "right",
    cta: "Try a live demo",
    title: "Just type it",
    body: (
      <>
        Drop the forms. Say <Example>zomato 450 upi</Example> — merchant, amount
        and payment are read for you. Let's try it for real.
      </>
    ),
  },

  // ── Live demo: auto-typed line → user presses Parse → auto-advance ─
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    kind: "spotlight",
    full: true,
    cta: "Continue",
    demo: {
      input: "2 samose 50 upi and chai 20 cash",
      waitFor: "[data-testid='nl-preview']",
    },
    title: "A real one, typed for you",
    body: (
      <>
        We typed <Example>2 samose 50 upi and chai 20 cash</Example> into the
        box — now press <span className="font-semibold text-primary">Parse</span>.
      </>
    ),
  },

  // ── The payoff: every field pre-filled ───────────────────────────
  {
    route: "/transactions",
    target: "[data-testid='nl-preview']",
    kind: "hint",
    placement: "bottom",
    full: true,
    cta: "Next",
    title: "One line, every detail",
    body: (
      <>
        Description, amount, date, category, payment — pre-filled from one
        sentence. Tweak anything before it's saved.
      </>
    ),
  },

  // ── The split-payment feature ────────────────────────────────────
  {
    route: "/transactions",
    target: "[data-testid='fragment-split']",
    kind: "hint",
    placement: "bottom",
    full: true,
    cta: "Got it",
    title: "One line, two items",
    body: (
      <>
        Batua caught 2 purchases in that line. Keep them together, or{" "}
        <span className="font-semibold text-primary">split them</span> — each
        becomes its own entry with its own category and payment.
      </>
    ),
  },

  // ── The payoff: analytics ────────────────────────────────────────
  {
    route: "/analytics",
    target: "[data-testid='comparison-toggle-btn']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    cta: "Next",
    title: "See your spending",
    body: (
      <>
        Breakdowns, treemaps, forecasts and anomaly alerts — hover any chart
        to explore.
      </>
    ),
  },
  {
    route: "/analytics",
    target: "[data-testid='category-chart']",
    kind: "hint",
    placement: "right",
    full: true,
    allowInteraction: true,
    cta: "Next",
    title: "Category breakdown",
    body: (
      <>
        See exactly where your money goes by category. Click on any segment
        to filter transactions.
      </>
    ),
  },
  {
    route: "/analytics",
    target: "[data-testid='trend-chart']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    cta: "Next",
    title: "Spending trends",
    body: (
      <>
        Track your spending patterns over time. Spot seasonal changes and
        identify areas for improvement.
      </>
    ),
  },

  // ── Plan ahead ───────────────────────────────────────────────────
  {
    route: "/budgets",
    target: "[data-testid='budget-add-btn']",
    kind: "hint",
    placement: "right",
    cta: "Next",
    title: "Stay on budget",
    body: <>Set a monthly limit per category and Batua warns you before you overspend.</>,
  },
  {
    route: "/budgets",
    target: "[data-testid='budget-progress']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    cta: "Next",
    title: "Track your progress",
    body: (
      <>
        Visual progress bars show how much you've spent vs your budget. Green
        means you're on track, red means slow down.
      </>
    ),
  },
  {
    route: "/budgets",
    target: "[data-testid='budget-health']",
    kind: "hint",
    placement: "left",
    cta: "Next",
    title: "Budget health score",
    body: (
      <>
        Get an overall health score for your budget. Improve it by staying
        within limits across all categories.
      </>
    ),
  },

  // ── Ask your data ────────────────────────────────────────────────
  {
    route: "/ml-insights",
    target: "[data-testid='qa-chat-fab']",
    kind: "hint",
    placement: "left",
    cta: "Next",
    title: "Ask your data anything",
    body: (
      <>
        Ask <Example>What did I spend on food last month?</Example> — answered
        from your own data, fully offline.
      </>
    ),
  },
  {
    route: "/ml-insights",
    target: "[data-testid='qa-chat-input']",
    kind: "hint",
    placement: "top",
    full: true,
    allowInteraction: true,
    cta: "Next",
    title: "Natural language queries",
    body: (
      <>
        Type questions in plain English. The AI understands context and
        provides accurate answers from your transaction history.
      </>
    ),
  },

  // ── Track goals ───────────────────────────────────────────────────
  {
    route: "/goals",
    target: "[data-testid='goal-add-btn']",
    kind: "hint",
    placement: "right",
    cta: "Next",
    title: "Set savings goals",
    body: <>Create goals for vacations, emergencies, or big purchases.</>,
  },
  {
    route: "/goals",
    target: "[data-testid='goal-progress']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    cta: "Next",
    title: "Track your progress",
    body: (
      <>
        See how close you are to each goal with visual progress indicators.
        Watch your savings grow over time.
      </>
    ),
  },

  // ── Manage people ─────────────────────────────────────────────────
  {
    route: "/people",
    target: "[data-testid='person-add-btn']",
    kind: "hint",
    placement: "right",
    cta: "Next",
    title: "Track shared expenses",
    body: <>Add people to track shared expenses, split bills, and settle up.</>,
  },
  {
    route: "/people",
    target: "[data-testid='person-list']",
    kind: "hint",
    placement: "bottom",
    full: true,
    allowInteraction: true,
    cta: "Next",
    title: "People overview",
    body: (
      <>
        See all your tracked people at a glance. Click on any person to view
        their transaction history and balances.
      </>
    ),
  },

  // ── Make it yours ────────────────────────────────────────────────
  {
    route: "/settings",
    kind: "hint",
    placement: "bottom",
    full: true,
    cta: "Next",
    title: "Make it yours",
    body: <>Themes, backup, voice input and the AI assistant all live here.</>,
  },

  // ── Finish ───────────────────────────────────────────────────────
  {
    route: "/dashboard",
    kind: "hint",
    cta: "Done",
    title: "You're set",
    body: (
      <>
        Start with one line — even <Example>chai 20 cash</Example> — and revisit
        this tour anytime from the <span className="font-semibold text-foreground">?</span> button.
      </>
    ),
  },
];