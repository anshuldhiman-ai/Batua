import React from "react";
import type { TourStep } from "@/components/Tour";

/**
 * Onboarding tour — a tight 7-step narrative that lands the three things that
 * make Batua special (type it → see it → ask it), then one quiet "make it
 * yours". Secondary features (people, goals, split) are discoverable in-app;
 * they don't earn a tour step. Targets are stable `data-testid` selectors
 * (the audit-verified id list in CLAUDE.md).
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
        Type what you spent in plain English — and it all stays{" "}
        on this device. A 60-second tour shows you the essentials.
      </>
    ),
  },
  // ── The flagship: natural-language entry ──────────────────────────
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    kind: "spotlight",
    placement: "right",
    cta: "Got it",
    title: "Just type it",
    body: (
      <>
        Type <Example>zomato 450 upi</Example> and hit enter — amount, category
        and payment are parsed for you.
      </>
    ),
  },
  // ── The payoff: analytics ─────────────────────────────────────────
  {
    route: "/analytics",
    target: "[data-testid='comparison-toggle-btn']",
    kind: "hint",
    placement: "bottom",
    full: true,
    title: "See your spending",
    body: (
      <>
        Breakdowns, treemaps, forecasts and anomaly alerts — hover any chart
        to explore.
      </>
    ),
  },
  // ── Plan ahead ────────────────────────────────────────────────────
  {
    route: "/budgets",
    target: "[data-testid='budget-add-btn']",
    kind: "hint",
    placement: "right",
    title: "Stay on budget",
    body: <>Set a monthly limit per category and Batua warns you before you overspend.</>,
  },
  // ── Ask your data ─────────────────────────────────────────────────
  {
    route: "/ml-insights",
    target: "[data-testid='qa-chat-fab']",
    kind: "hint",
    placement: "left",
    title: "Ask your data anything",
    body: (
      <>
        Ask <Example>What did I spend on food last month?</Example> — answered
        from your own data, fully offline.
      </>
    ),
  },
  // ── Make it yours ─────────────────────────────────────────────────
  {
    route: "/settings",
    kind: "hint",
    placement: "bottom",
    full: true,
    title: "Make it yours",
    body: <>Themes, backup, voice input and the AI assistant all live here.</>,
  },
  // ── Finish ────────────────────────────────────────────────────────
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