// Accent color themes. Each accent overrides the primary/ring/accent CSS
// variables (see index.css) and provides tuned values for both light and
// dark mode. The `swatch` is the light-mode primary, used for the picker dot.

export const ACCENTS = [
  {
    id: "emerald",
    label: "Emerald",
    swatch: "162 94% 24%",
    light: {
      primary: "162 94% 24%",
      primaryForeground: "0 0% 100%",
      ring: "162 94% 30%",
      accent: "152 60% 94%",
      accentForeground: "162 94% 18%",
    },
    dark: {
      primary: "158 84% 39%",
      primaryForeground: "165 40% 6%",
      ring: "158 84% 45%",
      accent: "165 24% 16%",
      accentForeground: "158 84% 60%",
    },
  },
  {
    id: "blue",
    label: "Blue",
    swatch: "217 91% 45%",
    light: {
      primary: "217 91% 45%",
      primaryForeground: "0 0% 100%",
      ring: "217 91% 52%",
      accent: "214 95% 95%",
      accentForeground: "217 91% 35%",
    },
    dark: {
      primary: "213 94% 60%",
      primaryForeground: "222 47% 8%",
      ring: "213 94% 66%",
      accent: "217 33% 18%",
      accentForeground: "213 94% 72%",
    },
  },
  {
    id: "violet",
    label: "Violet",
    swatch: "262 83% 52%",
    light: {
      primary: "262 83% 52%",
      primaryForeground: "0 0% 100%",
      ring: "262 83% 58%",
      accent: "262 90% 96%",
      accentForeground: "262 83% 42%",
    },
    dark: {
      primary: "258 90% 66%",
      primaryForeground: "260 40% 8%",
      ring: "258 90% 72%",
      accent: "260 30% 20%",
      accentForeground: "258 90% 76%",
    },
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "347 77% 46%",
    light: {
      primary: "347 77% 46%",
      primaryForeground: "0 0% 100%",
      ring: "347 77% 52%",
      accent: "347 90% 96%",
      accentForeground: "347 77% 38%",
    },
    dark: {
      primary: "350 89% 60%",
      primaryForeground: "345 40% 8%",
      ring: "350 89% 66%",
      accent: "345 30% 20%",
      accentForeground: "350 89% 72%",
    },
  },
  {
    id: "amber",
    label: "Amber",
    swatch: "32 95% 44%",
    light: {
      primary: "32 95% 44%",
      primaryForeground: "0 0% 100%",
      ring: "32 95% 50%",
      accent: "40 96% 92%",
      accentForeground: "28 90% 36%",
    },
    dark: {
      primary: "38 92% 55%",
      primaryForeground: "40 60% 8%",
      ring: "38 92% 60%",
      accent: "36 30% 20%",
      accentForeground: "40 95% 65%",
    },
  },
  {
    id: "teal",
    label: "Teal",
    swatch: "185 84% 32%",
    light: {
      primary: "185 84% 32%",
      primaryForeground: "0 0% 100%",
      ring: "185 84% 38%",
      accent: "180 60% 94%",
      accentForeground: "185 84% 24%",
    },
    dark: {
      primary: "180 78% 45%",
      primaryForeground: "185 40% 6%",
      ring: "180 78% 51%",
      accent: "185 24% 16%",
      accentForeground: "180 78% 62%",
    },
  },
];

export const DEFAULT_ACCENT = "emerald";
export const CUSTOM_ACCENT = "custom";
export const DEFAULT_CUSTOM_COLOR = "#6366f1"; // indigo

export function getAccent(accentId) {
  return ACCENTS.find((a) => a.id === accentId) || ACCENTS[0];
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * Convert a #rrggbb (or #rgb) hex string to HSL components.
 * @returns {{ h: number, s: number, l: number }} h in [0,360], s/l in [0,100]
 */
export function hexToHsl(hex) {
  let c = String(hex || "").trim().replace(/^#/, "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return { h: 240, s: 70, l: 55 };
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Derive a full accent palette (light + dark variants) from any hex color.
 * Keeps the chosen hue/saturation and produces readable primary/ring/accent
 * values for both modes.
 */
export function deriveAccent(hex) {
  const { h, s } = hexToHsl(hex);
  const S = clamp(s, 35, 95); // avoid washed-out or fully grey accents

  // Light mode: darker, saturated primary readable on a light background.
  const lp = 42;
  const light = {
    primary: `${h} ${S}% ${lp}%`,
    primaryForeground: lp < 60 ? "0 0% 100%" : `${h} ${S}% 12%`,
    ring: `${h} ${S}% ${lp + 8}%`,
    accent: `${h} ${clamp(S, 30, 75)}% 95%`,
    accentForeground: `${h} ${S}% ${lp - 6}%`,
  };

  // Dark mode: brighter primary readable on a dark background.
  const dp = 58;
  const dark = {
    primary: `${h} ${S}% ${dp}%`,
    primaryForeground: `${h} 40% 8%`,
    ring: `${h} ${S}% ${dp + 8}%`,
    accent: `${h} 24% 18%`,
    accentForeground: `${h} ${S}% 72%`,
  };

  return { light, dark };
}

/**
 * Apply an accent's CSS variables to the document root for the given mode.
 * @param {string} accentId - id from ACCENTS, or CUSTOM_ACCENT
 * @param {"light"|"dark"} mode - current theme mode
 * @param {string} [customColor] - hex color used when accentId is CUSTOM_ACCENT
 */
export function applyAccent(accentId, mode, customColor) {
  if (typeof document === "undefined") return;
  const palette =
    accentId === CUSTOM_ACCENT
      ? deriveAccent(customColor || DEFAULT_CUSTOM_COLOR)
      : getAccent(accentId);
  const vars = palette[mode === "dark" ? "dark" : "light"];
  const root = document.documentElement;
  root.style.setProperty("--primary", vars.primary);
  root.style.setProperty("--primary-foreground", vars.primaryForeground);
  root.style.setProperty("--ring", vars.ring);
  root.style.setProperty("--accent", vars.accent);
  root.style.setProperty("--accent-foreground", vars.accentForeground);
}
