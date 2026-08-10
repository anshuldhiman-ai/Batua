import React from "react";
import type { TourStep } from "@/components/Tour";

/**
 * Onboarding tour — walks a brand-new user through capture → understand →
 * ask → configure. Targets are stable `data-testid` selectors (the audit-
 * verified id list in CLAUDE.md).
 *
 * Per the master design brief, steps use two coach-mark types:
 *   - kind "spotlight" (Type A, max 1–2 per tour) — reserved for the "aha"
 *     moments: the welcome hero and the natural-language input bar.
 *   - kind "hint" (Type B) — everything else: quiet anchored cards.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    route: "/dashboard",
    kind: "spotlight",
    cta: "Show me around",
    title: "Welcome to Batua",
    body: (
      <>
        Your money, in plain English — and it all stays{" "}
        <span className="font-medium text-white">on this device</span>.
      </>
    ),
  },
  {
    route: "/dashboard",
    target: "[data-testid='kpi-income']",
    kind: "hint",
    placement: "right",
    title: "Your numbers at a glance",
    body: <>Income, expense and savings rate — each with last month's trend.</>,
  },
  {
    route: "/dashboard",
    target: "[data-testid='alltime-overview']",
    kind: "hint",
    placement: "top",
    title: "Filter any time range",
    body: <>Monthly, weekly or custom — every overview re-computes instantly.</>,
  },
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    kind: "spotlight",
    placement: "right",
    cta: "Got it",
    title: "Just type it naturally",
    body: (
      <>
        Try “<span className="font-medium text-white">zomato 450 upi</span>” — amount, category and
        payment method are parsed for you.
      </>
    ),
  },
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    kind: "hint",
    placement: "bottom",
    title: "Split one line into many",
    body: (
      <>
        List several items — “<span className="font-medium text-white">2 samosay 50 upi and 1 cup coffe 15
        cash</span>” — then split them apart, each with its own category and payment.
      </>
    ),
  },
  {
    route: "/transactions",
    target: "[data-testid='txn-search']",
    kind: "hint",
    placement: "right",
    title: "Search and export everything",
    body: <>Find any transaction, or export the whole lot to CSV or Excel.</>,
  },
  {
    route: "/analytics",
    target: "[data-testid='comparison-toggle-btn']",
    kind: "hint",
    placement: "bottom",
    title: "Study your spending",
    body: <>Breakdowns, treemaps and a heatmap — switch views and hover anything.</>,
  },
  {
    route: "/budgets",
    target: "[data-testid='budget-add-btn']",
    kind: "hint",
    placement: "right",
    title: "Set monthly limits",
    body: <>Cap a category and Batua flags overspend before it happens.</>,
  },
  {
    route: "/goals",
    target: "[data-testid='add-goal-btn']",
    kind: "hint",
    placement: "right",
    title: "Plan your savings",
    body: <>Set a target and date; Batua predicts your chances of hitting it.</>,
  },
  {
    route: "/people",
    target: "[data-testid='add-entry-btn']",
    kind: "hint",
    placement: "right",
    title: "Track money between friends",
    body: <>Log who gave or took — chai splits, loans, rent — in one ledger.</>,
  },
  {
    route: "/ml-insights",
    target: "[data-testid='qa-chat-fab']",
    kind: "hint",
    placement: "left",
    title: "Ask your data anything",
    body: (
      <>
        “<span className="font-medium text-white">What did I spend on food last month?</span>” — answered
        from your own data, fully offline.
      </>
    ),
  },
  {
    route: "/settings",
    kind: "hint",
    placement: "bottom",
    title: "Make it yours",
    body: <>Themes, backup, voice input and the AI assistant all live here.</>,
  },
  {
    route: "/dashboard",
    kind: "hint",
    cta: "Done",
    title: "You're all set",
    body: (
      <>
        Start with one line — even “<span className="font-medium text-white">chai 20 cash</span>” — and
        re-run this tour anytime from the <span className="font-medium text-white">?</span>.
      </>
    ),
  },
];