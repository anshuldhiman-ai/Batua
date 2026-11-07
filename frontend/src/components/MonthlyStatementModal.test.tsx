import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MonthlyStatementModal from "./MonthlyStatementModal";

// Mock api
vi.mock("@/lib/utils-finance", () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: "t1", date: "2026-06-15", description: "Salary", category: "Salary", amount: 50000 },
          { id: "t2", date: "2026-06-18", description: "Groceries", category: "Food & Dining", amount: -4500 },
        ],
      },
    }),
  },
  formatINR: vi.fn((v) => `₹${v}`),
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

  it("renders statement header and action buttons when open", () => {
    render(<MonthlyStatementModal open={true} onClose={onClose} initialMonth="2026-06" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Monthly Financial Statement/i)).toBeInTheDocument();
    expect(screen.getByText("Print PDF")).toBeInTheDocument();
  });

  it("triggers window.print when Print PDF button is clicked", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<MonthlyStatementModal open={true} onClose={onClose} initialMonth="2026-06" />);
    
    const printBtn = screen.getByText("Print PDF");
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
