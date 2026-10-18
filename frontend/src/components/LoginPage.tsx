import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Fingerprint,
  Lock,
  LogIn,
  Mail,
  Shield,
  ShieldCheck,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/components/Auth";
import Logo from "@/components/Logo";
import { api } from "@/lib/utils-finance";
import {
  AuthAlert,
  AuthButton,
  AuthInput,
  PasswordInput,
  StrengthMeter,
  passwordStrength,
} from "@/components/ui/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fadeUp, noMotion, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sign-in / registration gate — Privacy-first, Local-first Personal Finance Vault.
 *
 * Left: near-black brand panel — logo lockup, the promise headline (white →
 * mint), the three trust pillars divided by hairlines, and the ambient ocean
 * swell along the bottom. A hairline seam with a single glowing node splits
 * the screen.
 * Right: deep charcoal canvas, starfield above, a frosted-glass card holding
 * the batua crest, "Sign in", the two fields, the primary "Unlock Batua"
 * action, and the quieter "Use Device Unlock" path below an "or" rule.
 *
 * The whole surface is intentionally dark regardless of the app theme (the
 * brand lockup reads on charcoal only), so every colour it needs is pinned on
 * the page root instead of borrowed from the app's light/dark scale.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const USERNAME_MIN = 3;
const PASSWORD_MIN = 4;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side attempt limiter against local brute-force attempts. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const MINT = "#4ADE80";
const INK_2 = "#C9D6CE";
const INK_3 = "#8FA396";

/** The three trust pillars under the headline. */
const PILLARS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Lock, title: "100% Offline", desc: "Your data, local only" },
  { icon: Zap, title: "Instant Access", desc: "No cloud sync needed" },
  { icon: ShieldCheck, title: "Bank-Grade Security", desc: "AES-256 Encryption" },
];

/* ------------------------------------------------------------------ */
/* Ambient layers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Ambient dune swell — the layered green ridges that cross the brand panel.
 *
 * Three crest lines (a bright main dune, a mid swell and a faint far ridge)
 * are drawn into an 835 × 941 box that maps 1:1 onto the panel, so the curves
 * sit exactly where the brand artwork puts them. Each dune is built from:
 *
 *   1. a short stack of blurred wide strokes, clipped to *below* the crest, so
 *      the glow falls away under the ridge and leaves the sky above it clean;
 *   2. an optional symmetric halo that is clipped to *above* the crest and
 *      fades in past the middle of the panel (the far-right mass);
 *   3. a crisp mint hairline sitting on the crest itself.
 *
 * Along-curve intensity is carried by linear gradients on the strokes, so each
 * ridge can brighten and fade the way the artwork's does — no masks, no hard
 * fills, and the colour stays inside the emerald family.
 *
 * Both the crest curves and those intensity curves are measured off the brand
 * artwork rather than eyeballed: each ridge is traced column by column, drawn
 * as short cubics so it stays smooth, and its bloom and hairline get their own
 * opacity profile. The hairline in particular does not follow the bloom — it
 * runs near level along the crest and thins to nothing where a dune in front
 * of it swallows the line.
 *
 * Panel-local by design: the sign-in side deliberately stays clean.
 */
const RIDGE_A =
  "M -200 862 C -192.7 857.8, -185.3 853.7, -178.0 849.4 C -170.7 845.1, -163.3 840.7, -156.0 836.0 C -148.7 831.2, -141.3 826.2, -134.0 820.8 C -126.7 815.4, -119.3 809.5, -112.0 803.1 " +
  "C -104.7 796.6, -97.3 789.6, -90.0 782.0 C -82.7 774.4, -75.3 766.4, -68.0 758.4 C -60.7 750.5, -53.3 742.6, -46.0 735.4 C -38.7 728.1, -31.3 721.3, -24.0 715.7 C -16.7 710.0, -9.3 705.4, -2.0 702.4 " +
  "C 5.3 699.3, 12.7 696.5, 20.0 693.3 C 27.3 690.0, 34.7 686.9, 42.0 684.0 C 49.3 681.0, 56.7 678.3, 64.0 675.9 C 71.3 673.4, 78.7 671.2, 86.0 669.1 C 93.3 667.0, 100.7 665.1, 108.0 663.4 " +
  "C 115.3 661.7, 122.7 660.2, 130.0 658.9 C 137.3 657.5, 144.7 656.4, 152.0 655.4 C 159.3 654.4, 166.7 653.5, 174.0 652.9 C 181.3 652.2, 188.7 651.6, 196.0 651.3 C 203.3 651.1, 210.7 651.0, 218.0 651.0 " +
  "C 225.3 651.1, 232.7 651.2, 240.0 651.6 C 247.3 652.0, 254.7 652.5, 262.0 653.3 C 269.3 654.0, 276.7 655.0, 284.0 656.1 C 291.3 657.1, 298.7 658.4, 306.0 659.9 C 313.3 661.3, 320.7 662.9, 328.0 664.8 " +
  "C 335.3 666.6, 342.7 668.5, 350.0 670.7 C 357.3 673.0, 364.7 675.4, 372.0 678.0 C 379.3 680.6, 386.7 683.3, 394.0 686.3 C 401.3 689.3, 408.7 692.5, 416.0 695.9 C 423.3 699.2, 430.7 702.8, 438.0 706.6 " +
  "C 445.3 710.4, 452.7 714.5, 460.0 718.8 C 467.3 723.2, 474.7 726.1, 482.0 733.7 C 489.3 741.2, 496.7 742.4, 504.0 747.8 C 511.3 753.1, 518.7 758.6, 526.0 764.2 C 533.3 769.8, 540.7 775.6, 548.0 781.6 " +
  "C 555.3 787.6, 562.7 793.7, 570.0 799.9 C 577.3 806.0, 584.7 812.3, 592.0 818.4 C 599.3 824.5, 606.7 830.5, 614.0 836.4 C 621.3 842.3, 628.7 847.9, 636.0 853.4 C 643.3 858.9, 650.7 864.3, 658.0 869.2 " +
  "C 665.3 874.1, 672.7 878.7, 680.0 883.2 C 687.3 887.7, 694.7 892.0, 702.0 896.2 C 709.3 900.5, 716.7 904.6, 724.0 908.6 C 731.3 912.6, 738.7 916.5, 746.0 920.1 C 753.3 923.8, 760.7 927.3, 768.0 930.9 " +
  "C 775.3 934.4, 782.7 937.9, 790.0 941.3 C 797.3 944.8, 804.7 948.2, 812.0 951.5 C 819.3 954.8, 826.7 956.6, 834.0 961.3 C 834.3 961.6, 834.7 961.8, 835.0 962.0";

