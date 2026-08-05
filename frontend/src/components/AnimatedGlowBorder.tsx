import React from "react";
import { cn } from "@/lib/utils";

/**
 * A shooting star that orbits the border of its parent — a broad tapering tail
 * led by a small round glowing head (no arrowhead). Rendered on a <canvas> so
 * the motion stays buttery without re-rendering React.
 *
 * The tail is a crisp core streak wrapped in a soft glowing body; the head is a
 * layered orb (halo → mid glow → bright core) with a shine. Colours follow the
 * active accent theme (`--primary`) live, so switching the accent in Settings
 * recolours the orbit instantly.
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
}: any) {
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
    // The orbit path runs exactly along the parent's BORDER box — the same line
    // the Card's visible border draws. The canvas is inset by the border widths
    // so its top-left lands on the border-box corner (padding-box + border),
    // making the star's curve coincide with the border at the corners too.
    const resize = () => {
      const cw = parent.clientWidth;              // padding box (content + padding)
      const ch = parent.clientHeight;
      const bwL = parseFloat(getComputedStyle(parent).borderLeftWidth) || 0;
      const bwT = parseFloat(getComputedStyle(parent).borderTopWidth) || 0;
      const bwR = parseFloat(getComputedStyle(parent).borderRightWidth) || 0;
      const bwB = parseFloat(getComputedStyle(parent).borderBottomWidth) || 0;
      const fullW = cw + bwL + bwR;               // border box
      const fullH = ch + bwT + bwB;
      W = Math.max(0, fullW);
      H = Math.max(0, fullH);
      R = Math.max(2, Math.min(radius, W / 2, H / 2));
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      // Shift the canvas up-left so its origin sits on the border-box corner,
      // not the padding-box corner. Then path coords (0..W, 0..H) are the
      // border outline — exactly the track the star should ride.
      canvas.style.left = `${-bwL}px`;
      canvas.style.top = `${-bwT}px`;
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

    // Shooting-star shape: a round glowing head with a broad tail that tapers and
// fades behind it — no arrowhead triangle.
const LINE_W = 3.0;        // crisp core of the tail (broader streak)
const HEAD_R = 4.5;        // small round glowing head
const TAIL_MAX_W = 11;     // tail width right behind the head (broad, tapers off)
const TAIL_FRAC = 0.3;     // how far back the tail reaches along the orbit

    let t = 0;
    let last = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      const head = pointOnPath(t);

      // Sample the path backward from the head to build the tail.
      const S = 12;
      const tail = [];
      for (let i = 0; i <= S; i++) {
        const f = i / S;
        const p = pointOnPath(t - TAIL_FRAC * f);
        const q = pointOnPath(t - TAIL_FRAC * f - 0.0008);
        const ang = Math.atan2(p.y - q.y, p.x - q.x);
        const perp = ang + Math.PI / 2;
        tail.push({ x: p.x, y: p.y, perp, w: Math.max(0, TAIL_MAX_W * (1 - f)) });
      }

      ctx.lineCap = "round";
      // Crisp core streak, narrowing+fading away from the head.
      ctx.lineWidth = LINE_W;
      let prev = head;
      for (let i = 1; i <= S; i++) {
        const p = tail[i];
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = strokeColor(Math.max(0, 0.85 * (1 - i / S)));
        ctx.stroke();
        prev = p;
      }

      // Broad glowing tail body (the "shooting star" streak), with a soft
      // shadow so it shines. Widths widen toward the head and fade to nothing.
      ctx.save();
      ctx.shadowColor = strokeColor(0.7);
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      for (let i = 0; i <= S; i++) {
        const p = tail[i];
        ctx.lineTo(p.x + Math.cos(p.perp) * p.w * 0.5, p.y + Math.sin(p.perp) * p.w * 0.5);
      }
      for (let i = S; i >= 0; i--) {
        const p = tail[i];
        ctx.lineTo(p.x - Math.cos(p.perp) * p.w * 0.5, p.y - Math.sin(p.perp) * p.w * 0.5);
      }
      ctx.closePath();
      ctx.fillStyle = strokeColor(0.2);
      ctx.fill();
      ctx.restore();

      // Glowing round head — layered orbs: wide halo → mid glow → bright core.
      ctx.save();
      ctx.shadowColor = strokeColor(1);
      ctx.shadowBlur = 14;
      ctx.fillStyle = strokeColor(0.35);
      ctx.beginPath();
      ctx.arc(head.x, head.y, HEAD_R * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = strokeColor(0.75);
      ctx.beginPath();
      ctx.arc(head.x, head.y, HEAD_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = strokeColor(1);
      ctx.beginPath();
      ctx.arc(head.x, head.y, HEAD_R * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
      className={cn("pointer-events-none absolute z-0", className)}
    />
  );
}
