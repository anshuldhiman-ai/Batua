import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import fs from "node:fs";
import path from "node:path";
import Logo from "./Logo";

/**
 * Regression guard for the splash-screen logo animation.
 *
 * Root cause it protects against: CSS `transform` REPLACES an element's SVG
 * `transform` *attribute*. Animating a group that already carries an attribute
 * transform silently throws that part out of the mark. The fix is the
 * STRUCTURE CONTRACT in BatuaLogoReveal.css: every `[data-part]` node that CSS
 * animates must be a transform-free wrapper in root viewBox space, with any
 * attribute-transformed geometry nested inside it.
 */

const PARTS = ["frame", "clasp", "rupee", "arrow"] as const;

function renderLogo(): SVGSVGElement {
  const { container } = render(<Logo className="mark-glyph" />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("Logo did not render an <svg>");
  return svg as SVGSVGElement;
}

describe("Logo — splash animation structure contract", () => {
  it("renders every data-part the CSS choreography targets", () => {
    const svg = renderLogo();
    for (const part of PARTS) {
      expect(
        svg.querySelectorAll(`[data-part="${part}"]`).length,
        `missing data-part="${part}"`,
      ).toBeGreaterThan(0);
    }
  });

  it("has exactly three coin clasps and one rupee", () => {
    const svg = renderLogo();
    expect(svg.querySelectorAll('[data-part="clasp"]')).toHaveLength(3);
    expect(svg.querySelectorAll('[data-part="rupee"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-part="frame"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-part="arrow"]')).toHaveLength(1);
  });

  // The core invariant. If a CSS transform lands on a node that has a
  // transform attribute, the attribute is discarded and the part detaches.
  it("keeps every animated [data-part] node free of an SVG transform attribute", () => {
    const svg = renderLogo();
    const animated = Array.from(svg.querySelectorAll("[data-part]"));

    expect(animated.length).toBeGreaterThan(0);

    for (const node of animated) {
      const part = node.getAttribute("data-part");
      const transform = node.getAttribute("transform");
      expect(
        transform,
        `[data-part="${part}"] carries transform="${transform}" — CSS animation ` +
          `would REPLACE it and throw the part out of the mark. Nest the ` +
          `transformed geometry inside a transform-free wrapper instead.`,
      ).toBeNull();
      // A CSS transform on a node is only safe when it's inline-authored
      // nowhere; assert no inline style sneaks one in either.
      expect(node.getAttribute("style")).toBeNull();
    }
  });

  // The parts whose geometry is defined in a translated/scaled space must keep
  // that attribute transform on a DESCENDANT of the animated wrapper.
  it("nests the frame's attribute transform inside the wrapper, not on it", () => {
    const svg = renderLogo();
    const wrapper = svg.querySelector('[data-part="frame"]')!;
    const inner = wrapper.querySelector("[transform]");
    expect(
      inner,
      "frame wrapper lost its inner transform group — geometry would render at raw path coordinates",
    ).not.toBeNull();
    expect(inner!.getAttribute("transform")).toContain("scale");
  });

  it("nests the arrow's attribute transforms inside the wrapper, not on it", () => {
    const svg = renderLogo();
    const wrapper = svg.querySelector('[data-part="arrow"]')!;

    // The arrow geometry sits behind two nested transforms.
    const withTransform = Array.from(wrapper.querySelectorAll("[transform]"));
    expect(withTransform.length).toBeGreaterThanOrEqual(2);

    // Outermost transform positions it in root space; inner one flips the
    // glyph's y-axis (negative scale).
    expect(withTransform[0].getAttribute("transform")).toContain("translate");
    expect(
      withTransform.some((n) =>
        /scale\([^)]*-\d/.test(n.getAttribute("transform") ?? ""),
      ),
      "arrow lost its negative-y-scale group — the arrow would point the wrong way",
    ).toBe(true);
  });

  it("keeps the coin-hole mask on the animated frame wrapper so holes track the frame", () => {
    const svg = renderLogo();
    const wrapper = svg.querySelector('[data-part="frame"]')!;
    expect(wrapper.getAttribute("mask")).toBe("url(#batua-logo-holes)");

    const mask = svg.querySelector("mask#batua-logo-holes");
    expect(mask).not.toBeNull();
    // Four coin holes + the note slot.
    expect(mask!.querySelectorAll("circle")).toHaveLength(4);
    expect(mask!.querySelectorAll("rect")).toHaveLength(2); // white backdrop + slot
  });
});

describe("BatuaLogoReveal.css — animation contract", () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, "BatuaLogoReveal.css"),
    "utf8",
  );

  // Strip comments so a documented selector can't satisfy an assertion.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("gives every animated part the shared fill-box contract", () => {
    expect(code).toMatch(
      /\.mark-glyph \[data-part\]\s*\{[^}]*transform-box:\s*fill-box/,
    );
    expect(code).toMatch(
      /\.mark-glyph \[data-part\]\s*\{[^}]*transform-origin:\s*center/,
    );
  });

  it("animates each part exactly once", () => {
    for (const part of PARTS) {
      const rules = code.match(
        new RegExp(`\\[data-part="${part}"\\](?::nth-of-type\\(\\d\\))?\\s*\\{`, "g"),
      );
      expect(rules?.length ?? 0, `no animation rule for "${part}"`).toBeGreaterThan(0);
    }
  });

  it("stagger the coin drops in ascending delay order", () => {
    const delays = [1, 2, 3].map((n) => {
      const m = code.match(
        new RegExp(
          `\\[data-part="clasp"\\]:nth-of-type\\(${n}\\)\\s*\\{[^}]*?animation:\\s*coinDrop[^;]*?(\\d+(?:\\.\\d+)?)s\\s+both`,
        ),
      );
      expect(m, `clasp #${n} not wired to coinDrop`).not.toBeNull();
      return parseFloat(m![1]);
    });
    expect(delays[0]).toBeLessThan(delays[1]);
    expect(delays[1]).toBeLessThan(delays[2]);
  });

  it("only animates wrapper nodes — never a node carrying an attribute transform", () => {
    // Every selector that assigns a `transform`-bearing animation must target
    // [data-part] wrappers (or the .batua-mark shell), never `g[transform]`.
    const animated = code.match(/[^{}]*\{\s*animation:[^}]*\}/g) ?? [];
    for (const rule of animated) {
      const selector = rule.slice(0, rule.indexOf("{")).trim();
      expect(
        /g\[transform\]|\[transform\]/.test(selector),
        `rule "${selector}" animates an attribute-transformed node`,
      ).toBe(false);
    }
  });

  it("disables the choreography for reduced motion and quick mode", () => {
    expect(code).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*?\.mark-glyph \[data-part\][\s\S]*?animation:\s*none/,
    );
    expect(code).toMatch(/\.batua-stage\.is-quick[\s\S]*?animation:\s*none/);
  });
});
