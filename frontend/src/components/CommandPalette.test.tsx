import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import CommandPalette from "./CommandPalette";

// Mock ThemeContext
vi.mock("@/App", () => ({
  ThemeContext: React.createContext({ theme: "light", toggle: vi.fn() }),
}));

// Mock api
vi.mock("@/lib/utils-finance", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { items: [] } }),
  },
  formatINR: vi.fn((v) => `₹${v}`),
}));

describe("CommandPalette", () => {
  const onClose = vi.fn();
  const onOpenStatement = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (open = true) => {
    return render(
      <BrowserRouter>
        <CommandPalette open={open} onClose={onClose} onOpenStatement={onOpenStatement} />
      </BrowserRouter>
    );
  };

  it("does not render dialog when closed", () => {
    renderComponent(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog and input when open", () => {
    renderComponent(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();
  });

  it("renders core navigation items", () => {
    renderComponent(true);
    expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Go to Transactions")).toBeInTheDocument();
    expect(screen.getByText("Go to Analytics")).toBeInTheDocument();
  });

  it("filters items when query is entered", () => {
    renderComponent(true);
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.change(input, { target: { value: "Statement" } });

    expect(screen.getByText("Generate Monthly Statement")).toBeInTheDocument();
    expect(screen.queryByText("Go to Dashboard")).not.toBeInTheDocument();
  });

  it("closes when ESC is pressed", () => {
    renderComponent(true);
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
