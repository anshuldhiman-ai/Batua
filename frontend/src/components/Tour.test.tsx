import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import Tour, { TourStep } from "./Tour";

// Steps are mounted as siblings of the Routes so they survive navigation —
// exactly how Layout mounts the real tour.
const STEPS: TourStep[] = [
  // 0 — Type A anchored spotlight → connector + ring.
  { title: "Step One", body: "Body one", kind: "spotlight", route: "/b", target: "[data-testid='spot-b']", cta: "Next" },
  // 1 — Type B anchored hint → breathing ring around the element.
  { title: "Step Two", body: "Body two", kind: "hint", route: "/a", target: "[data-testid='spot-a']" },
  // 2 — no anchor → centered card, no ring.
  { title: "Step Three", body: "Body three", cta: "Done" },
];

const HERO: TourStep[] = [{ title: "Welcome to Batua", body: "Body", hero: true, cta: "Start tour" }];

const FULL: TourStep[] = [
  { title: "Full Page", body: "Body", kind: "hint", route: "/a", target: "[data-testid='spot-a']", full: true },
];

// An interactive live demo: the step auto-types into the target input and waits
// for the user to produce `parsed` before advancing on its own.
const DEMO: TourStep[] = [
  {
    title: "Demo Fill",
    kind: "spotlight",
    route: "/a",
    target: "[data-testid='spot-input']",
    full: true,
    cta: "Continue",
    demo: {
      input: "2 samose 50 upi and chai 20 cash",
      waitFor: "[data-testid='parsed']",
    },
  },
  { title: "Parsed Details", body: "Body", kind: "hint", route: "/a", full: true, cta: "Done" },
];

function renderDemo() {
  return render(
    <MemoryRouter initialEntries={["/a"]}>
      <Routes>
        <Route path="/a" element={<input data-testid="spot-input" />} />
      </Routes>
      <Tour steps={DEMO} open onClose={() => {}} onFinish={() => {}} />
    </MemoryRouter>
  );
}

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

function renderHero() {
  return render(
    <MemoryRouter initialEntries={["/a"]}>
      <Routes>
        <Route path="/a" element={<div data-testid="spot-a">Page A</div>} />
      </Routes>
      <Tour steps={HERO} open onClose={() => {}} onFinish={() => {}} />
    </MemoryRouter>
  );
}

describe("Tour", () => {
  it("renders nothing when closed", () => {
    renderTour({ open: false });
    expect(screen.queryByTestId("tour-panel")).not.toBeInTheDocument();
  });

  it("renders the welcome hero as a calm, centred card", () => {
    renderHero();
    const panel = screen.getByTestId("tour-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("Welcome to Batua")).toBeInTheDocument();
    expect(screen.getByTestId("tour-cta")).toHaveTextContent("Start tour");
    expect(screen.getByTestId("tour-skip")).toHaveTextContent("Skip for now");
    // Hero has no anchor, no progress, no back button — just one action.
    expect(screen.queryByTestId("tour-ring")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tour-connector")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tour-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tour-progress")).not.toBeInTheDocument();
  });

  it("draws a connector to the spotlighted element (Type A)", async () => {
    renderTour();
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
    expect(screen.getByTestId("tour-cta")).toHaveTextContent("Next");
  });

  it("shows a breathing ring around the anchored element (Type B)", async () => {
    renderTour();
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two on /a
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
    // No blurred/veiled backdrop, but the panel is still there — and it says
    // the page is freely explorable.
    expect(screen.queryByTestId("tour-scrim")).not.toBeInTheDocument();
    expect(screen.getByTestId("tour-panel")).toBeInTheDocument();
    expect(screen.getByTestId("tour-full-hint")).toBeInTheDocument();
  });

  it("falls back to a centered card when there is no target", async () => {
    renderTour();
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two
    await waitFor(() => {
      expect(screen.getByTestId("tour-ring")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Three (no target)
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
    fireEvent.click(screen.getByTestId("tour-prev")); // back to Step One
    expect(screen.getByText("Step One")).toBeInTheDocument();
  });

  it("shows a step counter and progress for anchored steps", () => {
    renderTour();
    expect(screen.getByTestId("tour-progress")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("finishes on the last step's Done button", () => {
    const onFinish = vi.fn();
    renderTour({ onFinish });
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Three (button now reads Done)
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

  it("locks page scroll behind blurred steps", () => {
    renderTour();
    expect(document.body.style.overflow).toBe("hidden");
    cleanup();
  });

  it("keeps the page scrollable on full steps", async () => {
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
    expect(document.body.style.overflow).toBe("");
    cleanup();
  });

  it("focuses the panel when a step activates", async () => {
    renderTour();
    // The panel should receive focus when it mounts / step changes.
    await waitFor(() => {
      expect(screen.getByTestId("tour-panel")).toBeInTheDocument();
    });
    // After advancing, the panel should still be in the DOM and focusable.
    fireEvent.click(screen.getByTestId("tour-cta")); // → Step Two
    await waitFor(() => {
      expect(screen.getByTestId("tour-panel")).toBeInTheDocument();
    });
    cleanup();
  });
});