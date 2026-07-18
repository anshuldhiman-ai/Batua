import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PageHeader from "./PageHeader";

describe("PageHeader Component", () => {
  it("renders title and subtitle correctly", () => {
    render(<PageHeader title="Overview" subtitle="Manage your money" />);
    
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Manage your money")).toBeInTheDocument();
  });

  it("renders actions slot content", () => {
    render(
      <PageHeader
        title="Overview"
        actions={<button data-testid="action-btn">Click me</button>}
      />
    );
    
    expect(screen.getByTestId("action-btn")).toBeInTheDocument();
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });
});
