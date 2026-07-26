import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Wallet } from "lucide-react";
import KPICard from "./KPICard";

// Mock framer-motion so components render synchronously
const mockUseReducedMotion = vi.fn(() => false);
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, whileHover, whileTap, transition, initial, animate, ...props }) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }) => <span {...props}>{children}</span>,
    polyline: ({ initial, animate, transition, ...props }) => <polyline {...props} />,
  },
  useReducedMotion: () => mockUseReducedMotion(),
  useMotionValue: vi.fn(() => ({ get: () => 0, set: vi.fn() })),
  useSpring: vi.fn((val) => val),
  useTransform: vi.fn(() => ({ get: () => "0" })),
  animate: vi.fn(() => ({ stop: vi.fn() })),
}));

// Mock CountUp — it's tested separately; render a simple span here.
vi.mock("@/components/CountUp", () => ({
  default: ({ value, format, className }) => (
    <span className={className}>{format(value)}</span>
  ),
}));

// Stub lucide icons
vi.mock("lucide-react", () => ({
  ChevronRight: () => <span data-testid="chevron-icon">→</span>,
  Wallet: () => <span data-testid="wallet-icon">W</span>,
  TrendingUp: () => <span data-testid="trending-icon">↑</span>,
}));

describe("KPICard Component", () => {
  it("renders label and value text", () => {
    render(<KPICard label="Income" value="₹50,000" />);
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("₹50,000")).toBeInTheDocument();
  });

  it("renders an icon when provided", () => {
    render(<KPICard label="Wallet" value="₹100" icon={Wallet} />);
    expect(screen.getByTestId("wallet-icon")).toBeInTheDocument();
  });

  it("renders change indicator with up arrow for positive change when good", () => {
    render(<KPICard label="Saving" value="₹500" change={15} goodWhenUp />);
    expect(screen.getByText("↑ 15%")).toBeInTheDocument();
  });

  it("renders change indicator with down arrow for negative change", () => {
    render(<KPICard label="Expense" value="₹500" change={-10} goodWhenUp={false} />);
    expect(screen.getByText("↓ 10%")).toBeInTheDocument();
  });

  it("renders positive change as red for expense cards (goodWhenUp=false)", () => {
    render(<KPICard label="Expense" value="₹500" change={8} goodWhenUp={false} />);
    const changeEl = screen.getByText("↑ 8%");
    expect(changeEl.className).toMatch(/rose/i);
  });

  it("renders note text when provided", () => {
    render(<KPICard label="Saving" value="₹500" note="of income" />);
    expect(screen.getByText("of income")).toBeInTheDocument();
  });

  it("uses CountUp animation when count and countFormat are provided", () => {
    const fmt = (n) => `₹${n}`;
    render(<KPICard label="Income" count={50000} countFormat={fmt} />);
    expect(screen.getByText("₹50000")).toBeInTheDocument();
  });

  it("shows + sign for positive values when showSign is true", () => {
    render(<KPICard label="Change" value="500" showSign />);
    expect(screen.getByText("+500")).toBeInTheDocument();
  });

  it("does not duplicate ₹ sign when showSign is true", () => {
    render(<KPICard label="Amount" value="₹500" showSign />);
    expect(screen.getByText("₹500")).toBeInTheDocument();
  });

  it("renders sparkline SVG when sparkline data is provided", () => {
    const { container } = render(
      <KPICard label="Income" value="₹100" sparkline={[10, 20, 15]} />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg.querySelector("polyline")).toBeInTheDocument();
  });

  it("renders without sparkline when data is empty", () => {
    const { container } = render(
      <KPICard label="Income" value="₹100" sparkline={[]} />
    );
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("calls onClick when card is clicked", () => {
    const handleClick = vi.fn();
    render(<KPICard label="Income" value="₹100" onClick={handleClick} testId="kpi-card" />);
    const card = screen.getByTestId("kpi-card");
    fireEvent.click(card);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("has role='button' when onClick is provided", () => {
    render(<KPICard label="Income" value="₹100" onClick={() => {}} testId="kpi-card" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("has no role='button' when onClick is missing", () => {
    render(<KPICard label="Income" value="₹100" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("supports keyboard activation (Enter/Space)", () => {
    const handleClick = vi.fn();
    render(<KPICard label="Income" value="₹100" onClick={handleClick} testId="kpi-card" />);
    const card = screen.getByRole("button");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(handleClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: " " });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it("renders with a test id", () => {
    render(<KPICard label="Income" value="₹100" testId="kpi-income" />);
    expect(screen.getByTestId("kpi-income")).toBeInTheDocument();
  });

  it("applies hero class when hero prop is set", () => {
    render(<KPICard label="Income" value="₹100" hero />);
    expect(screen.getByText("Income")).toBeInTheDocument();
  });

  it("does not render change when change is null/undefined", () => {
    render(<KPICard label="Income" value="₹100" />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("respects reduced motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<KPICard label="Income" value="₹100" />);
    expect(screen.getByText("Income")).toBeInTheDocument();
    mockUseReducedMotion.mockReturnValue(false);
  });
});
