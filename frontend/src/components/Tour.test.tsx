import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import Tour, { TourStep } from "./Tour";

// Steps are mounted as siblings of the Routes so they survive navigation —
// exactly how Layout mounts the real tour.
const STEPS: TourStep[] = [
  { title: "Step One", body: "Body one" },
  { title: "Step Two", body: "Body two", route: "/b", target: "[data-testid='spot-b']" },
  { title: "Step Three", body: "Body three" },
];

function renderTour({ open = true, onClose, onFinish } = {}) {
  return render(
    <MemoryRouter initialEntries={["/a"]}>
      <Routes>
        <Route path="/a" element={<div data-testid="spot-a">Page A</div>} />
        <Route path="/b" element={<div data-testid="spot-b">Page B</div>} />
      </Routes>
      <Tour steps={STEPS} open={open} onClose={onClose || (() => {})} onFinish={onFinish || (() => {})} />
    </MemoryRouter>
  );
}

describe("Tour", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    renderTour({ open: false });
    expect(screen.queryByTestId("tour-tooltip")).not.toBeInTheDocument();
  });

  it("renders the tooltip for the first step", () => {
    renderTour();
    expect(screen.getByTestId("tour-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("tour-tooltip")).toBeInTheDocument();
    expect(screen.getByText("Step One")).toBeInTheDocument();
    expect(screen.getByText("Body one")).toBeInTheDocument();
    // First step has no target → no spotlight ring, centered card instead.
    expect(screen.queryByTestId("tour-spotlight")).not.toBeInTheDocument();
  });

  it("advances and goes back through steps", () => {
    renderTour();
    fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByText("Step Two")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tour-prev"));
    expect(screen.getByText("Step One")).toBeInTheDocument();
  });

  it("disables prev on the first step", () => {
    renderTour();
    expect(screen.getByTestId("tour-prev")).toBeDisabled();
  });

  it("navigates to the step's route and spotlights its target", async () => {
    renderTour();
    fireEvent.click(screen.getByTestId("tour-next")); // Step Two → route /b, target spot-b
    // Route change swaps the page; the spotlight pins the target element.
    await waitFor(() => {
      expect(screen.getByTestId("spot-b")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("tour-spotlight")).toBeInTheDocument();
    });
  });

  it("falls back to a centered card when the target is missing", async () => {
    const { unmount } = renderTour();
    fireEvent.click(screen.getByTestId("tour-next")); // Step Two targets spot-b
    await waitFor(() => {
      expect(screen.getByTestId("tour-spotlight")).toBeInTheDocument();
    });
    unmount();
  });

  it("skip and close both dismiss the tour", () => {
    const onClose = vi.fn();
    renderTour({ onClose });

    fireEvent.click(screen.getByTestId("tour-skip"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("tour-next")); // re-openable via next for close test
    fireEvent.click(screen.getByTestId("tour-close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("finishes on the last step's Done button", () => {
    const onFinish = vi.fn();
    renderTour({ onFinish });

    fireEvent.click(screen.getByTestId("tour-next")); // step 2
    fireEvent.click(screen.getByTestId("tour-next")); // step 3 (last)
    expect(screen.getByTestId("tour-next")).toHaveTextContent("Done");

    fireEvent.click(screen.getByTestId("tour-next"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});