const RIDGE_B =
  "M -60 1010 C -52.7 1003.2, -45.3 996.4, -38.0 989.6 C -30.7 982.9, -23.3 976.1, -16.0 969.3 C -8.7 962.6, -1.3 955.8, 6.0 949.1 C 13.3 942.4, 20.7 935.7, 28.0 929.0 " +
  "C 35.3 922.3, 42.7 915.6, 50.0 909.0 C 57.3 902.4, 64.7 895.8, 72.0 889.3 C 79.3 882.8, 86.7 876.4, 94.0 870.3 C 101.3 864.1, 108.7 858.3, 116.0 852.9 C 123.3 847.5, 130.7 842.5, 138.0 838.2 " +
  "C 145.3 834.0, 152.7 831.4, 160.0 827.0 C 167.3 822.6, 174.7 817.4, 182.0 812.9 C 189.3 808.4, 196.7 804.2, 204.0 800.2 C 211.3 796.2, 218.7 792.4, 226.0 788.9 C 233.3 785.3, 240.7 782.0, 248.0 778.9 " +
  "C 255.3 775.8, 262.7 772.9, 270.0 770.2 C 277.3 767.5, 284.7 765.0, 292.0 762.8 C 299.3 760.5, 306.7 758.5, 314.0 756.7 C 321.3 754.9, 328.7 753.3, 336.0 751.9 C 343.3 750.4, 350.7 749.2, 358.0 748.2 " +
  "C 365.3 747.2, 372.7 746.3, 380.0 745.7 C 387.3 745.1, 394.7 744.7, 402.0 744.5 C 409.3 744.3, 416.7 744.3, 424.0 744.5 C 431.3 744.6, 438.7 745.0, 446.0 745.5 C 453.3 746.0, 460.7 746.8, 468.0 747.6 " +
  "C 475.3 748.5, 482.7 749.4, 490.0 749.6 C 497.3 749.8, 504.7 749.7, 512.0 749.8 C 519.3 749.9, 526.7 750.1, 534.0 750.6 C 541.3 751.2, 548.7 752.0, 556.0 753.2 C 563.3 754.4, 570.7 755.9, 578.0 757.8 " +
  "C 585.3 759.6, 592.7 761.7, 600.0 764.1 C 607.3 766.5, 614.7 769.3, 622.0 772.8 C 629.3 776.3, 636.7 779.0, 644.0 780.9 C 651.3 782.9, 658.7 784.7, 666.0 786.5 C 673.3 788.3, 680.7 790.1, 688.0 791.9 " +
  "C 695.3 793.7, 702.7 795.5, 710.0 797.4 C 717.3 799.3, 724.7 801.3, 732.0 803.3 C 739.3 805.3, 746.7 807.3, 754.0 809.4 C 761.3 811.5, 768.7 813.6, 776.0 815.7 C 783.3 817.8, 790.7 819.9, 798.0 822.0 " +
  "C 805.3 824.1, 812.7 826.3, 820.0 828.3 C 825.0 829.6, 830.0 830.6, 835.0 832.0";

const RIDGE_C =
  "M -100 726 C -92.7 724.9, -85.3 723.9, -78.0 722.8 C -70.7 721.8, -63.3 720.8, -56.0 719.8 C -48.7 718.8, -41.3 717.9, -34.0 717.0 C -26.7 716.1, -19.3 715.3, -12.0 714.6 " +
  "C -4.7 713.8, 2.7 713.4, 10.0 712.5 C 17.3 711.6, 24.7 710.5, 32.0 709.4 C 39.3 708.4, 46.7 707.3, 54.0 706.2 C 61.3 705.2, 68.7 704.1, 76.0 703.1 C 83.3 702.1, 90.7 701.2, 98.0 700.3 " +
  "C 105.3 699.4, 112.7 698.6, 120.0 697.8 C 127.3 697.0, 134.7 696.3, 142.0 695.6 C 149.3 694.9, 156.7 694.3, 164.0 693.7 C 171.3 693.1, 178.7 692.6, 186.0 692.0 C 193.3 691.5, 200.7 691.0, 208.0 690.5 " +
  "C 215.3 690.0, 222.7 689.5, 230.0 689.0 C 237.3 688.6, 244.7 688.2, 252.0 687.8 C 259.3 687.4, 266.7 687.1, 274.0 686.8 C 281.3 686.5, 288.7 686.3, 296.0 686.1 C 303.3 686.0, 310.7 685.9, 318.0 685.8 " +
  "C 325.3 685.8, 332.7 685.8, 340.0 685.8 C 347.3 685.9, 354.7 686.0, 362.0 686.1 C 369.3 686.3, 376.7 686.4, 384.0 686.6 C 391.3 686.8, 398.7 687.0, 406.0 687.2 C 413.3 687.4, 420.7 687.5, 428.0 687.8 " +
  "C 435.3 688.0, 442.7 688.4, 450.0 690.0 C 457.3 691.6, 464.7 693.4, 472.0 692.9 C 479.3 692.4, 486.7 691.0, 494.0 690.1 C 501.3 689.2, 508.7 688.5, 516.0 687.9 C 523.3 687.4, 530.7 687.1, 538.0 687.0 " +
  "C 545.3 686.9, 552.7 687.0, 560.0 687.3 C 567.3 687.6, 574.7 688.2, 582.0 688.9 C 589.3 689.7, 596.7 690.6, 604.0 691.8 C 611.3 692.9, 618.7 694.3, 626.0 695.8 C 633.3 697.4, 640.7 699.1, 648.0 701.0 " +
  "C 655.3 702.9, 662.7 705.1, 670.0 707.3 C 677.3 709.6, 684.7 712.1, 692.0 714.7 C 699.3 717.4, 706.7 720.3, 714.0 723.3 C 721.3 726.3, 728.7 729.5, 736.0 732.8 C 743.3 736.1, 750.7 739.6, 758.0 743.3 " +
  "C 765.3 746.9, 772.7 750.7, 780.0 754.5 C 787.3 758.3, 794.7 762.2, 802.0 766.2 C 809.3 770.1, 816.7 774.4, 824.0 777.5 C 831.3 780.6, 838.7 783.5, 846.0 788.9 C 850.7 792.3, 855.3 796.1, 860.0 800.0";


