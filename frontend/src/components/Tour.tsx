import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, MousePointerClick, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";
import { findFeatureStepForElement } from "@/tour-contextual";

export type TourPlacement = "left" | "right" | "top" | "bottom";

export type TourStepKind = "spotlight" | "hint";

export type TourStep = {
  /** Route the step must be shown on; the tour navigates there first. */
  route?: string;
  /** CSS selector of the element to spotlight/highlight (optional → centered card). */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** Preferred dock side for Type B cards (falls back to best fit). */
  placement?: TourPlacement;
  kind?: TourStepKind;
  /** Verb-first button label; defaults to "Next" / "Got it". */
  cta?: string;
  /** Show the full page with no blur/veil — use when the whole page IS the content. */
  full?: boolean;
  /** Welcome step — a single, calm centred panel. */
  hero?: boolean;
  /** Live-demo fields. */
  demo?: {
    input?: string;
    waitFor?: string;
  };
  /** Contextual step — activated when user clicks matching elements during tour */
  contextual?: boolean;
  /** Optional fallback step if target is not found */
  fallback?: TourStep;
  /** Allow user to interact with page during this step */
  allowInteraction?: boolean;
};

type Rect = { left: number; top: number; width: number; height: number; bottom?: number };

const SPOT_W = 420; // Type A panel max width
const HINT_W = 320; // Type B card max width
const HERO_W = 460; // welcome hero card max width
const GAP = 12; // gap between a hint card and its anchor

function connectorPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const wob = Math.min(28, len * 0.12);
  const px = -dy / len;
  const py = dx / len;
  const c1 = { x: from.x + dx * 0.35 + px * wob, y: from.y + dy * 0.35 + py * wob };
  const c2 = { x: from.x + dx * 0.65 - px * wob, y: from.y + dy * 0.65 - py * wob };
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
}

function panelEdge(panel: Rect, to: { x: number; y: number }) {
  const cx = panel.left + panel.width / 2;
  const cy = panel.top + panel.height / 2;
  if (Math.abs(to.x - cx) >= Math.abs(to.y - cy)) {
    return { x: to.x >= cx ? panel.left + panel.width : panel.left, y: cy };
  }
  return { x: cx, y: to.y >= cy ? panel.top + panel.height : panel.top };
}

function fitHint(anchor: Rect, placement: TourPlacement, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cand: Record<TourPlacement, { x: number; y: number }> = {
    right: { x: anchor.left + anchor.width + GAP, y: anchor.top + anchor.height / 2 - h / 2 },
    left: { x: anchor.left - w - GAP, y: anchor.top + anchor.height / 2 - h / 2 },
    bottom: { x: anchor.left + anchor.width / 2 - w / 2, y: (anchor.bottom ?? anchor.top + anchor.height) + GAP },
    top: { x: anchor.left + anchor.width / 2 - w / 2, y: anchor.top - h - GAP },
  };
  const order: TourPlacement[] = [placement, "right", "bottom", "top", "left"];
  for (const p of order) {
    const c = cand[p];
    if (c.x >= 8 && c.x + w <= vw - 8 && c.y >= 8 && c.y + h <= vh - 8) return { x: c.x, y: c.y };
  }
  const base = cand[placement] || cand.right;
  return {
    x: Math.max(8, Math.min(base.x, vw - w - 8)),
    y: Math.max(8, Math.min(base.y, vh - h - 8)),
  };
}

