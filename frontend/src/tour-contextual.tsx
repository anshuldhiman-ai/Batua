import type { TourStep } from "@/components/Tour";
import { TOUR_STEPS } from "./tour-steps";
import { FEATURE_REGISTRY, findFeatureStepForSelector } from "./tour-registry";

export interface RouteTourMap {
  [route: string]: {
    steps: TourStep[];
    priority: number;
  };
}

/**
 * Main tour flow - the complete onboarding sequence
 */
export const MAIN_TOUR_FLOW = TOUR_STEPS;

/**
 * Contextual tour steps per route
 */
export const ROUTE_CONTEXTUAL_STEPS: RouteTourMap = {
  "/dashboard": {
    steps: [
      FEATURE_REGISTRY["[data-testid='kpi-net']"],
      FEATURE_REGISTRY["[data-testid='dashboard-timeline']"],
    ].filter(Boolean),
    priority: 1,
  },
  "/transactions": {
    steps: [
      FEATURE_REGISTRY["[data-testid='nl-card']"],
      FEATURE_REGISTRY["[data-testid='nl-input']"],
      FEATURE_REGISTRY["[data-testid='fragment-split']"],
    ].filter(Boolean),
    priority: 2,
  },
  "/analytics": {
    steps: [
      FEATURE_REGISTRY["[data-testid='comparison-toggle-btn']"],
      FEATURE_REGISTRY["[data-testid='category-chart']"],
      FEATURE_REGISTRY["[data-testid='trend-chart']"],
    ].filter(Boolean),
    priority: 3,
  },
  "/budgets": {
    steps: [
      FEATURE_REGISTRY["[data-testid='budget-add-btn']"],
      FEATURE_REGISTRY["[data-testid='budget-progress']"],
      FEATURE_REGISTRY["[data-testid='budget-health']"],
    ].filter(Boolean),
    priority: 4,
  },
  "/goals": {
    steps: [
      FEATURE_REGISTRY["[data-testid='goal-add-btn']"],
      FEATURE_REGISTRY["[data-testid='goal-progress']"],
    ].filter(Boolean),
    priority: 5,
  },
  "/people": {
    steps: [
      FEATURE_REGISTRY["[data-testid='person-add-btn']"],
      FEATURE_REGISTRY["[data-testid='person-list']"],
    ].filter(Boolean),
    priority: 6,
  },
  "/ml-insights": {
    steps: [
      FEATURE_REGISTRY["[data-testid='qa-chat-fab']"],
      FEATURE_REGISTRY["[data-testid='qa-chat-input']"],
    ].filter(Boolean),
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
  return (ROUTE_CONTEXTUAL_STEPS[route]?.steps.length ?? 0) > 0;
}

/**
 * Get all routes that have contextual steps, sorted by priority
 */
export function getRoutesWithContextualSteps(): string[] {
  return Object.entries(ROUTE_CONTEXTUAL_STEPS)
    .sort(([, a], [, b]) => b.priority - a.priority)
    .map(([route]) => route);
}

/**
 * Inspect an HTML element and its parent tree to find if it corresponds to a registered feature
 */
export function findFeatureStepForElement(el: HTMLElement | null): TourStep | null {
  if (!el) return null;
  let curr: HTMLElement | null = el;
  while (curr && curr !== document.body) {
    const testId = curr.getAttribute("data-testid");
    if (testId) {
      const match = findFeatureStepForSelector(`[data-testid='${testId}']`);
      if (match) return match;
    }
    const featureAttr = curr.getAttribute("data-tour-feature");
    if (featureAttr) {
      const match = findFeatureStepForSelector(featureAttr);
      if (match) return match;
    }
    curr = curr.parentElement;
  }
  return null;
}
