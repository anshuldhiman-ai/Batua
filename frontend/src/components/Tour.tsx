import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, MousePointerClick } from "lucide-react";

import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

export type TourPlacement = "left" | "right" | "top" | "bottom";

/** Two coach-mark types sharing the app's own visual language:
 *  - "spotlight"  Type A — hero moment: a connector draws from a centred
 *    glass panel to the highlighted element.
 *  - "hint"       Type B — quiet: a small card docks next to the element.
 *  Both blur out the rest of the page (sharp window over the target) and
 *  ring the element with the app's primary border + breathing glow.
 */
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
  /** Show the full page with no blur/veil — use when the whole page IS the
   *  content (e.g. Analytics charts). The emerald ring + card still show. */
  full?: boolean;
  /** Welcome step — a single, calm centred panel with the brand mark, a
   *  display headline and one primary action. No progress, no footer clutter. */
  hero?: boolean;
};

type Rect = { left: number; top: number; width: number; height: number };

const SPOT_W = 420; // Type A panel max width
const HINT_W = 320; // Type B card max width
const HERO_W = 460; // welcome hero card max width
const GAP = 12; // gap between a hint card and its anchor

/* Hand-drawn-style connector: a cubic bezier with perpendicular control
 * offsets that read as a slight natural wobble, not a ruler-straight line. */
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

/** The point on the panel's edge closest to the anchor — where the connector
 *  should start, so the curve always leaves the card toward the element. */
function panelEdge(panel: Rect, to: { x: number; y: number }) {
  const cx = panel.left + panel.width / 2;
  const cy = panel.top + panel.height / 2;
  if (Math.abs(to.x - cx) >= Math.abs(to.y - cy)) {
    return { x: to.x >= cx ? panel.left + panel.width : panel.left, y: cy };
  }
  return { x: cx, y: to.y >= cy ? panel.top + panel.height : panel.top };
}

/** Dock a Type B card next to its anchor without overlap, preferring the
 *  requested side then the most spacious alternative; clamp to the viewport. */