function cutoutMask(x: number, y: number, w: number, h: number) {
  const pad = 6;
  const x0 = Math.max(0, Math.round(x - pad));
  const y0 = Math.max(0, Math.round(y - pad));
  const w0 = Math.round(w + pad * 2);
  const h0 = Math.round(h + pad * 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">` +
    `<mask id="m"><rect width="100%" height="100%" fill="white"/>` +
    `<rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" rx="18" fill="black"/></mask>` +
    `<rect width="100%" height="100%" fill="black" mask="url(#m)"/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
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
  const [index, setIndex] = useState(0);
  const [contextualStep, setContextualStep] = useState<TourStep | null>(null);
  const [idleTimeLeft, setIdleTimeLeft] = useState<number>(0);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [panel, setPanel] = useState<{ x: number; y: number } | null>(null);
  const [panelRect, setPanelRect] = useState<Rect | null>(null);
  const [, setError] = useState<string | null>(null);
  const [, setUsingFallback] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = !!useReducedMotion();

  // Reset to step 0 each time the tour is (re)opened.
  useEffect(() => {
    if (open) {
      setIndex(0);
      setContextualStep(null);
      setIdleTimeLeft(0);
    }
  }, [open]);

  // Active step is either the user-clicked contextual feature or the main sequential step
  const activeStep = contextualStep || steps[Math.min(index, steps.length - 1)];

  const kind: TourStepKind = activeStep?.kind ?? "hint";
  const full = !!activeStep?.full;
  const hero = !!activeStep?.hero;
  const allowInteraction = !!activeStep?.allowInteraction || !!contextualStep;
  const total = steps.length;
  const isLast = index === total - 1;
  const demo = activeStep?.demo;
  const [demoDone, setDemoDone] = useState(false);

  const indexRef = useRef(index);
  indexRef.current = index;

  const resumeMainTour = useCallback(() => {
    setContextualStep(null);
    setIdleTimeLeft(0);
  }, []);

  const goNext = useCallback(() => {
    if (contextualStep) {
      resumeMainTour();
      return;
    }
    if (indexRef.current >= steps.length - 1) onFinish();
    else setIndex(indexRef.current + 1);
  }, [steps.length, onFinish, contextualStep, resumeMainTour]);

  const goPrev = useCallback(() => {
    if (contextualStep) {
      resumeMainTour();
      return;
    }
    if (indexRef.current > 0) setIndex(indexRef.current - 1);
  }, [contextualStep, resumeMainTour]);

  // Snap back to the "waiting" state whenever a fresh demo step becomes active.
  useEffect(() => setDemoDone(false), [index, contextualStep]);

  // Global click detector: if the user clicks any feature anywhere during the tour,
  // explain that feature as a contextual step and start the 5s auto-resume timer.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (!targetEl) return;

      // Ignore clicks inside the tour panel itself
      if (panelRef.current?.contains(targetEl)) return;

      const match = findFeatureStepForElement(targetEl);
      if (match) {
        setContextualStep(match);
        setIdleTimeLeft(5); // 5-second countdown to return to main tour
      }
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, [open]);

  // Idle countdown timer for contextual steps
  useEffect(() => {
    if (!contextualStep || idleTimeLeft <= 0) return;

    const timer = window.setInterval(() => {
      setIdleTimeLeft((prev) => {
        if (prev <= 1) {
          setContextualStep(null); // Resume main tour
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [contextualStep, idleTimeLeft]);

  /** Locate the active step's target safely with fallbacks to avoid crashes. */
  const refresh = useCallback(() => {
    const s = activeStep || steps[0];
    if (!s) return;

    const center = () => {
      const vw = window.innerWidth;
      const w = Math.min(s.hero ? HERO_W : kind === "spotlight" ? SPOT_W : HINT_W, vw - 24);
      setAnchor(null);
      setPanel({ x: Math.round((vw - w) / 2), y: Math.round(window.innerHeight / 2 - 110) });
      setPanelRect(null);
    };

    setError(null);
    setUsingFallback(false);

    try {
      const el = s.target ? (document.querySelector(s.target) as HTMLElement | null) : null;
      if (!el) {
        if (s.fallback?.target) {
          setUsingFallback(true);
          const fallbackEl = document.querySelector(s.fallback.target) as HTMLElement | null;
          if (fallbackEl) {
            const r = fallbackEl.getBoundingClientRect();
            setAnchor({ left: r.left, top: r.top, width: r.width, height: r.height });
            return;
          }
        }
        center();
        return;
      }

      const r = el.getBoundingClientRect();
      const isPage =
        el.tagName === "MAIN" || (r.width > window.innerWidth * 0.6 && r.height > window.innerHeight * 0.6);
      if (isPage) {
        center();
        return;
      }

      if (!s.full && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "center", behavior: "auto" });
      }
      setAnchor({ left: r.left, top: r.top, width: r.width, height: r.height });
    } catch {
      center();
    }
  }, [activeStep, steps, kind]);

  // Route sync
  useEffect(() => {
    if (!open || !activeStep) return;
    if (activeStep.route && activeStep.route !== location.pathname) {
      navigate(activeStep.route);
      return;
    }
    const timers = [30, 300, 700].map((ms) => window.setTimeout(refresh, ms));
    return () => timers.forEach(clearTimeout);
  }, [open, activeStep, location.pathname, navigate, refresh]);

  // Position panel
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (anchor && kind === "hint") {
        const p = fitHint(anchor, activeStep?.placement || "right", w, h);
        setPanel({ x: p.x, y: p.y });
        setPanelRect({ left: p.x, top: p.y, width: w, height: h });
      } else {
        const x = Math.round((window.innerWidth - w) / 2);
        const y = Math.round(window.innerHeight / 2 - h / 2);
        setPanel({ x, y });
        setPanelRect({ left: x, top: y, width: w, height: h });
      }
    }, 40);
    return () => window.clearTimeout(t);
  }, [open, anchor, activeStep, kind]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, { passive: true });
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh);
    };
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && panel) panelRef.current?.focus?.();
  }, [open, panel, index, contextualStep]);

  useEffect(() => {
    document.body.style.overflow = open && !full && !allowInteraction ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, full, allowInteraction]);

  // Demo auto-type
  useEffect(() => {
    if (!open || !demo?.input || !activeStep?.target) return;
    const line = demo.input;
    const sel = activeStep.target;
    let attempts = 0;
    const fillTimer = window.setInterval(() => {
      attempts += 1;
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (el) {
        window.dispatchEvent(new CustomEvent("batua:tour-fill", { detail: line }));
        if (el.value === line || attempts > 50) window.clearInterval(fillTimer);
      } else if (attempts > 50) {
        window.clearInterval(fillTimer);
      }
    }, 120);
    return () => window.clearInterval(fillTimer);
  }, [open, index, contextualStep, demo?.input, activeStep?.target]);

  // Demo auto-advance
  useEffect(() => {
    if (!open || !demo?.waitFor) return;
    const waitFor = demo.waitFor;
    const stepIndex = index;
    const check = () => {
      if (!document.querySelector(waitFor)) return;
      window.clearInterval(poll);
      setDemoDone(true);
      window.setTimeout(() => {
        if (indexRef.current === stepIndex) goNext();
      }, 1100);
    };
    const poll = window.setInterval(check, 250);
    check();
    return () => window.clearInterval(poll);
  }, [open, index, contextualStep, demo?.waitFor, goNext]);

  if (!open || !activeStep) return null;

  const next = goNext;
  const prev = goPrev;

  const vw = window.innerWidth;
  const panelW = hero
    ? Math.min(HERO_W, vw - 32)
    : Math.min(kind === "spotlight" ? SPOT_W : HINT_W, vw - 24);
  const label = activeStep.cta || (contextualStep ? "Resume Tour" : isLast ? "Got it" : "Next");
  const mask = anchor ? cutoutMask(anchor.left, anchor.top, anchor.width, anchor.height) : null;
  const anchorC = anchor ? { x: anchor.left + anchor.width / 2, y: anchor.top + anchor.height / 2 } : null;

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[100]"
      role="dialog"
      aria-modal={!full}
      aria-label="Guided tour"
      data-testid="tour-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
    >
      {!full && !allowInteraction && (
        <motion.div
          data-testid="tour-scrim"
          className="pointer-events-auto absolute inset-0 z-[10] bg-black/30"
          style={{
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : {}),
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      )}

      {anchor && (
        <motion.div
          data-testid="tour-ring"
          className="pointer-events-none absolute z-[11] rounded-2xl border-2 border-primary tour-ring-breathe"
          style={{ left: anchor.left - 6, top: anchor.top - 6, width: anchor.width + 12, height: anchor.height + 12 }}
          initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 26 }}
        />
      )}

      {kind === "spotlight" && anchor && panelRect && anchorC && (
        <svg
          data-testid="tour-connector"
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute inset-0 z-[11]"
          style={{ width: "100%", height: "100%", overflow: "visible" }}
        >
          <motion.path
            d={connectorPath(panelEdge(panelRect, anchorC), anchorC)}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.15, ease: "easeOut" }}
          />
        </svg>
      )}

      <motion.div
        ref={panelRef}
        data-testid="tour-panel"
        tabIndex={-1}
        aria-labelledby="tour-headline"
        aria-describedby="tour-body"
        className={cn(
          "pointer-events-auto absolute z-[12] rounded-2xl border border-border/70 bg-card/95 shadow-elevated backdrop-blur-xl",
          hero ? "rounded-3xl p-8 text-center" : "p-5"
        )}
        style={{ left: panel?.x, top: panel?.y, width: panelW }}
        initial={{ opacity: 0, y: reduce ? 0 : 14, scale: reduce ? 1 : 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 26 }}
      >
        {hero ? (
          <>
            <Logo className="mx-auto h-12 w-12" aria-hidden="true" />
            <h2
              id="tour-headline"
              className="mt-4 text-[26px] font-bold leading-tight tracking-tight text-foreground"
            >
              {activeStep.title}
            </h2>
            <div
              id="tour-body"
              className="mx-auto mt-2.5 max-w-[380px] text-[15px] leading-relaxed text-muted-foreground"
            >
              {activeStep.body}
            </div>
            <div className="mt-7 flex items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={next}
                data-testid="tour-cta"
                className="h-11 rounded-xl px-7 text-[15px]"
              >
                {label}
                <ChevronRight className="h-4 w-4" />
              </Button>
              <button
                type="button"
                data-testid="tour-skip"
                onClick={onClose}
                className="h-11 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip for now
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Contextual exploration badge */}
            {contextualStep && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                <span>Exploring Feature</span>
                <button
                  type="button"
                  onClick={resumeMainTour}
                  className="flex items-center gap-1 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  Resume Tour ({idleTimeLeft}s)
                </button>
              </div>
            )}

            <div
              data-testid="tour-progress"
              aria-hidden="true"
              className="h-1 w-full overflow-hidden rounded-full bg-foreground/10"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${((index + 1) / total) * 100}%` }}
              />
            </div>

            <h2
              id="tour-headline"
              className="mt-3.5 text-base font-semibold leading-snug tracking-tight text-foreground"
            >
              {activeStep.title}
            </h2>
            <div id="tour-body" className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {activeStep.body}
            </div>

            <div className={cn("mt-5 flex items-center gap-2", kind === "spotlight" && "justify-center")}>
              <Button
                variant="outline"
                size="sm"
                onClick={prev}
                disabled={index === 0 && !contextualStep}
                aria-label="Previous step"
                data-testid="tour-prev"
                className="h-8 shrink-0 px-2.5"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={next} data-testid="tour-cta" className="h-8 flex-1">
                {label}
                {!isLast && !contextualStep && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {demo?.waitFor && (
              <div
                data-testid="tour-demo-status"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-[11px] font-medium"
              >
                {demoDone ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span className="text-primary">Parsed — here's what Batua understood</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                    <span className="text-muted-foreground">Waiting for you to press Parse…</span>
                  </>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <span
                className="text-[11px] font-medium tabular-nums text-muted-foreground"
                aria-hidden="true"
              >
                {contextualStep ? "Contextual" : `${index + 1} / ${total}`}
              </span>
              {full && (
                <span
                  className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground"
                  data-testid="tour-full-hint"
                >
                  <MousePointerClick className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Explore freely, then continue
                </span>
              )}
              <button
                type="button"
                data-testid="tour-skip"
                onClick={onClose}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}