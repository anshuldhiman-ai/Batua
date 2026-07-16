import React from "react";
import { cn } from "@/lib/utils";

/**
 * A glowing head + fading trail that continuously orbits the border of its
 * parent — a React port of the animated prompt-bar effect. Rendered on a
 * <canvas> so the motion stays buttery without re-rendering React.
 *
 * The parent MUST be `position: relative` and `overflow-hidden`; this canvas
 * fills it (inset-0) and the glow rides the rounded-rect edge, reading as an
 * animated luminous border. Honours prefers-reduced-motion (draws one static
 * frame and stops).
 *
 * @param radius  corner radius in px — match the parent's border-radius
 * @param speed   1–10, laps get faster as this rises
 * @param color1  head colour (hex) — the bright leading dot
 * @param color2  tail colour (hex) — the trail fades toward this hue
 */
export default function AnimatedGlowBorder({
  radius = 12,
  speed = 5,
  color1 = "#10b981",
  color2 = "#6ee7b7",
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

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      R = Math.min(radius, W / 2, H / 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    const hexToRgb = (hex) => ({
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    });
    const lerp = (c1, c2, f) => ({
      r: Math.round(c1.r + (c2.r - c1.r) * f),
      g: Math.round(c1.g + (c2.g - c1.g) * f),
      b: Math.round(c1.b + (c2.b - c1.b) * f),
    });
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    let t = 0;
    let last = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const steps = 60;
      const trail = 0.24;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const pt = pointOnPath(t - f * trail);
        const alpha = (1 - f) * 0.85;
        const size = (1 - f) * 8 + 2;
        const c = lerp(rgb1, rgb2, f);
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, size);
        g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${alpha})`);
        g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
      // bright bloom at the head
      const head = pointOnPath(t);
      const b = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 18);
      b.addColorStop(0, `rgba(${rgb1.r},${rgb1.g},${rgb1.b},0.9)`);
      b.addColorStop(0.5, `rgba(${rgb1.r},${rgb1.g},${rgb1.b},0.3)`);
      b.addColorStop(1, `rgba(${rgb1.r},${rgb1.g},${rgb1.b},0)`);
      ctx.beginPath();
      ctx.arc(head.x, head.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = b;
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
  }, [radius, speed, color1, color2]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-0", className)}
    />
  );
}
