// Type declarations for the untyped `themes.js` module (kept as JS because it
// is also imported by plain-JS tests). Runtime file is unchanged.

/** One palette side (light or dark) — values are bare HSL triplets for CSS vars. */
export interface AccentPalette {
  primary: string;
  primaryForeground: string;
  ring: string;
  accent: string;
  accentForeground: string;
}

export interface AccentTheme {
  id: string;
  label: string;
  /** Light-mode primary, used for the picker dot. */
  swatch: string;
  light: AccentPalette;
  dark: AccentPalette;
}

export type ThemeMode = "light" | "dark";

export const ACCENTS: AccentTheme[];
export const DEFAULT_ACCENT: string;
export const CUSTOM_ACCENT: string;
export const DEFAULT_CUSTOM_COLOR: string;

export function getAccent(accentId: string): AccentTheme;

/** h in [0,360], s/l in [0,100]. */
export function hexToHsl(hex: string): { h: number; s: number; l: number };

export function deriveAccent(hex: string): {
  light: AccentPalette;
  dark: AccentPalette;
};

/**
 * Apply an accent's CSS variables to the document root for the given mode.
 * @param accentId - id from ACCENTS, or CUSTOM_ACCENT
 * @param mode - current theme mode
 * @param customColor - hex color used when accentId is CUSTOM_ACCENT
 */
export function applyAccent(
  accentId: string,
  mode: ThemeMode,
  customColor?: string
): void;
