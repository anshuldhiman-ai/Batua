import React from "react";
import { cn } from "@/lib/utils";

/**
 * A crisp comet — a thin bright line with a broader arrowhead — that
 * continuously orbits the border of its parent. Rendered on a <canvas> so
 * the motion stays buttery without re-rendering React.
 *
 * The line is deliberately sharp (no blur): a ~1.5px stroke whose tail fades
 * out, led by an arrowhead ~3× the line's width (1:3 line-to-arrow ratio).
 * Colours follow the active accent theme (`--primary`) live, so switching
 * the accent in Settings recolours the orbit instantly.
 *
 * The parent MUST be `position: relative` and `overflow-hidden`; this canvas
 * fills it (inset-0). Honours prefers-reduced-motion (draws one static frame
 * and stops).
 *
 * @param radius  corner radius in px — match the parent's border-radius
 * @param speed   1–10, laps get faster as this rises
 * @param color   optional CSS colour override; defaults to the theme accent
 */
export default function AnimatedGlowBorder({
  radius = 12,
  speed = 5,
  color,
  className,
}) {
  const canvasRef = React.useRef(null);
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0;
    let H = 0;
    let R = radius;
    // Inset the orbit path from the canvas edge so the stroke (and the
    // arrowhead, whose half-width is ARROW_W/2 = 3px) never gets clipped by
    // the parent's overflow-hidden.
    const INSET = 4;

    const resize = () => {
      // clientWidth/Height = the padding box — the exact area an inset-0
      // absolute child occupies. getBoundingClientRect() is the border box
      // (1px bigger each side for a bordered Card), which made the canvas
      // overhang the bottom/right and left the bottom edge half-clipped.
      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      W = Math.max(0, cw - 2 * INSET);
      H = Math.max(0, ch - 2 * INSET);
      R = Math.max(2, Math.min(radius - INSET, W / 2, H / 2));
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      // Translate by the inset so path coords (0..W, 0..H) land inside the edge.
      ctx.setTransform(dpr, 0, 0, dpr, INSET * dpr, INSET * dpr);
    };

    // Rounded-rectangle perimeter: 4 straight edges + 4 quarter-arcs. We walk
    // it clockwise from the top-left corner and map a 0..1 fraction to an (x,y).
    const geom = () => {
      const sx = Math.max(0, W - 2 * R); // horizontal straight run
      const sy = Math.max(0, H - 2 * R); // vertical straight run
      const arc = (Math.PI / 2) * R; // one quarter-arc length
      return { sx, sy, arc, perim: 2 * sx + 2 * sy + 4 * arc };
    };

    const pointOnPath = (frac) => {
      const { sx, sy, arc, perim } = geom();
      let d = ((((frac % 1) + 1) % 1)) * perim;
      // top edge (L→R)
      if (d < sx) return { x: R + d, y: 0 };
      d -= sx;
      // top-right arc
      if (d < arc) {
        const a = -Math.PI / 2 + d / R;
        return { x: W - R + Math.cos(a) * R, y: R + Math.sin(a) * R };
      }
      d -= arc;
      // right edge (T→B)
      if (d < sy) return { x: W, y: R + d };
      d -= sy;
      // bottom-right arc
      if (d < arc) {
        const a = d / R;
        return { x: W - R + Math.cos(a) * R, y: H - R + Math.sin(a) * R };
      }
      d -= arc;
      // bottom edge (R→L)
      if (d < sx) return { x: W - R - d, y: H };
      d -= sx;
      // bottom-left arc
      if (d < arc) {
        const a = Math.PI / 2 + d / R;
        return { x: R + Math.cos(a) * R, y: H - R + Math.sin(a) * R };
      }
      d -= arc;
      // left edge (B→T)
      if (d < sy) return { x: 0, y: H - R - d };
      d -= sy;
      // top-left arc
      const a = Math.PI + d / R;
      return { x: R + Math.cos(a) * R, y: R + Math.sin(a) * R };
    };

    /** Current accent colour as an "H S% L%" triplet, read live from the theme. */
    const themeTriplet = () => {
      if (color) return null; // explicit colour override wins
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim();
      return v || "158 84% 39%";
    };
    const strokeColor = (alpha) => {
      const t = themeTriplet();
      return t ? `hsl(${t} / ${alpha})` : color;
    };

    const LINE_W = 1.5;           // crisp, thin trail
    const ARROW_W = LINE_W * 4;   // arrowhead is 4× the line width — clearly broader
    const ARROW_LEN = ARROW_W * 2;

    let t = 0;
    let last = 0;

    const draw = () => {
      // Clear the full canvas including the inset margin (the arrowhead can
      // poke slightly outside the path rectangle).
      ctx.clearRect(-INSET, -INSET, W + 2 * INSET, H + 2 * INSET);

      // Trail — short stroked segments with alpha fading toward the tail.
      // Crisp on purpose: no shadowBlur, no radial gradients.
      const steps = 48;
      const trail = 0.22;
      ctx.lineCap = "round";
      ctx.lineWidth = LINE_W;
      let prev = pointOnPath(t);
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const pt = pointOnPath(t - f * trail);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = strokeColor((1 - f) * 0.9);
        ctx.stroke();
        prev = pt;
      }

      // Arrowhead — a solid triangle pointing along the direction of travel.
      const head = pointOnPath(t);
      const back = pointOnPath(t - 0.004);
      const ang = Math.atan2(head.y - back.y, head.x - back.x);
      const tipX = head.x + Math.cos(ang) * ARROW_LEN * 0.5;
      const tipY = head.y + Math.sin(ang) * ARROW_LEN * 0.5;
      const baseX = head.x - Math.cos(ang) * ARROW_LEN * 0.5;
      const baseY = head.y - Math.sin(ang) * ARROW_LEN * 0.5;
      const perp = ang + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX + Math.cos(perp) * ARROW_W * 0.5, baseY + Math.sin(perp) * ARROW_W * 0.5);
      ctx.lineTo(baseX - Math.cos(perp) * ARROW_W * 0.5, baseY - Math.sin(perp) * ARROW_W * 0.5);
      ctx.closePath();
      ctx.fillStyle = strokeColor(1);
      ctx.fill();
    };

    const loop = (ts) => {
      if (!last) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      t = (t + (speed / 10) * dt * 0.55) % 1;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    if (reduce) {
      draw();
    } else {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [radius, speed, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-0", className)}
    />
  );
}