function fitHint(anchor: Rect, placement: TourPlacement, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cand: Record<TourPlacement, { x: number; y: number }> = {
    right: { x: anchor.left + anchor.width + GAP, y: anchor.top + anchor.height / 2 - h / 2 },
    left: { x: anchor.left - w - GAP, y: anchor.top + anchor.height / 2 - h / 2 },
    bottom: { x: anchor.left + anchor.width / 2 - w / 2, y: anchor.bottom + GAP },
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

/** An SVG mask that blurs the page everywhere except a sharp rounded window
 *  over the highlighted element — the "spotlight" effect. */
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
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [panel, setPanel] = useState<{ x: number; y: number } | null>(null);
  const [panelRect, setPanelRect] = useState<Rect | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = !!useReducedMotion();

  // Reset to step 0 each time the tour is (re)opened.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const step = steps[Math.min(index, steps.length - 1)];
  const kind: TourStepKind = step?.kind ?? "hint";
  const full = !!step?.full;
  const hero = !!step?.hero;
  const total = steps.length;
  const isLast = index === total - 1;

  /** Locate the step's target and record its screen rect. Whole-page targets
   *  (e.g. <main>) and missing selectors fall back to a centered card. */
  const refresh = useCallback(() => {
    const s = steps[index] || steps[0];
    const el = s.target ? (document.querySelector(s.target) as HTMLElement | null) : null;
    const center = () => {
      const vw = window.innerWidth;
      const w = Math.min(s.hero ? HERO_W : kind === "spotlight" ? SPOT_W : HINT_W, vw - 24);
      setAnchor(null);
      setPanel({ x: Math.round((vw - w) / 2), y: Math.round(window.innerHeight / 2 - 110) });
      setPanelRect(null);
    };
    if (!el) {
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
    // Only recentre the page on blurred steps — `full` steps must stay freely
    // scrollable, and this runs on every scroll, so calling scrollIntoView here
    // would yank the page back toward the target and fight the user.
    if (!s.full && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "auto" });
    setAnchor({ left: r.left, top: r.top, width: r.width, height: r.height });
  }, [index, steps, kind]);

  // Navigate to the step's route, then wait for the lazy-loaded page before
  // positioning. Re-run whenever the route settles.
  useEffect(() => {
    if (!open) return;
    const s = steps[index] || steps[0];
    if (s.route && s.route !== location.pathname) {
      navigate(s.route);
      return;
    }
    const timers = [30, 300, 700].map((ms) => window.setTimeout(refresh, ms));
    return () => timers.forEach(clearTimeout);
  }, [open, index, location.pathname, steps, navigate, refresh]);

  // Measure the rendered panel and pin it in place — Type B cards hug their
  // anchor; spotlight panels float centered. Also feeds the connector geometry.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (anchor && kind === "hint") {
        const p = fitHint(anchor, step?.placement || "right", w, h);
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
  }, [open, anchor, index, steps, kind, step?.placement]);

  // Keep the spotlight and cards glued to their elements while scrolling/resizing.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, { passive: true });
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh);
    };
  }, [open, refresh]);

  // Esc dismisses the tour. Tab is trapped inside the panel for blurred
  // (modal) steps, but left free on `full` steps where the page is the content.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && !full) {
        const el = panelRef.current;
        if (!el) return;
        const focusables = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((n) => !n.hasAttribute("disabled"));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, full, onClose]);

  // Move focus into the panel whenever the step changes.
  useEffect(() => {
    if (open && panel) panelRef.current?.focus?.();
  }, [open, panel, index]);

  // Lock page scroll behind blurred steps; `full` steps stay scrollable so the
  // user can move through the page the step is explaining.
  useEffect(() => {
    document.body.style.overflow = open && !full ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, full]);

  if (!open || !step) return null;

  const next = () => (isLast ? onFinish() : setIndex(index + 1));
  const prev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const vw = window.innerWidth;
  const panelW = hero
    ? Math.min(HERO_W, vw - 32)
    : Math.min(kind === "spotlight" ? SPOT_W : HINT_W, vw - 24);
  const label = step.cta || (isLast ? "Got it" : "Next");
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
      {/* Backdrop — matches the app's modal veil (bg-black/50) but blurs the
          whole page, with a sharp window punched over the highlighted element
          (SVG mask) so only the target stays in crisp focus. Omitted for
          `full` steps so the whole page stays visible and interactive. */}
      {!full && (
        <motion.div
          data-testid="tour-scrim"
          className="absolute inset-0 z-[10] bg-black/30"
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

      {/* Theme ring — the app's primary border + breathing glow around the
          element. Shown for both step kinds. */}
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

      {/* Type A — connector drawing from panel to the highlighted element. */}
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

      {/* Message panel — hero and tooltip share the app's glass + theme tokens,
          so blurred and full-page steps always read as one system. */}
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
          /* Welcome — a calm, single-action moment: brand, display headline,
             one call-to-action. No progress, no footer clutter. */
          <>
            <Logo className="mx-auto h-12 w-12" aria-hidden="true" />
            <h2
              id="tour-headline"
              className="mt-4 text-[26px] font-bold leading-tight tracking-tight text-foreground"
            >
              {step.title}
            </h2>
            <div
              id="tour-body"
              className="mx-auto mt-2.5 max-w-[380px] text-[15px] leading-relaxed text-muted-foreground"
            >
              {step.body}
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
          /* Anchored step — a small tooltip card with a hairline progress bar,
             one step forward/back, and a quiet skip. */
          <>
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
              {step.title}
            </h2>
            <div id="tour-body" className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {step.body}
            </div>

            <div className={cn("mt-5 flex items-center gap-2", kind === "spotlight" && "justify-center")}>
              <Button
                variant="outline"
                size="sm"
                onClick={prev}
                disabled={index === 0}
                aria-label="Previous step"
                data-testid="tour-prev"
                className="h-8 shrink-0 px-2.5"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={next} data-testid="tour-cta" className="h-8 flex-1">
                {label}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span
                className="text-[11px] font-medium tabular-nums text-muted-foreground"
                aria-hidden="true"
              >
                {index + 1} / {total}
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