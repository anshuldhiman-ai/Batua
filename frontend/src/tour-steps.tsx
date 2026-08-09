import React from "react";
import type { TourStep } from "@/components/Tour";

/**
 * Onboarding tour — one step per key screen, walking a brand-new user through
 * capture → understand → ask → configure. Targets are stable `data-testid`
 * selectors (see the audit-verified id list in CLAUDE.md).
 */
export const TOUR_STEPS: TourStep[] = [
  {
    route: "/dashboard",
    target: "main",
    title: "👋 Welcome to Batua",
    body: (
      <>
        Your personal, <span className="font-medium text-foreground">privacy-first finance manager</span>. Every
        rupee of yours stays on this device — nothing ever leaves your machine. Take two minutes to see how
        everything works.
      </>
    ),
    placement: "bottom",
  },
  {
    route: "/dashboard",
    target: "[data-testid='kpi-income']",
    title: "📊 Your numbers at a glance",
    body: (
      <>
        These tiles show <span className="font-medium text-foreground">Income, Expense, Net and Savings rate</span> for
        the selected month. The arrows compare against the previous month, and the sparkline shows your trend over
        time.
      </>
    ),
    placement: "right",
  },
  {
    route: "/dashboard",
    target: "[data-testid='alltime-overview']",
    title: "⏳ Overview & filters",
    body: (
      <>
        Switch between <span className="font-medium text-foreground">monthly, weekly or custom ranges</span> here and
        see every overview card re-compute instantly. Your date preference is remembered across visits.
      </>
    ),
    placement: "top",
  },
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    title: "✍️ Just type it like you'd say it",
    body: (
      <>
        This is Batua's superpower — type “<span className="font-medium text-foreground">zomato 450 upi</span>” or “{""}
        <span className="font-medium text-foreground">salary 85000 credit</span>” and press <kbd>Enter</kbd>. The
        amount, category, date and payment method are parsed for you automatically.
      </>
    ),
    placement: "right",
  },
  {
    route: "/transactions",
    target: "[data-testid='nl-input']",
    title: "🧩 Split multi-item lines",
    body: (
      <>
        Type a line with several items — “<span className="font-medium text-foreground">2 samosay 50 upi and 1 cup
        coffe 15 cash</span>” — and a <span className="font-medium text-foreground">split toggle</span> appears. Save
        it as one combined entry, or split it into separate transactions, each with <em>its own</em> category,
        quantity and payment method.
      </>
    ),
    placement: "right",
  },
  {
    route: "/transactions",
    target: "[data-testid='txn-search']",
    title: "🔍 Find anything, fast",
    body: (
      <>
        Every transaction is searchable here — by merchant, category or amount. You can also{" "}
        <span className="font-medium text-foreground">export to CSV/Excel</span>, import a bank statement, bulk-delete,
        or snap a receipt.
      </>
    ),
    placement: "right",
  },
  {
    route: "/analytics",
    target: "[data-testid='comparison-toggle-btn']",
    title: "📈 Study your spending",
    body: (
      <>
        Timelines, category breakdowns, top merchants, payment-method mix, treemaps and a GitHub-style heatmap. Toggle
        daily/weekly/monthly views here and hover any chart for details.
      </>
    ),
    placement: "right",
  },
  {
    route: "/budgets",
    target: "[data-testid='budget-add-btn']",
    title: "🎯 Set budget limits",
    body: (
      <>
        Set a monthly limit per category and watch the live health bar. If you're overspending, Batua tells you — and
        suggests how much to trim.
      </>
    ),
    placement: "right",
  },
  {
    route: "/goals",
    target: "[data-testid='add-goal-btn']",
    title: "🏆 Savings goals",
    body: (
      <>
        Create a goal with a target amount and date — like “₹50,000 emergency fund by December”. Batua estimates your
        monthly contribution and the probability of hitting the target on time.
      </>
    ),
    placement: "right",
  },
  {
    route: "/people",
    target: "[data-testid='add-entry-btn']",
    title: "🤝 Track money with people",
    body: (
      <>
        Keep a personal ledger of who gave or took money — chai with friends, rent splits, loans. Each entry stays
        linked to your bigger financial picture.
      </>
    ),
    placement: "right",
  },
  {
    route: "/ml-insights",
    target: "[data-testid='qa-chat-fab']",
    title: "💬 Ask your data anything",
    body: (
      <>
        Tap the chat bubble to ask questions like “<span className="font-medium text-foreground">what did I spend on
        food last month?</span>” — even follow-ups like “what about groceries?”. Answers are grounded in your real
        transactions and run on your local AI model (no internet needed).
      </>
    ),
    placement: "left",
  },
  {
    route: "/settings",
    target: "main",
    title: "⚙️ Your preferences",
    body: (
      <>
        Themes, currency, data backup/restore, voice input and the AI assistant all live here. The health pill shows
        which services (AI, voice, storage) are working on this device.
      </>
    ),
    placement: "bottom",
  },
  {
    route: "/dashboard",
    target: "main",
    title: "✅ You're all set!",
    body: (
      <>
        Start by adding your first transaction — even a single “<span className="font-medium text-foreground">chai
        20 cash</span>” counts. You can restart this tour anytime from the top-left menu.
      </>
    ),
    placement: "bottom",
  },
];