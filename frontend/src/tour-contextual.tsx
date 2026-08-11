import type { TourStep } from "@/components/Tour";
import { TOUR_STEPS } from "./tour-steps";

/**
 * Route-based contextual tour steps
 * Maps routes to specific step groups for dynamic tour adaptation
 */

export interface RouteTourMap {
  [route: string]: {
    steps: TourStep[];
    priority: number; // Higher priority = shown first when navigating to this route
  };
}

/**
 * Main tour flow - the complete onboarding sequence
 */
export const MAIN_TOUR_FLOW = TOUR_STEPS;

/**
 * Contextual tour steps per route
 * These are shown when users navigate to specific pages during or after the tour
 */
export const ROUTE_CONTEXTUAL_STEPS: RouteTourMap = {
  "/dashboard": {
    steps: [
      {
        route: "/dashboard",
        target: "[data-testid='kpi-net']",
        kind: "hint",
        placement: "right",
        title: "Quick overview",
        body: "Your net balance and spending summary at a glance.",
        contextual: true,
      },
    ],
    priority: 1,
  },
  "/transactions": {
    steps: [
      {
        route: "/transactions",
        target: "[data-testid='nl-input']",
        kind: "hint",
        placement: "right",
        title: "Add transactions fast",
        body: "Type in plain English to add transactions quickly.",
        contextual: true,
      },
    ],
    priority: 2,
  },
  "/analytics": {
    steps: [
      {
        route: "/analytics",
        target: "[data-testid='comparison-toggle-btn']",
        kind: "hint",
        placement: "bottom",
        full: true,
        allowInteraction: true,
        title: "Explore analytics",
        body: "Charts and insights to understand your spending patterns.",
        contextual: true,
      },
    ],
    priority: 3,
  },
  "/budgets": {
    steps: [
      {
        route: "/budgets",
        target: "[data-testid='budget-add-btn']",
        kind: "hint",
        placement: "right",
        title: "Set budgets",
        body: "Create monthly budgets to control your spending.",
        contextual: true,
      },
    ],
    priority: 4,
  },
  "/goals": {
    steps: [
      {
        route: "/goals",
        target: "[data-testid='goal-add-btn']",
        kind: "hint",
        placement: "right",
        title: "Track goals",
        body: "Set savings goals and track your progress.",
        contextual: true,
      },
    ],
    priority: 5,
  },
  "/people": {
    steps: [
      {
        route: "/people",
        target: "[data-testid='person-add-btn']",
        kind: "hint",
        placement: "right",
        title: "Manage people",
        body: "Track shared expenses with friends and family.",
        contextual: true,
      },
    ],
    priority: 6,
  },
  "/ml-insights": {
    steps: [
      {
        route: "/ml-insights",
        target: "[data-testid='qa-chat-fab']",
        kind: "hint",
        placement: "left",
        title: "Ask questions",
        body: "Get insights from your data using natural language.",
        contextual: true,
      },
    ],
    priority: 7,
  },
  "/settings": {
    steps: [
      {
        route: "/settings",
        kind: "hint",
        placement: "bottom",
        title: "Customize Batua",
        body: "Themes, backup, and AI settings.",
        contextual: true,
      },
    ],
    priority: 8,
  },
};

/**
 * Get contextual steps for a specific route
 */
export function getContextualSteps(route: string): TourStep[] {
  const routeConfig = ROUTE_CONTEXTUAL_STEPS[route];
  return routeConfig?.steps || [];
}

/**
 * Check if a route has contextual tour steps available
 */
export function hasContextualSteps(route: string): boolean {
  return ROUTE_CONTEXTUAL_STEPS[route]?.steps.length > 0;
}

/**
 * Get all routes that have contextual steps, sorted by priority
 */
export function getRoutesWithContextualSteps(): string[] {
  return Object.entries(ROUTE_CONTEXTUAL_STEPS)
    .sort(([, a], [, b]) => b.priority - a.priority)
    .map(([route]) => route);
}
