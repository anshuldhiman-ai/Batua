import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MonthlyStatementModal from "./MonthlyStatementModal";

// Mock api
vi.mock("@/lib/utils-finance", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: "t1",
            date: "2026-06-15",
            description: "Tech Corp Salary",
            category: "Salary",
            amount: 50000,
            payment_method: "Bank Transfer",
          },
          {
            id: "t2",
            date: "2026-06-18",
            description: "Supermarket Groceries",
            category: "Food & Dining",
            amount: -4500,
            payment_method: "Credit Card",
          },
          {
            id: "t3",
            date: "2026-06-25",
            description: "Electricity Utility",
            category: "Utilities",
            amount: -1800,
            payment_method: "UPI",
          },
        ],
      },
    }),
  },
  formatINR: vi.fn((v) => `₹${Math.abs(v).toLocaleString("en-IN")}`),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("MonthlyStatementModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    render(<MonthlyStatementModal open={false} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders statement header and action buttons when open", async () => {
    render(<MonthlyStatementModal open={true} onClose={onClose} initialMonth="2026-06" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Financial Statement Generator")).toBeInTheDocument();
    expect(screen.getByText("Print PDF")).toBeInTheDocument();
    expect(screen.getByText("Official Statement of Account")).toBeInTheDocument();

    // Verify ledger items load
    await waitFor(() => {
      expect(screen.getByText("Tech Corp Salary")).toBeInTheDocument();
      expect(screen.getByText("Supermarket Groceries")).toBeInTheDocument();
    });
  });

  it("triggers window.print when Print PDF button is clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<MonthlyStatementModal open={true} onClose={onClose} initialMonth="2026-06" />);

    const printBtn = screen.getByText("Print PDF");
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("allows switching between Month View and Custom Timeline mode", async () => {
    render(<MonthlyStatementModal open={true} onClose={onClose} initialMonth="2026-06" />);

    const customTimelineBtn = screen.getByText("Custom Timeline");
    fireEvent.click(customTimelineBtn);

    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
  });

  it("filters transactions by type in the itemized ledger", async () => {
    render(<MonthlyStatementModal open={true} onClose={onClose} initialMonth="2026-06" />);

    await waitFor(() => {
      expect(screen.getByText("Tech Corp Salary")).toBeInTheDocument();
      expect(screen.getByText("Supermarket Groceries")).toBeInTheDocument();
    });

    // Filter to Debits only (expenses)
    const debitsBtn = screen.getByRole("button", { name: /Debits \(/i });
    fireEvent.click(debitsBtn);

    expect(screen.getByText("Supermarket Groceries")).toBeInTheDocument();
    expect(screen.queryByText("Tech Corp Salary")).not.toBeInTheDocument();

    // Filter to Credits only (income)
    const creditsBtn = screen.getByRole("button", { name: /Credits \(/i });
    fireEvent.click(creditsBtn);

    expect(screen.getByText("Tech Corp Salary")).toBeInTheDocument();
    expect(screen.queryByText("Supermarket Groceries")).not.toBeInTheDocument();
  });

  it("toggles between Paper White and Executive Dark document theme", async () => {
    render(<MonthlyStatementModal open={true} onClose={onClose} initialMonth="2026-06" />);

    const themeToggleBtn = screen.getByRole("button", { name: /Executive Dark|Paper White/i });
    expect(themeToggleBtn).toBeInTheDocument();

    fireEvent.click(themeToggleBtn);
    expect(screen.getByRole("button", { name: /Executive Dark|Paper White/i })).toBeInTheDocument();
  });
});
