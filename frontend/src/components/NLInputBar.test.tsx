import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock dependencies before imports — keep the real priceBreakdown logic so the
// preview's formula behaviour is actually exercised in tests.
vi.mock("@/lib/utils-finance", async () => {
  const actual = await vi.importActual("@/lib/utils-finance");
  return {
    ...actual,
    api: {
      post: vi.fn(),
      get: vi.fn(() => Promise.resolve({ data: { categories: [], methods: [] } })),
    },
    formatINR: vi.fn((n) => `₹${Number(n).toLocaleString("en-IN")}`),
    upcomingMonths: vi.fn(() => ["2026-07", "2026-08", "2026-09"]),
    currentYearMonth: vi.fn(() => "2026-07"),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/AnimatedGlowBorder", () => ({
  default: ({ children }) => <>{children}</>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, defaultValue }) => <div data-testid="tabs" data-default={defaultValue}>{children}</div>,
  TabsList: ({ children }) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value, ...props }) => <button data-value={value} {...props}>{children}</button>,
  TabsContent: ({ children, value }) => <div data-content={value}>{children}</div>,
}));

vi.mock("@/components/ui/date-input", () => ({
  DateInput: ({ value, onChange, ...props }) => (
    <input data-testid="date-input" value={value || ""} onChange={(e) => onChange(e.target.value)} {...props} />
  ),
  DayInput: ({ value, onChange, ...props }) => (
    <input data-testid="day-input" value={value || ""} onChange={(e) => onChange(e.target.value)} {...props} />
  ),
}));

vi.mock("@/components/MonthPicker", () => ({
  default: ({ selected, onChange }) => (
    <div data-testid="month-picker">
      <button onClick={() => onChange(["2026-07", "2026-08"])}>Select Months</button>
    </div>
  ),
}));

import NLInputBar from "./NLInputBar";
import { api } from "@/lib/utils-finance";
import { toast } from "sonner";

const mockedPost = vi.mocked(api.post);

describe("NLInputBar Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderBar() {
    return render(<NLInputBar onSaved={() => {}} />);
  }

  function firstInput() {
    return screen.getAllByTestId("nl-input")[0];
  }

  it("renders the input bar with tabs", () => {
    renderBar();
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
    expect(firstInput()).toBeInTheDocument();
  });

  it("has One-off, Repeat monthly, and Paste many tabs", () => {
    renderBar();
    expect(screen.getByTestId("nl-tab-single")).toHaveTextContent(/one.?off/i);
    expect(screen.getByTestId("nl-tab-recurring")).toHaveTextContent(/repeat/i);
    expect(screen.getByTestId("nl-tab-bulk")).toHaveTextContent(/paste/i);
  });

  it("calls the parse API when Enter is pressed with text", async () => {
    mockedPost.mockResolvedValue({
      data: { kind: "single", description: "Zomato", amount: -450, category: "Food" },
    } as any);
    renderBar();
    const input = firstInput();
    fireEvent.change(input, { target: { value: "zomato 450" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith("/parse-nl", {
        text: "zomato 450",
        force_recurring: false,
      });
    });
  });

  it("shows parsed draft after successful API response", async () => {
    mockedPost.mockResolvedValue({
      data: { kind: "single", description: "Zomato", amount: -450, category: "Food", date: "2026-07-26" },
    } as any);
    renderBar();
    const input = firstInput();
    fireEvent.change(input, { target: { value: "zomato 450" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByTestId("preview-description")).toBeInTheDocument();
    });
  });

  it("shows error toast on parse failure", async () => {
    mockedPost.mockRejectedValue(new Error("Network error"));
    renderBar();
    const input = firstInput();
    fireEvent.change(input, { target: { value: "gibberish" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/parse|rephrase|could not/i)
      );
    });
  });

  it("does nothing on empty input", () => {
    renderBar();
    const input = firstInput();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  async function parseSingle(text) {
    renderBar();
    mockedPost.mockResolvedValueOnce({
      data: { kind: "single", description: "Banana", amount: -450, quantity: 1, price: 450, date: "2026-07-26", category: "Fruits", payment_method: "UPI" },
    } as any);
    const input = firstInput();
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByTestId("preview-description")).toBeInTheDocument();
    });
  }

  it("offers searchable category + payment pickers in the preview", async () => {
    await parseSingle("banana 450");
    const categoryBtn = screen.getByTestId("preview-category");
    const paymentBtn = screen.getByTestId("preview-payment");
    expect(categoryBtn.tagName).toBe("BUTTON");
    expect(paymentBtn.tagName).toBe("BUTTON");
    expect(paymentBtn).toHaveTextContent("UPI");
  });

  it("evaluates a price expression as the total, without multiplying by qty", async () => {
    await parseSingle("banana 450");
    const qtyInput = screen.getByTestId("preview-quantity");
    fireEvent.change(qtyInput, { target: { value: "2" } });

    const priceInput = screen.getByTestId("preview-price");
    fireEvent.change(priceInput, { target: { value: "12+15+48" } });

    // 12+15+48 = 75 — the basket total, NOT 75 × 2.
    expect(screen.getByTestId("preview-amount")).toHaveValue("-75");
  });

  it("multiplies a bare price by the quantity", async () => {
    await parseSingle("banana 450");
    const qtyInput = screen.getByTestId("preview-quantity");
    fireEvent.change(qtyInput, { target: { value: "2" } });

    const priceInput = screen.getByTestId("preview-price");
    fireEvent.change(priceInput, { target: { value: "10" } });

    // 10 per item × 2 qty = 20.
    expect(screen.getByTestId("preview-amount")).toHaveValue("-20");
  });
});
