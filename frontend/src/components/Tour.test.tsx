import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import Tour, { TourStep } from "./Tour";

// Steps are mounted as siblings of the Routes so they survive navigation —
// exactly how Layout mounts the real tour.
const STEPS: TourStep[] = [
  // 0 — Type A hero: centered panel, no anchor → no connector/ring.
  { title: "Step One", body: "Body one", kind: "spotlight", cta: "Show me around" },
  // 1 — Type A with a real anchor → connector draws to it.
  { title: "Step Two", body: "Body two", kind: "spotlight", route: "/b", target: "[data-testid='spot-b']", cta: "Got it" },
  // 2 — Type B anchored hint → breathing ring around the element.
  { title: "Step Three", body: "Body three", kind: "hint", route: "/a", target: "[data-testid='spot-a']" },
  // 3 — Type B with no anchor → centered card, no ring.
  { title: "Step Four", body: "Body four", cta: "Done" },
];

function renderTour({ open = true, onClose, onFinish } = {}) {
  return render(
    <MemoryRouter initialEntries={["/a"]}>
      <Routes>
        <Route path="/a" element={<div data-testid="spot-a">Page A</div>} />
        <Route path="/b" element={<div data-testid="spot-b">Page B</div>} />
      </Routes>
      <Tour
        steps={STEPS}
        open={open}
        onClose={onClose || (() => {})}
        onFinish={onFinish || (() => {})}
      />
    </MemoryRouter>
  );
}

describe("Tour", () => {
  it("renders nothing when closed", () => {
    renderTour({ open: false });
    expect(screen.queryByTestId("tour-panel")).not.toBeInTheDocument();
  });

  it("renders a Type A hero panel (centered, no connector)", () => {
    renderTour();
    expect(screen.getByTestId("tour-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("tour-scrim")).toBeInTheDocument();
    const panel = screen.getByTestId("tour-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("Step One")).toBeInTheDocument();
    expect(screen.getByText("Body one")).toBeInTheDocument();
    expect(screen.getByTestId("tour-cta")).toHaveTextContent("Show me around");
    // Hero has no anchor: no ring, no connector.
    expect(screen.queryByTestId("tour-ring")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tour-connector")).not.toBeInTheDocument();
  });

  it("draws a connector to the spotlighted element (Type A)", async () => {
    renderTour();
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two on /b
    await waitFor(() => {
      expect(screen.getByTestId("spot-b")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("tour-connector")).toBeInTheDocument();
    });
    // The theme ring frames the element for both kinds.
    await waitFor(() => {
      expect(screen.getByTestId("tour-ring")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tour-cta")).toHaveTextContent("Got it");
  });

  it("shows a breathing ring around the anchored element (Type B)", async () => {
    renderTour();
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two
    await waitFor(() => {
      expect(screen.getByTestId("tour-connector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Three on /a
    await waitFor(() => {
      expect(screen.getByTestId("spot-a")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("tour-ring")).toBeInTheDocument();
    });
    // Type B never uses the connector.
    expect(screen.queryByTestId("tour-connector")).not.toBeInTheDocument();
  });

  it("full steps show the page without blur but still frame the target", async () => {
    const FULL: TourStep[] = [
      { title: "Full Page", body: "Body", kind: "hint", route: "/a", target: "[data-testid='spot-a']", full: true },
    ];
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Routes>
          <Route path="/a" element={<div data-testid="spot-a">Page A</div>} />
        </Routes>
        <Tour steps={FULL} open onClose={() => {}} onFinish={() => {}} />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId("tour-ring")).toBeInTheDocument();
    });
    // No blurred/veiled backdrop, but the panel is still there.
    expect(screen.queryByTestId("tour-scrim")).not.toBeInTheDocument();
    expect(screen.getByTestId("tour-panel")).toBeInTheDocument();
  });

  it("falls back to a centered card when there is no target", async () => {
    renderTour();
    fireEvent.click(screen.getByTestId("tour-cta")); // 2
    await waitFor(() => {
      expect(screen.getByTestId("tour-connector")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tour-cta")); // 3
    await waitFor(() => {
      expect(screen.getByTestId("tour-ring")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Four (no target)
    await waitFor(() => {
      expect(screen.queryByTestId("tour-ring")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("tour-panel")).toBeInTheDocument();
    expect(screen.getByTestId("tour-cta")).toHaveTextContent("Done");
  });

  it("disables prev on the first step and allows going back", () => {
    renderTour();
    expect(screen.getByTestId("tour-prev")).toBeDisabled();
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Three
    fireEvent.click(screen.getByTestId("tour-prev")); // back to Step Two
    expect(screen.getByText("Step Two")).toBeInTheDocument();
  });

  it("jumps between steps via the progress dots", () => {
    renderTour();
    fireEvent.click(screen.getAllByTestId("tour-dot")[3]);
    expect(screen.getByText("Step Four")).toBeInTheDocument();
  });

  it("finishes on the last step's Done button", () => {
    const onFinish = vi.fn();
    renderTour({ onFinish });
    fireEvent.click(screen.getByTestId("tour-cta")); // → 2
    fireEvent.click(screen.getByTestId("tour-cta")); // → 3
    fireEvent.click(screen.getByTestId("tour-cta")); // → 4 (button now reads Done)
    expect(screen.getByTestId("tour-cta")).toHaveTextContent("Done");
    fireEvent.click(screen.getByTestId("tour-cta")); // press Done
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("skip and Esc both dismiss the tour", () => {
    const onClose = vi.fn();
    renderTour({ onClose });

    fireEvent.click(screen.getByTestId("tour-skip"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});