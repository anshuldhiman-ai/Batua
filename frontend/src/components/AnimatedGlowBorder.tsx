import React from "react";
import { cn } from "@/lib/utils";

type GlowColor = { h: number; s: number; l: number };

type AnimatedGlowBorderProps = {
  radius?: number;
  speed?: number;
  color?: string;
  className?: string;
  trailLength?: number;
};

function readThemeColor(): GlowColor {
  const value =
    getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
    "158 84% 39%";
  const match = value.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!match) return { h: 158, s: 84, l: 39 };
  return {
    h: Number(match[1]),
    s: Number(match[2]),
    l: Number(match[3]),
  };
}

function brighten(color: GlowColor): GlowColor {
  return {
    h: color.h,
    s: Math.min(100, color.s + 10),
    l: Math.min(92, color.l + 34),
  };
}

function hsl(color: GlowColor, alpha: number) {
  return `hsl(${color.h} ${color.s}% ${color.l}% / ${alpha})`;
}

/**
 * Soft moving glow for prompt bars. The canvas is clipped by its parent and
 * draws only inside that shape, so the animation stays lively without spilling
 * into the surrounding card or page.
 */
export default function AnimatedGlowBorder({
  radius = 999,
  speed = 5,
  color,
  className,
  trailLength = 0.17,
}: AnimatedGlowBorderProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let r = 0;
    let t = 0;
    let last = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      r = Math.max(2, Math.min(radius, height / 2, width / 2));

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const perimeter = () => {
      const straight = Math.max(0, width - 2 * r);
      const vertical = Math.max(0, height - 2 * r);
      const arc = (Math.PI / 2) * r;
      return 2 * straight + 2 * vertical + 4 * arc;
    };

    const pointOnPath = (frac: number) => {
      const straight = Math.max(0, width - 2 * r);
      const vertical = Math.max(0, height - 2 * r);
      const arc = (Math.PI / 2) * r;
      let d = (((frac % 1) + 1) % 1) * perimeter();

      if (d < straight) return { x: r + d, y: 0 };
      d -= straight;
      if (d < arc) {
        const a = -Math.PI / 2 + d / r;
        return { x: width - r + Math.cos(a) * r, y: r + Math.sin(a) * r };
      }
      d -= arc;
      if (d < vertical) return { x: width, y: r + d };
      d -= vertical;
      if (d < arc) {
        const a = d / r;
        return { x: width - r + Math.cos(a) * r, y: height - r + Math.sin(a) * r };
      }
      d -= arc;
      if (d < straight) return { x: width - r - d, y: height };
      d -= straight;
      if (d < arc) {
        const a = Math.PI / 2 + d / r;
        return { x: r + Math.cos(a) * r, y: height - r + Math.sin(a) * r };
      }
      d -= arc;
      if (d < vertical) return { x: 0, y: height - r - d };

      const a = Math.PI + (d - vertical) / r;
      return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r };
    };

    const drawDot = (
      x: number,
      y: number,
      size: number,
      alpha: number,
      c1: GlowColor,
      c2: GlowColor,
      mix: number
    ) => {
      const c = {
        h: c1.h + (c2.h - c1.h) * mix,
        s: c1.s + (c2.s - c1.s) * mix,
        l: c1.l + (c2.l - c1.l) * mix,
      };
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, color || hsl(c, alpha));
      gradient.addColorStop(1, color ? "transparent" : hsl(c, 0));
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const primary = readThemeColor();
      const secondary = brighten(primary);
      const steps = 76;

      for (let i = 0; i <= steps; i += 1) {
        const frac = i / steps;
        const point = pointOnPath(t - trailLength * frac);
        drawDot(point.x, point.y, (1 - frac) * 6.5 + 1.5, (1 - frac) * 1, primary, secondary, frac);
      }

      const head = pointOnPath(t);
      drawDot(head.x, head.y, 16, 1, primary, secondary, 0);
      drawDot(head.x, head.y, 4, 1, secondary, secondary, 0);
      ctx.restore();
    };

    const loop = (ts: number) => {
      if (!last) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      t = (t + (Math.max(1, Math.min(speed, 10)) / 10) * dt * 0.6) % 1;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    if (reduce) {
      draw();
    } else {
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [radius, speed, color, trailLength]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-0", className)}
    />
  );
}
