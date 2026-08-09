import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TourPlacement = "left" | "right" | "top" | "bottom";

export type TourStep = {
  /** Route the step must be shown on; the tour navigates there first. */
  route?: string;
  /** CSS selector of the element to spotlight (optional → centered card). */
  target?: string;
  title: string;
  body: React.ReactNode;
  placement?: TourPlacement;
};

const TOOLTIP_W = 320;
const TOOLTIP_H = 176;
const GAP = 14;

/** Position the card next to a rect, clamping it inside the viewport. */
function placeCard(
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number },
  placement: TourPlacement
) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let x = rect.right + GAP;
  let y = cy - TOOLTIP_H / 2;
  if (placement === "left") {
    x = rect.left - TOOLTIP_W - GAP;
  } else if (placement === "top") {
    x = cx - TOOLTIP_W / 2;
    y = rect.top - TOOLTIP_H - GAP;
  } else if (placement === "bottom") {
    x = cx - TOOLTIP_W / 2;
    y = rect.bottom + GAP;
  }
  x = Math.max(8, Math.min(x, window.innerWidth - TOOLTIP_W - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - TOOLTIP_H - 8));
  return { x, y };
}

export default function Tour({
  steps,
  open,
  onClose,
  onFinish,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [spot, setSpot] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tip, setTip] = React.useState<{ x: number; y: number } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Reset to step 0 each time the tour is (re)opened.
  React.useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const step = steps[Math.min(index, steps.length - 1)];

  const locate = React.useCallback(() => {
    const s = steps[index] || steps[0];
    if (!s.target) {
      setSpot(null);
      setTip({ x: Math.round(window.innerWidth / 2 - TOOLTIP_W / 2), y: Math.round(window.innerHeight / 2 - TOOLTIP_H / 2) });
      return;
    }
    const el = document.querySelector(s.target) as HTMLElement | null;
    const centered = () =>
      setTip({ x: Math.round(window.innerWidth / 2 - TOOLTIP_W / 2), y: Math.round(window.innerHeight / 2 - TOOLTIP_H / 2) });
    if (!el) {
      setSpot(null);
      centered();
      return;
    }
    // Whole-page targets (e.g. <main>) get a centered card instead of a ring.
    const r = el.getBoundingClientRect();
    const isPage =
      el.tagName === "MAIN" ||
      (r.width > window.innerWidth * 0.6 && r.height > window.innerHeight * 0.6);
    if (isPage) {
      setSpot(null);
      centered();
      return;
    }
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: "auto" });
    }
    const rect = {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
    const { x, y } = placeCard(rect, s.placement || "right");
    setSpot({ x: rect.left - 8, y: rect.top - 8, w: rect.width + 16, h: rect.height + 16 });
    setTip({ x: Math.round(x), y: Math.round(y) });
  }, [index, steps]);

  // Navigate to the step's route, then wait for the page (lazy-loaded) to
  // render before positioning the spotlight. Re-run whenever the route settles.
  React.useEffect(() => {
    if (!open) return;
    const s = steps[index] || steps[0];
    if (s.route && s.route !== location.pathname) {
      navigate(s.route);
      return; // the location change below re-triggers positioning
    }
    const timers = [30, 300, 700].map((ms) => window.setTimeout(locate, ms));
    return () => timers.forEach(clearTimeout);
  }, [open, index, location.pathname, steps, navigate, locate]);

  // Keep the spotlight glued to its element while the page scrolls or resizes.
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, { passive: true });
    return () => {
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate);
    };
  }, [open, locate]);

  if (!open || !step) return null;

  const total = steps.length;
  const isLast = index === total - 1;

  const next = () => {
    if (isLast) onFinish();
    else setIndex(index + 1);
  };
  const prev = () => {
    if (index > 0) setIndex(index - 1);
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guided tour" data-testid="tour-overlay">
      {/* Dimmed backdrop */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      {/* Spotlight ring around the highlighted element */}
      {spot && (
        <div
          data-testid="tour-spotlight"
          className="pointer-events-none absolute rounded-2xl border-2 border-primary shadow-[0_0_0_4px_rgba(0,0,0,0.55)]"
          style={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }}
        />
      )}

      {/* Tooltip card */}
      <div
        data-testid="tour-tooltip"
        className="absolute rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl"
        style={{ left: tip?.x ?? 0, top: tip?.y ?? 0, width: TOOLTIP_W }}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold leading-snug">{step.title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tour"
            data-testid="tour-close"
            className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[92px] overflow-y-auto text-[13px] leading-relaxed text-muted-foreground">
          {step.body}
        </div>

        {/* Step dots */}
        <div className="mt-3 flex items-center gap-1">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-primary" : "w-1.5 bg-foreground/20 hover:bg-foreground/40"
              )}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="tour-skip">
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prev} disabled={index === 0} data-testid="tour-prev" aria-label="Previous step">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={next} data-testid="tour-next">
              {isLast ? "Done" : "Next"}
              {!isLast && <ChevronRight className="ml-1 h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}