/** Blurred wide strokes, shared by every ridge: [width, blur, opacity]. */
const GLOW_STACK: [number, number, number][] = [
  [12, 5, 0.78],
  [44, 10, 0.5],
  [96, 17, 0.24],
  [190, 30, 0.15],
];

type Ridge = {
  d: string;
  /** Relative strength of this dune's bloom. */
  glowScale: number;
  /** Along-curve opacity of the bloom layer. */
  fade: [number, number][];
  /** Colour, stroke width and along-curve opacity of the crest hairline. */
  line: { colour: string; width: number; fade: [number, number][] };
  /** Optional bloom that sits *above* the crest, weighted to the far right. */
  halo?: { fade: [number, number][]; layers: [number, number, number][] };
};

/** Back dune first, so each crest is hazed by the dune behind it. */
const RIDGES: Ridge[] = [
  {
    d: RIDGE_A,
    glowScale: 1,
    fade: [
      [0, 0.48],
      [0.1, 0.72],
      [0.22, 1],
      [0.4, 0.62],
      [0.5, 0.5],
      [0.62, 1],
      [0.75, 1],
      [1, 0.97],
    ],
    line: {
      colour: "#8CEFC6",
      width: 1.6,
      fade: [
        [0, 0.451],
        [0.0625, 0.597],
        [0.125, 0.778],
        [0.1875, 0.852],
        [0.25, 0.855],
        [0.3125, 0.807],
        [0.375, 0.799],
        [0.4375, 0.775],
        [0.5, 0.729],
        [0.5625, 0.741],
        [0.625, 0.792],
        [0.6875, 0.803],
        [0.75, 0.845],
        [0.8125, 0.674],
        [0.875, 0.508],
        [0.9375, 0.354],
        [1, 0],
      ],
    },
    halo: {
      fade: [
        [0.62, 0],
        [0.72, 0.43],
        [0.82, 0.71],
        [1, 0.35],
      ],
      layers: [
        [70, 16, 0.7],
        [130, 26, 0.6],
      ],
    },
  },
  {
    d: RIDGE_B,
    glowScale: 0.41,
    fade: [
      [0, 0],
      [0.14, 0.05],
      [0.2, 0.12],
      [0.24, 0.25],
      [0.3, 0.42],
      [0.4, 0.62],
      [0.48, 0.8],
      [0.58, 1],
      [0.7, 0.32],
      [0.78, 0.26],
      [0.88, 0.24],
      [1, 0.28],
    ],
    line: {
      colour: "#8CEFC6",
      width: 1.5,
      fade: [
        [0, 0.046],
        [0.0625, 0.046],
        [0.125, 0.046],
        [0.1875, 0.054],
        [0.25, 0.148],
        [0.3125, 0.178],
        [0.375, 0.222],
        [0.4375, 0.355],
        [0.5, 0.477],
        [0.5625, 0.496],
        [0.625, 0],
        [0.6875, 0],
        [0.75, 0.003],
        [0.8125, 0.076],
        [0.875, 0.111],
        [0.9375, 0.115],
        [1, 0.107],
      ],
    },
  },
  {
    d: RIDGE_C,
    glowScale: 0.11,
    fade: [
      [0, 0.05],
      [0.15, 0.1],
      [0.35, 0.25],
      [0.5, 0.5],
      [0.55, 0.64],
      [0.67, 0.88],
      [0.8, 1],
      [1, 0.88],
    ],
    line: {
      colour: "#6EE7B7",
      width: 1.3,
      fade: [
        [0, 0],
        [0.0625, 0],
        [0.125, 0],
        [0.1875, 0],
        [0.25, 0],
        [0.3125, 0],
        [0.375, 0],
        [0.4375, 0],
        [0.5, 0],
        [0.5625, 0.154],
        [0.625, 0.175],
        [0.6875, 0.194],
        [0.75, 0.205],
        [0.8125, 0.226],
        [0.875, 0.216],
        [0.9375, 0.188],
        [1, 0.183],
      ],
    },
  },
];

/** Draw order: faintest dune at the back, main dune on top. */
const RIDGE_ORDER = [2, 1, 0];

