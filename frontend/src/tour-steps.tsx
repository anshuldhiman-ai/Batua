import React from "react";
import type { TourStep } from "@/components/Tour";

/**
 * Onboarding tour — walks a brand-new user through capture → understand →
 * plan → configure, organised into visible chapters so the tour reads as a
 * structured narrative, not a pile of pointers. Targets are stable
 * `data-testid` selectors (the audit-verified id list in CLAUDE.md).
 *
 * Per the master design brief, steps use two coach-mark types:
 *   - kind "spotlight" (Type A, max 1–2 per tour) — reserved for the "aha"
 *     moments: the welcome hero and the natural-language input bar.
 *   - kind "hint" (Type B) — everything else: quiet anchored cards.
 *
 * The panel chrome (accent bar, chapter eyebrow, progress, buttons) is
 * identical on every step so blurred and full-page steps feel like one system.
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
  // ── Chapter 1 · Welcome ────────────────────────────────────────────
  {
    route: "/dashboard",
    kind: "spotlight",
    cta: "Show me around",
    chapter: { label: "Welcome" },
    title: "Welcome to Batua",
    body: (
      <>
        Your money, in plain English — and it all stays{" "}
        on this device. A 60-second tour covers the essentials.
      </>
    ),
  },
  // ── Chapter 2 · Add your money ─────────────────────────────────────
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    kind: "spotlight",
    placement: "right",
    cta: "Got it",
    chapter: { label: "Add your money" },
    title: "Just type it naturally",
    body: (
      <>
        Type <Example>zomato 450 upi</Example> and press enter — amount,
        category and payment are parsed for you.
      </>
    ),
  },
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    kind: "hint",
    placement: "bottom",
    chapter: { label: "Add your money" },
    title: "Split one line into many",
    body: (
      <>
        Bought a few things at once?{" "}
        <Example>2 samosay 50 upi and chai 20 cash</Example> — split them into
        separate entries.
      </>
    ),
  },
  {
    route: "/transactions",
    target: "[data-testid='txn-search']",
    kind: "hint",
    placement: "right",
    chapter: { label: "Add your money" },
    title: "Search & export everything",
    body: <>Find any transaction, or export the whole lot to CSV or Excel.</>,
  },
  // ── Chapter 3 · Understand your spending ───────────────────────────
  {
    route: "/dashboard",
    target: "[data-testid='kpi-income']",
    kind: "hint",
    placement: "right",
    chapter: { label: "Understand your spending" },
    title: "Your numbers at a glance",
    body: <>Income, expense and savings rate — each with last month's trend.</>,
  },
  {
    route: "/dashboard",
    target: "[data-testid='alltime-overview']",
    kind: "hint",
    placement: "top",
    full: true,
    chapter: { label: "Understand your spending" },
    title: "Filter any time range",
    body: <>Monthly, weekly or custom — every overview re-computes instantly.</>,
  },
  {
    route: "/analytics",
    target: "[data-testid='comparison-toggle-btn']",
    kind: "hint",
    placement: "bottom",
    full: true,
    chapter: { label: "Understand your spending" },
    title: "Study your spending",
    body: <>Breakdowns, treemaps and a heatmap — switch views and hover anything.</>,
  },
  // ── Chapter 4 · Plan & configure ───────────────────────────────────
  {
    route: "/budgets",
    target: "[data-testid='budget-add-btn']",
    kind: "hint",
    placement: "right",
    chapter: { label: "Plan & configure" },
    title: "Set monthly limits",
    body: <>Cap a category and Batua flags overspend before it happens.</>,
  },
  {
    route: "/goals",
    target: "[data-testid='add-goal-btn']",
    kind: "hint",
    placement: "right",
    chapter: { label: "Plan & configure" },
    title: "Plan your savings",
    body: <>Set a target and date; Batua predicts your chances of hitting it.</>,
  },
  {
    route: "/people",
    target: "[data-testid='add-entry-btn']",
    kind: "hint",
    placement: "right",
    chapter: { label: "Plan & configure" },
    title: "Track money between friends",
    body: <>Log who gave or took — chai splits, loans, rent — in one ledger.</>,
  },
  {
    route: "/ml-insights",
    target: "[data-testid='qa-chat-fab']",
    kind: "hint",
    placement: "left",
    chapter: { label: "Plan & configure" },
    title: "Ask your data anything",
    body: (
      <>
        Ask <Example>What did I spend on food last month?</Example> — answered
        from your own data, fully offline.
      </>
    ),
  },
  {
    route: "/settings",
    kind: "hint",
    placement: "bottom",
    full: true,
    chapter: { label: "Plan & configure" },
    title: "Make it yours",
    body: <>Themes, backup, voice input and the AI assistant all live here.</>,
  },
  // ── Finish ─────────────────────────────────────────────────────────
  {
    route: "/dashboard",
    kind: "hint",
    cta: "Done",
    title: "You're all set",
    body: (
      <>
        Start with one line — even <Example>chai 20 cash</Example> — and re-run
        this tour anytime from the <span className="font-semibold text-foreground">?</span> button.
      </>
    ),
  },
];
