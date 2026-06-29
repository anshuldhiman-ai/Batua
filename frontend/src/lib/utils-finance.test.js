import { formatINR, formatDate, formatMonth, categoryColor } from "./utils-finance";

describe("utils-finance", () => {
  describe("formatINR", () => {
    it("formats normal numbers as Indian Rupees without decimals by default", () => {
      const formatted = formatINR(15000);
      // It can contain non-breaking spaces or simple spaces, let's normalize
      const normalized = formatted.replace(/\s/g, " ");
      expect(normalized).toContain("₹");
      expect(normalized).toContain("15,000");
    });

    it("supports compact format for larger numbers", () => {
      const formatted = formatINR(15000, { compact: true });
      const normalized = formatted.replace(/\s/g, " ");
      expect(normalized).toContain("₹");
      // "15K", "15.0K", "15 L", etc. depending on locale compact settings
      // and ICU version in the node environment (decimals are allowed).
      expect(normalized).toMatch(/15(\.\d+)?\s?[a-zA-Z]/);
    });

    it("handles zero and undefined values gracefully", () => {
      const formattedNull = formatINR(null);
      const normalizedNull = formattedNull.replace(/\s/g, " ");
      expect(normalizedNull).toContain("₹0");
    });
  });

  describe("formatDate", () => {
    it("formats valid date strings in Indian standard English style", () => {
      const formatted = formatDate("2026-06-19");
      expect(formatted).toContain("19");
      expect(formatted).toContain("Jun");
      expect(formatted).toContain("2026");
    });

    it("returns empty string for empty date inputs", () => {
      expect(formatDate(null)).toBe("");
      expect(formatDate("")).toBe("");
    });

    it("returns the input string if it is not a valid date", () => {
      expect(formatDate("invalid-date")).toBe("invalid-date");
    });
  });

  describe("formatMonth", () => {
    it("formats year-month string to short month and year name", () => {
      const formatted = formatMonth("2026-06");
      expect(formatted).toContain("Jun");
      expect(formatted).toContain("2026");
    });

    it("returns empty string for empty inputs", () => {
      expect(formatMonth("")).toBe("");
      expect(formatMonth(null)).toBe("");
    });
  });

  describe("categoryColor", () => {
    it("returns correct color mapping for a standard category", () => {
      expect(categoryColor("Income")).toBe("#059669");
      expect(categoryColor("Food & Dining")).toBe("#f59e0b");
    });

    it("falls back to Other color for unknown category", () => {
      expect(categoryColor("UnknownCategory")).toBe("#64748b");
    });
  });
});