const WAVE_W = 835;
const WAVE_H = 941;
/** Every bloom is clipped against its own crest: closed down, then up. */
const CLOSE_DOWN = " L 1400 1400 L -400 1400 Z";
const CLOSE_UP = " L 1400 -400 L -400 -400 Z";

const SIGMAS = Array.from(
  new Set([...GLOW_STACK.map((l) => l[1]), ...RIDGES.flatMap((r) => (r.halo?.layers ?? []).map((l) => l[1]))])
).sort((a, b) => a - b);

function WaveBackground({ className }: { className?: string }) {
  // Unique ids per instance — a duplicate <linearGradient id> would make
  // separate mounts resolve to the same def.
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const stopsOf = (fade: [number, number][], colour: string) =>
    fade.map(([at, opacity]) => (
      <stop key={at} offset={`${at * 100}%`} stopColor={colour} stopOpacity={opacity} />
    ));

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden select-none", className)}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id={`wv-bg-${uid}`} cx="0.08" cy="0.68" r="0.28">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
          </radialGradient>

          {SIGMAS.map((sigma) => (
            <filter
              key={sigma}
              id={`wv-b${sigma}-${uid}`}
              filterUnits="userSpaceOnUse"
              x={-400}
              y={250}
              width={1700}
              height={1100}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation={sigma} />
            </filter>
          ))}

          {RIDGES.map((ridge, i) => (
            <linearGradient
              key={`glow${i}`}
              id={`wv-glow-${i}-${uid}`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={WAVE_W}
              y2={0}
            >
              {stopsOf(ridge.fade, "#10B981")}
            </linearGradient>
          ))}
          {RIDGES.map((ridge, i) =>
            ridge.halo ? (
              <linearGradient
                key={`halo${i}`}
                id={`wv-halo-${i}-${uid}`}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={0}
                x2={WAVE_W}
                y2={0}
              >
                {stopsOf(ridge.halo.fade, "#10B981")}
              </linearGradient>
            ) : null
          )}

          {/*
            The crest hairline keeps its own opacity curve: it reads almost
            level along the whole crest instead of following the bloom, and it
            thins to nothing where the artwork's line is swallowed by a dune in
            front of it.
          */}
          {RIDGES.map((ridge, i) => (
            <linearGradient
              key={`line${i}`}
              id={`wv-line-${i}-${uid}`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={0}
              x2={WAVE_W}
              y2={0}
            >
              {stopsOf(ridge.line.fade, ridge.line.colour)}
            </linearGradient>
          ))}

          {RIDGES.map((ridge, i) => (
            <clipPath key={`cd${i}`} id={`wv-cd-${i}-${uid}`}>
              <path d={ridge.d + CLOSE_DOWN} />
            </clipPath>
          ))}
          {RIDGES.map((ridge, i) => (
            <clipPath key={`cu${i}`} id={`wv-cu-${i}-${uid}`}>
              <path d={ridge.d + CLOSE_UP} />
            </clipPath>
          ))}
        </defs>

        <rect width={WAVE_W} height={WAVE_H} fill="#020B07" />
        <rect width={WAVE_W} height={WAVE_H} fill={`url(#wv-bg-${uid})`} />

        {RIDGE_ORDER.map((i) => {
          const ridge = RIDGES[i];
          const line = ridge.line;
          return (
            <g key={i}>
              {ridge.halo && (
                <g clipPath={`url(#wv-cu-${i}-${uid})`}>
                  {ridge.halo.layers.map(([width, sigma, opacity]) => (
                    <path
                      key={`${width}-${sigma}`}
                      d={ridge.d}
                      fill="none"
                      stroke={`url(#wv-halo-${i}-${uid})`}
                      strokeWidth={width}
                      strokeOpacity={opacity}
                      filter={`url(#wv-b${sigma}-${uid})`}
                    />
                  ))}
                </g>
              )}
              <g clipPath={`url(#wv-cd-${i}-${uid})`}>
                {GLOW_STACK.map(([width, sigma, opacity]) => (
                  <path
                    key={`${width}-${sigma}`}
                    d={ridge.d}
                    fill="none"
                    stroke={`url(#wv-glow-${i}-${uid})`}
                    strokeWidth={width}
                    strokeOpacity={+(opacity * ridge.glowScale).toFixed(3)}
                    filter={`url(#wv-b${sigma}-${uid})`}
                  />
                ))}
              </g>
              <path
                d={ridge.d}
                fill="none"
                stroke={`url(#wv-line-${i}-${uid})`}
                strokeWidth={line.width}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Starfield animation with twinkling stars and shooting stars.
 * Rendered exclusively on the upper portion of the right-hand authentication panel.
 */
const TWINKLE_STARS = [
  { top: "6%", left: "15%", size: 2, delay: "0s", duration: "1.4s" },
  { top: "14%", left: "42%", size: 1.5, delay: "0.4s", duration: "1.8s" },
  { top: "9%", left: "75%", size: 2.5, delay: "0.2s", duration: "1.5s" },
  { top: "22%", left: "86%", size: 1.5, delay: "0.9s", duration: "2.0s" },
  { top: "18%", left: "28%", size: 2, delay: "0.6s", duration: "1.6s" },
  { top: "30%", left: "14%", size: 1, delay: "1.1s", duration: "1.7s" },
  { top: "11%", left: "62%", size: 2, delay: "0.3s", duration: "1.9s" },
  { top: "25%", left: "68%", size: 1.5, delay: "1.2s", duration: "1.5s" },
  { top: "35%", left: "52%", size: 1, delay: "0.5s", duration: "1.7s" },
  { top: "16%", left: "94%", size: 2, delay: "0.8s", duration: "1.6s" },
  { top: "5%", left: "35%", size: 1.5, delay: "1.3s", duration: "1.8s" },
  { top: "28%", left: "82%", size: 2, delay: "0.1s", duration: "1.5s" },
  { top: "38%", left: "24%", size: 1.5, delay: "0.7s", duration: "1.9s" },
  { top: "12%", left: "8%", size: 1, delay: "1.0s", duration: "1.4s" },
  { top: "32%", left: "92%", size: 1.5, delay: "0.4s", duration: "1.8s" },
];

function StarFieldAnimation() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  const starFade =
    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[380px] overflow-hidden select-none z-0"
      aria-hidden="true"
      style={{ maskImage: starFade, WebkitMaskImage: starFade }}
    >
      {/* Blinking / Twinkling stars */}
      {TWINKLE_STARS.map((star, i) => (
        <span
          key={i}
          className="auth-star"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}

      {/* Shooting stars with glowing comet tails — fast sweeps */}
      <span
        className="auth-meteor"
        style={{ top: "10%", right: "12%", animationDelay: "0.4s", animationDuration: "3.8s" }}
      />
      <span
        className="auth-meteor"
        style={{ top: "24%", right: "36%", animationDelay: "1.8s", animationDuration: "4.5s" }}
      />
      <span
        className="auth-meteor"
        style={{ top: "8%", right: "65%", animationDelay: "3.2s", animationDuration: "4.0s" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brand panel (left)                                                 */
/* ------------------------------------------------------------------ */

function BrandPanel() {
  const reduce = useReducedMotion();
  const variants = reduce ? noMotion : staggerContainer;
  const item = reduce ? noMotion : fadeUp;

  return (
    <section
      className="relative order-2 overflow-hidden lg:order-1 lg:flex lg:flex-col lg:h-full justify-between p-6 sm:p-8 lg:py-10 lg:px-12 xl:px-16 text-white"
      style={{
        // Near-black ground. The swell SVG paints the real background; this is
        // only the fallback behind it and the colour under the panel's edges.
        background: "#020B07",
      }}
      aria-label="About Batua"
    >
      {/* Ambient aurora ribbons sweeping across the panel */}
      <WaveBackground />

      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="relative z-10 flex h-full w-full max-w-[680px] flex-col justify-between mx-auto"
      >
        {/* Brand lockup: crest + wordmark | descriptor */}
        <motion.div variants={item} className="flex items-center gap-3.5 sm:gap-5">
          <motion.span
            whileHover={reduce ? undefined : { scale: 1.08, rotate: -5 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
            className="shrink-0"
          >
            <Logo className="h-10 w-10 lg:h-11 lg:w-11" />
          </motion.span>
          <span className="font-brand text-[20px] uppercase leading-none tracking-[0.2em] text-white sm:text-[22px] lg:text-[24px]">
            BATUA
          </span>
          <span aria-hidden="true" className="h-7 w-px bg-white/15 lg:h-8" />
          <span className="text-[13.5px] font-medium text-[#8FA396] sm:text-[15px] lg:text-[16px]">
            Personal, Private Finance
          </span>
        </motion.div>

        {/* Headline, promise and trust pillars */}
        <div className="relative my-auto flex w-full flex-col gap-8 py-10 lg:gap-12 lg:py-14">
          <div className="relative space-y-6">
            <motion.h2
              variants={item}
              className="font-display text-[34px] font-bold leading-[1.06] tracking-[-0.025em] text-white sm:text-[46px] lg:text-[54px] xl:text-[58px]"
            >
              Take control of your money,{" "}
              <span className="block text-[#4ADE80] drop-shadow-[0_0_28px_rgba(74,222,128,0.35)]">
                without giving up your privacy.
              </span>
            </motion.h2>
            <motion.p
              variants={item}
              className="max-w-[560px] text-[14.5px] leading-[1.7] text-[#8FA396] sm:text-[16px] lg:text-[17px]"
            >
              A personal finance app that keeps your data on your device.
              <br />
              Track, plan and grow – all offline, all yours.
            </motion.p>
          </div>

          <motion.ul
            variants={item}
            className="relative grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-y-0"
          >
            {PILLARS.map((pillar, i) => (
              <li
                key={pillar.title}
                className={cn(
                  "group flex items-start gap-3.5 transition-transform duration-300 ease-out sm:hover:-translate-y-0.5",
                  i > 0 &&
                    "sm:border-l sm:border-white/[0.12] sm:pl-6 sm:transition-colors sm:hover:border-white/[0.22]",
                  i < PILLARS.length - 1 && "sm:pr-6"
                )}
              >
                <pillar.icon
                  className="mt-0.5 h-6 w-6 shrink-0 text-[#4ADE80] transition-all duration-300 ease-out group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_rgba(74,222,128,0.6)] lg:h-[26px] lg:w-[26px]"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-white lg:text-[16px]">
                    {pillar.title}
                  </div>
                  <div className="mt-1 text-[13px] leading-snug text-[#8FA396] transition-colors duration-300 group-hover:text-[#C9D6CE] lg:text-[13.5px]">
                    {pillar.desc}
                  </div>
                </div>
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Minimalist copyright footer */}
        <motion.footer
          variants={item}
          className="text-[12.5px] font-medium text-[#6B7D70] lg:text-[13px]"
        >
          © 2026 Batua
        </motion.footer>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Forgot Password Dialog                                             */
/* ------------------------------------------------------------------ */

function ForgotPasswordDialog({
  open,
  defaultUsername,
  onClose,
  onSuccess,
}: {
  open: boolean;
  defaultUsername: string;
  onClose: () => void;
  onSuccess: (username: string) => void;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername(defaultUsername);
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setSuccess(null);
    }
  }, [open, defaultUsername]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim()) return;
    if (newPassword.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/forgot-password", {
        username: username.trim(),
        new_password: newPassword,
      });
      setSuccess(data?.message || "Password reset successfully!");
      setTimeout(() => {
        onSuccess(username.trim());
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not reset password. Please check your username."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-white/10 bg-[#0e1612] text-white">
        <DialogHeader>
          <DialogTitle className="text-white font-display uppercase tracking-wide">
            Reset Password
          </DialogTitle>
          <DialogDescription className="text-slate-300 text-[13px]">
            Enter your username to set a new password for your local vault. Your existing transactions and ledger entries remain completely safe.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <p className="text-[14px] font-semibold text-emerald-400">{success}</p>
            <p className="text-[12px] text-slate-400">Ready to sign in with your new password…</p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-3.5 pt-1">
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthInput
              id="reset-username"
              label="Username"
              placeholder="Enter your username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={
                username.trim() && username.trim().length < USERNAME_MIN
                  ? `At least ${USERNAME_MIN} characters`
                  : null
              }
            />
            <AuthInput
              id="reset-new-password"
              label="New password"
              type="password"
              placeholder="Enter new password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <AuthInput
              id="reset-confirm-password"
              label="Confirm new password"
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="pt-2">
              <AuthButton
                type="submit"
                variant="gradient"
                loading={busy}
                loadingLabel="Updating password…"
                disabled={!username.trim() || !newPassword || !confirmPassword}
              >
                Reset Password
              </AuthButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                           */
/* ------------------------------------------------------------------ */

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const { register, login } = useAuth();
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "warning"; text: string } | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [rememberDevice, setRememberDevice] = useState(false);
  const attemptsRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  const strength = React.useMemo(() => passwordStrength(form.password), [form.password]);
  const item = reduce ? noMotion : fadeUp;

  const isLogin = mode === "login";

  /* ---- rate limit / lockout countdown -------------------------------- */
  useEffect(() => {
    if (lockoutUntil === 0) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setLockoutUntil(0);
        attemptsRef.current = 0;
        setBanner(null);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lockoutUntil]);

  /* ---- caps lock tracking -------------------------------------------- */
  const trackCapsLock = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock"));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /* ---- validation ----------------------------------------------------- */
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (form.username.trim().length < USERNAME_MIN) {
      errors.username = `Username must be at least ${USERNAME_MIN} characters`;
    }
    if (mode === "register") {
      if (!EMAIL_RE.test(form.email.trim())) {
        errors.email = "Enter a valid email address";
      }
      if (form.password.length < PASSWORD_MIN) {
        errors.password = `Password must be at least ${PASSWORD_MIN} characters`;
      }
      if (form.password !== form.confirm) {
        errors.confirm = "Passwords do not match";
      }
    } else if (form.password.length < PASSWORD_MIN) {
      errors.password = `Password must be at least ${PASSWORD_MIN} characters`;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ---- submit ---------------------------------------------------------- */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || succeeded || lockoutUntil > Date.now()) return;
    setBanner(null);

    if (attemptsRef.current >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_SECONDS * 1000;
      setLockoutUntil(until);
      setBanner({
        kind: "warning",
        text: `Too many attempts. Try again in ${LOCKOUT_SECONDS}s.`,
      });
      return;
    }

    if (!validate()) {
      formRef.current?.classList.remove("auth-shake");
      void formRef.current?.offsetWidth;
      formRef.current?.classList.add("auth-shake");
      return;
    }

    setBusy(true);
    try {
      const username = form.username.trim();
      if (mode === "login") {
        await login(username, form.password);
      } else {
        await register(username, form.email.trim(), form.password);
        await login(username, form.password);
      }
      attemptsRef.current = 0;
      setSucceeded(true);
      window.setTimeout(() => navigate("/dashboard", { replace: true }), 700);
    } catch (err: any) {
      attemptsRef.current += 1;
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409) {
        setBanner({ kind: "error", text: "An account with this username already exists. Sign in instead." });
      } else if (status === 404) {
        setBanner({ kind: "error", text: "No account found with that username. Create one to get started." });
      } else if (status === 401 || status === 400) {
        setBanner({ kind: "error", text: "Invalid credentials. Please check your username and password." });
      } else if (!err?.response) {
        setBanner({ kind: "error", text: "Server unreachable. Ensure the backend is running and try again." });
      } else {
        setBanner({
          kind: "error",
          text: typeof detail === "string" ? detail : "Something went wrong. Please try again.",
        });
      }
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockoutUntil(until);
        setBanner({ kind: "warning", text: `Too many attempts. Try again in ${LOCKOUT_SECONDS}s.` });
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmError =
    mode === "register" && confirmTouched && form.confirm && form.password !== form.confirm
      ? "Passwords do not match"
      : null;

  const switchMode = () =>
    setMode((m) => {
      setFieldErrors({});
      setConfirmTouched(false);
      setBanner(null);
      setDeviceNotice(null);
      return m === "login" ? "register" : "login";
    });

  return (
    <div
      className="relative grid min-h-dvh grid-cols-1 overflow-x-hidden bg-[#0A0A0A] [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] lg:h-dvh lg:grid-cols-2 lg:overflow-hidden text-white"
      style={{
        color: "var(--auth-ink, #EDF3EF)",
        // Auth surface tokens — pinned (dark) rather than inherited, so the
        // branded sign-in reads identically in light and dark app themes.
        "--auth-page": "#0A0F0D",
        "--auth-panel": "rgba(255, 255, 255, 0.04)",
        "--auth-surface": "rgba(255, 255, 255, 0.05)",
        "--auth-ink": "#EDF3EF",
        "--auth-ink-2": INK_2,
        "--auth-ink-3": INK_3,
        "--auth-line-strong": "rgba(255, 255, 255, 0.18)",
        "--auth-accent": MINT,
        "--auth-accent-hover": "#6EE7A8",
        "--auth-accent-soft": "rgba(74, 222, 128, 0.16)",
        "--auth-accent-ink": "#05231A",
        "--auth-error": "#F0826F",
        "--auth-error-soft": "rgba(240, 130, 111, 0.16)",
        "--auth-warning": "#E8B04B",
        // The inline <Logo> paints itself from the app's --foreground/--primary;
        // scope both here so the crest is always light-on-charcoal with mint
        // coin rings, whatever theme the app itself is in.
        "--foreground": "0 0% 100%",
        "--primary": "158 84% 45%",
      } as React.CSSProperties}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg font-medium"
      >
        Skip to main content
      </a>

      <BrandPanel />

      <main
        id="main-content"
        className="relative z-10 order-1 flex min-h-0 items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 lg:order-2 lg:h-full lg:px-10 lg:py-6 xl:px-14"
        style={{
          // Layered premium surface: a cool emerald bloom up top, a teal
          // undertow from the lower left, over a deep vertical charcoal base.
          background:
            "radial-gradient(115% 80% at 82% 4%, rgba(16, 185, 129, 0.14) 0%, transparent 55%)," +
            "radial-gradient(100% 70% at 10% 100%, rgba(5, 150, 105, 0.13) 0%, transparent 60%)," +
            "linear-gradient(168deg, #0C1417 0%, #101B1E 44%, #070C0E 100%)",
        }}
      >
        {/* Shooting stars & twinkling stars across the upper sky */}
        <StarFieldAnimation />

        {/* Soft emerald lift behind the card so it reads as the focal point */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.10] blur-[120px]"
          aria-hidden="true"
        />

        <motion.div
          variants={reduce ? noMotion : staggerContainer}
          initial="hidden"
          animate="show"
          className="m-auto w-full max-w-[430px] py-2"
        >
          {/* Glassmorphic card */}
          <motion.div
            variants={item}
            className={cn(
              "relative w-full rounded-[32px] p-6 sm:p-8 backdrop-blur-2xl transition-all duration-200",
              "bg-[#0e1411]/85 border border-white/[0.09]",
              "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.14),0_24px_50px_-12px_rgba(0,0,0,0.8)]",
              "focus-within:border-emerald-500/40 focus-within:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.18),0_24px_50px_-12px_rgba(0,0,0,0.8),0_0_30px_-5px_rgba(74,222,128,0.22)]"
            )}
          >
            {/* Gradient hairline on top edge */}
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#4ADE80]/50 to-transparent"
              aria-hidden="true"
            />

            {/* Heading — the card opens straight on the action */}
            <motion.div variants={item} className="flex flex-col items-center text-center">
              <h1 className="font-display text-[26px] font-bold tracking-tight text-white sm:text-[30px]">
                {isLogin ? "Sign in" : "Create your vault"}
              </h1>
              <p className="mt-1.5 text-[13.5px]" style={{ color: INK_3 }}>
                {isLogin ? "Access your local finance vault." : "Set up your local finance vault."}
              </p>
            </motion.div>

            {banner && (
              <motion.div variants={item} className="mt-4" aria-live="polite">
                <AuthAlert variant={banner.kind}>
                  {banner.kind === "warning"
                    ? `Too many attempts. Try again in ${secondsLeft}s.`
                    : banner.text}
                </AuthAlert>
              </motion.div>
            )}

            <motion.form
              ref={formRef}
              variants={item}
              onSubmit={submit}
              noValidate
              className="mt-5 space-y-4"
            >
              <AuthInput
                id="login-username"
                label="Username"
                placeholder="Enter your username"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                icon={<User className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                value={form.username}
                onChange={set("username")}
                error={fieldErrors.username}
              />

              {mode === "register" && (
                <AuthInput
                  id="login-email"
                  label="Email"
                  type="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  icon={<Mail className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  value={form.email}
                  onChange={set("email")}
                  error={fieldErrors.email}
                />
              )}

              <PasswordInput
                id="login-password"
                label="Password"
                placeholder="Enter your password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                icon={
                  <Lock
                    className={cn(
                      "h-[18px] w-[18px] transition-all duration-200",
                      form.password.length >= PASSWORD_MIN
                        ? "text-[#4ADE80] drop-shadow-[0_0_8px_rgba(74,222,128,0.85)]"
                        : ""
                    )}
                    style={form.password.length >= PASSWORD_MIN ? undefined : { color: INK_3 }}
                    strokeWidth={1.75}
                  />
                }
                value={form.password}
                onChange={set("password")}
                onKeyDown={trackCapsLock}
                onKeyUp={trackCapsLock}
                error={fieldErrors.password}
                capsLock={capsLock}
              >
                {mode === "register" && form.password.length > 0 && (
                  <StrengthMeter score={strength.score} />
                )}
              </PasswordInput>

              {mode === "register" && (
                <PasswordInput
                  id="login-confirm"
                  label="Confirm password"
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  icon={
                    <Lock
                      className={cn(
                        "h-[18px] w-[18px] transition-all duration-200",
                        form.confirm.length >= PASSWORD_MIN && form.password === form.confirm
                          ? "text-[#4ADE80] drop-shadow-[0_0_8px_rgba(74,222,128,0.85)]"
                          : ""
                      )}
                      style={
                        form.confirm.length >= PASSWORD_MIN && form.password === form.confirm
                          ? undefined
                          : { color: INK_3 }
                      }
                      strokeWidth={1.75}
                    />
                  }
                  value={form.confirm}
                  onChange={set("confirm")}
                  onBlur={() => setConfirmTouched(true)}
                  error={confirmError}
                />
              )}

              {isLogin && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {/* Custom checkbox with emerald checkmark */}
                  <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium transition-colors hover:text-white select-none" style={{ color: INK_2 }}>
                    <span className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                        className="peer sr-only"
                      />
                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border border-white/20 bg-white/[0.04] transition-all peer-checked:border-emerald-500 peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[#09110d] shadow-inner">
                        <Check
                          className={cn(
                            "h-3 w-3 stroke-[2.75] text-[#05231A] transition-transform duration-150",
                            rememberDevice ? "scale-100 opacity-100" : "scale-0 opacity-0"
                          )}
                        />
                      </span>
                    </span>
                    <span>Remember this device</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="cursor-pointer shrink-0 text-[12.5px] font-medium text-[#4ADE80] transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Primary action */}
              <motion.button
                type="submit"
                disabled={busy || succeeded}
                whileHover={succeeded || busy ? undefined : { scale: 1.01 }}
                whileTap={succeeded || busy ? undefined : { scale: 0.99 }}
                aria-label={isLogin ? "Unlock Batua" : "Create Batua"}
                className={cn(
                  "auth-sheen group relative mt-1 flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-full",
                  "text-[15px] font-bold tracking-tight transition-all duration-200 cursor-pointer",
                  "bg-gradient-to-r from-[#34D399] via-[#10B981] to-[#059669] text-[#05231A]",
                  "shadow-[0_0_24px_rgba(74,222,128,0.4),0_2px_8px_rgba(16,185,129,0.3)]",
                  "hover:brightness-105 hover:shadow-[0_0_34px_rgba(74,222,128,0.6)] active:translate-y-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09110d]",
                  "disabled:pointer-events-none disabled:opacity-60"
                )}
              >
                {busy ? (
                  <span className="flex items-center gap-2 text-[14px] font-bold">
                    <span className="auth-spinner border-slate-950 border-r-transparent" aria-hidden="true" />
                    <span>{isLogin ? "Unlocking vault…" : "Creating vault…"}</span>
                  </span>
                ) : succeeded ? (
                  <motion.span
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="flex items-center gap-2 text-[14px] font-bold"
                  >
                    <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" />
                    <span>Vault unlocked</span>
                  </motion.span>
                ) : (
                  <>
                    <LogIn className="h-[19px] w-[19px]" strokeWidth={2.2} aria-hidden="true" />
                    <span>{isLogin ? "Unlock Batua" : "Create Batua"}</span>
                  </>
                )}
              </motion.button>
            </motion.form>

            {isLogin && (
              <>
                {/* "or" rule */}
                <div className="my-4 flex items-center gap-3">
                  <span aria-hidden="true" className="h-px flex-1 bg-white/[0.10]" />
                  <span className="text-[12px] font-medium" style={{ color: INK_3 }}>
                    or
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-white/[0.10]" />
                </div>

                {/* Secondary path — platform authenticator */}
                <button
                  type="button"
                  onClick={() =>
                    setDeviceNotice(
                      "Device unlock isn't set up yet — sign in with your password to continue."
                    )
                  }
                  className={cn(
                    "flex h-14 w-full items-center justify-center gap-2.5 rounded-full",
                    "border border-white/[0.14] bg-white/[0.02] text-[15px] font-semibold text-white",
                    "transition-all duration-200 cursor-pointer hover:border-white/25 hover:bg-white/[0.05]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09110d]"
                  )}
                >
                  <Fingerprint className="h-[19px] w-[19px]" strokeWidth={1.9} style={{ color: MINT }} aria-hidden="true" />
                  Use Device Unlock
                </button>

                {deviceNotice && (
                  <p role="status" className="mt-2.5 text-center text-[12px] leading-snug text-[#E8B04B]">
                    {deviceNotice}
                  </p>
                )}
              </>
            )}

            {/* Vault switch */}
            <div className="mt-5 flex items-center justify-center gap-1.5 text-[12.5px]">
              <Shield className="h-4 w-4 shrink-0" strokeWidth={1.9} style={{ color: MINT }} aria-hidden="true" />
              <span style={{ color: INK_3 }}>
                {isLogin ? "Don't have a vault?" : "Already have a vault?"}
              </span>
              <button
                type="button"
                onClick={switchMode}
                aria-label={isLogin ? "Create local account" : "Sign in"}
                className="cursor-pointer font-semibold text-[#4ADE80] transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded underline-offset-2 hover:underline"
              >
                {isLogin ? "Create local account" : "Sign in"}
              </button>
            </div>

            {/* Popup celebration on succeeding */}
            <AnimatePresence>
              {succeeded && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="absolute inset-0 z-50 flex items-center justify-center rounded-[32px] bg-[#070e0b]/92 p-6 backdrop-blur-md"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 350, damping: 20, delay: 0.05 }}
                    className="flex flex-col items-center text-center p-6 rounded-2xl border border-emerald-500/30 bg-[#0d1a14] shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_35px_rgba(16,185,129,0.25)]"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                      <Check className="h-7 w-7 stroke-[2.5]" />
                    </div>
                    <h3 className="font-display mt-3.5 text-lg font-bold tracking-wide text-white">
                      Vault unlocked
                    </h3>
                    <p className="mt-1 text-xs text-slate-300">
                      Redirecting to your dashboard…
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <ForgotPasswordDialog
            open={forgotOpen}
            defaultUsername={form.username}
            onClose={() => setForgotOpen(false)}
            onSuccess={(uname) => {
              setForm((f) => ({ ...f, username: uname, password: "" }));
              setBanner({ kind: "warning", text: "Password reset successfully. Sign in with your new password." });
            }}
          />
        </motion.div>
      </main>
    </div>
  );
}
