import { describe, it, expect } from "vitest";
import {
  ACCENTS,
  hexToHsl,
  deriveAccent,
  getAccent,
  applyAccent,
  DEFAULT_ACCENT,
  CUSTOM_ACCENT,
  DEFAULT_CUSTOM_COLOR,
} from "./themes";

describe("themes constants", () => {
  it("has 6 accent colors", () => {
    expect(ACCENTS).toHaveLength(6);
  });

  it("each accent has required keys", () => {
    for (const a of ACCENTS) {
      expect(a).toHaveProperty("id");
      expect(a).toHaveProperty("label");
      expect(a).toHaveProperty("swatch");
      expect(a).toHaveProperty("light.primary");
      expect(a).toHaveProperty("dark.primary");
    }
  });

  it("has a default accent", () => {
    expect(DEFAULT_ACCENT).toBe("emerald");
  });

  it("has a custom accent sentinel", () => {
    expect(CUSTOM_ACCENT).toBe("custom");
  });

  it("has a default custom color", () => {
    expect(DEFAULT_CUSTOM_COLOR).toBe("#6366f1");
  });
});

describe("getAccent", () => {
  it("returns the matching accent by id", () => {
    const a = getAccent("blue");
    expect(a.id).toBe("blue");
    expect(a.label).toBe("Blue");
  });

  it("returns the first accent for unknown ids (fallback)", () => {
    const a = getAccent("nonexistent");
    expect(a.id).toBe("emerald");
  });
});

describe("hexToHsl", () => {
  it("converts a 6-digit hex to HSL", () => {
    const result = hexToHsl("#059669");
    expect(result).toHaveProperty("h");
    expect(result).toHaveProperty("s");
    expect(result).toHaveProperty("l");
    expect(result.h).toBeGreaterThanOrEqual(0);
    expect(result.h).toBeLessThanOrEqual(360);
    expect(result.s).toBeGreaterThanOrEqual(0);
    expect(result.l).toBeGreaterThanOrEqual(0);
  });

  it("converts a 3-digit hex to HSL", () => {
    const result = hexToHsl("#0a0");
    // #00aa00 → green
    expect(result.h).toBe(120);
  });

  it("handles missing/empty hex with fallback", () => {
    const result = hexToHsl("");
    expect(result.h).toBe(240);
    expect(result.s).toBe(70);
    expect(result.l).toBe(55);
  });

  it("strips leading # if present", () => {
    const withHash = hexToHsl("#ff0000");
    const withoutHash = hexToHsl("ff0000");
    expect(withHash).toEqual(withoutHash);
  });
});

describe("deriveAccent", () => {
  it("produces light and dark palettes from a hex color", () => {
    const result = deriveAccent("#059669");
    expect(result).toHaveProperty("light");
    expect(result).toHaveProperty("dark");
    expect(result.light).toHaveProperty("primary");
    expect(result.light).toHaveProperty("primaryForeground");
    expect(result.light).toHaveProperty("ring");
    expect(result.light).toHaveProperty("accent");
    expect(result.light).toHaveProperty("accentForeground");
    expect(result.dark).toHaveProperty("primary");
    expect(result.dark).toHaveProperty("primaryForeground");
    expect(result.dark).toHaveProperty("ring");
    expect(result.dark).toHaveProperty("accent");
    expect(result.dark).toHaveProperty("accentForeground");
  });

  it("clamps saturation to avoid washed-out colors", () => {
    const result = deriveAccent("#888888"); // grey, very low saturation
    // saturation should be clamped to at least 35
    const s = parseInt(result.light.primary.split(" ")[1], 10);
    expect(s).toBeGreaterThanOrEqual(35);
  });
});

describe("applyAccent", () => {
  it("sets CSS variables on document root for a standard accent in light mode", () => {
    applyAccent("blue", "light");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--primary")).toBeTruthy();
    expect(root.style.getPropertyValue("--primary-foreground")).toBeTruthy();
  });

  it("sets CSS variables for custom accent color", () => {
    applyAccent(CUSTOM_ACCENT, "dark", "#ff6600");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--primary")).toBeTruthy();
    expect(root.style.getPropertyValue("--ring")).toBeTruthy();
  });

  it("does not crash when document is undefined", () => {
    // This tests the typeof document === "undefined" guard
    const doc = globalThis.document;
    /** @type {any} */ (globalThis).document = undefined;
    expect(() => applyAccent("emerald", "light")).not.toThrow();
    /** @type {any} */ (globalThis).document = doc;
  });

  it("applies correct number of CSS variables", () => {
    const root = document.documentElement;
    // Clear previous
    root.style.removeProperty("--primary");
    applyAccent("rose", "dark");
    expect(root.style.getPropertyValue("--primary")).toBeTruthy();
    expect(root.style.getPropertyValue("--primary-foreground")).toBeTruthy();
    expect(root.style.getPropertyValue("--ring")).toBeTruthy();
    expect(root.style.getPropertyValue("--accent")).toBeTruthy();
    expect(root.style.getPropertyValue("--accent-foreground")).toBeTruthy();
  });
});
