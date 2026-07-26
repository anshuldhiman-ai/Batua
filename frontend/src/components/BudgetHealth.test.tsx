import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import BudgetHealth from "./BudgetHealth";

// Mock the API module
vi.mock("@/lib/utils-finance", () => ({
  api: {
    get: vi.fn(),
  },
  formatINR: vi.fn((val, opts) => {
    const n = Number(val) || 0;
    const compact = opts?.compact;
    if (compact && Math.abs(n) >= 1000) {
      return `₹${(n / 1000).toFixed(1)}K`;
    }
    return `₹${n.toLocaleString("en-IN")}`;
  }),
  categoryColor: vi.fn(() => "#64748b"),
}));

// Mock react-router-dom Link separately (MemoryRouter handles routing)
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children, to, ...props }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock framer-motion to render children directly
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
  useReducedMotion: () => false,
}));

import { api } from "@/lib/utils-finance";
const mockedGet = vi.mocked(api.get);

function renderHealth(month?: string) {
  return render(
    <MemoryRouter>
      <BudgetHealth month={month} />
    </MemoryRouter>
  );
}

describe("BudgetHealth Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton while fetching", () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    renderHealth("2026-06");
    expect(screen.getByTestId("budget-health")).toBeInTheDocument();
    expect(screen.getByText("Budget Health")).toBeInTheDocument();
  });

  it("shows empty state when no budgets exist", async () => {
    mockedGet.mockResolvedValue({ data: { rows: [] } });
    renderHealth("2026-06");
    expect(await screen.findByText("No budgets set for this month yet.")).toBeInTheDocument();
    expect(screen.getByText("Set a budget")).toBeInTheDocument();
  });

  it("renders budget rows with different statuses", async () => {
    mockedGet.mockResolvedValue({
      data: {
        rows: [
          {
            id: "1", category: "Food", limit: 5000, spent: 3000,
            remaining: 2000, status: "ok", pct: 60,
          },
          {
            id: "2", category: "Transport", limit: 2000, spent: 1800,
            remaining: 200, status: "warn", pct: 90,
          },
          {
            id: "3", category: "Shopping", limit: 3000, spent: 3500,
            remaining: -500, status: "over", pct: 116.7,
          },
        ],
      },
    });
    renderHealth("2026-06");

    expect(await screen.findByTestId("budget-health-Food")).toBeInTheDocument();
    expect(screen.getByTestId("budget-health-Transport")).toBeInTheDocument();
    expect(screen.getByTestId("budget-health-Shopping")).toBeInTheDocument();

    expect(screen.getByText("1 over")).toBeInTheDocument();
  });

  it("shows correct API call with month param", async () => {
    mockedGet.mockResolvedValue({ data: { rows: [] } });
    renderHealth("2026-06");
    await screen.findByText("No budgets set for this month yet.");

    expect(api.get).toHaveBeenCalledWith("/budgets/status", {
      params: { month: "2026-06" },
    });
  });

  it("calls API without month when not provided", async () => {
    mockedGet.mockResolvedValue({ data: { rows: [] } });
    renderHealth();
    await screen.findByText("No budgets set for this month yet.");

    expect(api.get).toHaveBeenCalledWith("/budgets/status", {
      params: {},
    });
  });

  it("handles API error gracefully (shows empty state)", async () => {
    mockedGet.mockRejectedValue(new Error("Network error"));
    renderHealth();
    expect(await screen.findByText("No budgets set for this month yet.")).toBeInTheDocument();
  });

  it("limits visible rows to 6", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: String(i), category: `Cat${i}`, limit: 1000, spent: 500,
      remaining: 500, status: "ok", pct: 50,
    }));
    mockedGet.mockResolvedValue({ data: { rows } });
    renderHealth("2026-06");

    await screen.findByTestId("budget-health-Cat0");
    expect(screen.queryByTestId("budget-health-Cat6")).not.toBeInTheDocument();
  });
});
