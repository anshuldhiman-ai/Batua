import {
  formatINR, formatDate, formatMonth, categoryColor,
  monthRange, monthsInYear, addMonths, currentYearMonth,
  formatMonthLabel, upcomingMonths, buildSpendingWeeks, CATEGORY_COLORS,
} from "./utils-finance";

describe("utils-finance", () => {
  describe("CATEGORY_COLORS", () => {
    it("has a fixed color map with common categories", () => {
      expect(CATEGORY_COLORS.Income).toBe("#059669");
      expect(CATEGORY_COLORS["Food & Dining"]).toBe("#f59e0b");
      expect(CATEGORY_COLORS.Other).toBe("#64748b");
    });
  });

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
    it("formats valid date strings as DD/MM/YYYY", () => {
      expect(formatDate("2026-06-19")).toBe("19/06/2026");
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

  describe("monthRange", () => {
    it("returns all months between start and end inclusive", () => {
      expect(monthRange("2026-01", "2026-03")).toEqual([
        "2026-01", "2026-02", "2026-03",
      ]);
    });

    it("handles year boundaries", () => {
      expect(monthRange("2025-11", "2026-02")).toEqual([
        "2025-11", "2025-12", "2026-01", "2026-02",
      ]);
    });

    it("returns a single month when start equals end", () => {
      expect(monthRange("2026-06", "2026-06")).toEqual(["2026-06"]);
    });

    it("returns empty array for invalid inputs", () => {
      expect(monthRange("", null)).toEqual([]);
      expect(monthRange(null, undefined)).toEqual([]);
    });
  });

  describe("monthsInYear", () => {
    it("returns 12 months for a given year", () => {
      const result = monthsInYear(2026);
      expect(result).toHaveLength(12);
      expect(result[0]).toBe("2026-01");
      expect(result[11]).toBe("2026-12");
    });
  });

  describe("addMonths", () => {
    it("adds positive months crossing year boundary", () => {
      expect(addMonths("2025-11", 3)).toBe("2026-02");
    });

    it("subtracts months", () => {
      expect(addMonths("2026-01", -2)).toBe("2025-11");
    });

    it("returns same month for delta 0", () => {
      expect(addMonths("2026-06", 0)).toBe("2026-06");
    });
  });

  describe("currentYearMonth", () => {
    it("returns a string in YYYY-MM format", () => {
      const result = currentYearMonth();
      expect(result).toMatch(/^\d{4}-\d{2}$/);
    });

    it("reflects the current actual year and month", () => {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      expect(currentYearMonth()).toBe(expected);
    });
  });

  describe("formatMonthLabel", () => {
    it("returns 'This month' for the current month", () => {
      const ym = currentYearMonth();
      expect(formatMonthLabel(ym)).toContain("This month");
    });

    it("returns 'Last month' for one month ago", () => {
      const last = addMonths(currentYearMonth(), -1);
      expect(formatMonthLabel(last)).toContain("Last month");
    });

    it("returns 'Next month' for one month ahead", () => {
      const next = addMonths(currentYearMonth(), 1);
      expect(formatMonthLabel(next)).toContain("Next month");
    });

    it("returns plain formatted month for distant months", () => {
      const result = formatMonthLabel("2026-12", "2026-06");
      expect(result).toContain("Dec");
    });

    it("returns empty string for null input", () => {
      expect(formatMonthLabel(null)).toBe("");
    });
  });

  describe("upcomingMonths", () => {
    it("returns default 12 months starting from base month inclusive", () => {
      const result = upcomingMonths(12, "2026-01");
      expect(result).toHaveLength(12);
      expect(result[0]).toBe("2026-01");
      expect(result[11]).toBe("2026-12");
    });

    it("returns fewer months when count is smaller", () => {
      const result = upcomingMonths(3, "2026-01");
      expect(result).toEqual(["2026-01", "2026-02", "2026-03"]);
    });
  });

  describe("buildSpendingWeeks", () => {
    it("returns weeks structure with month labels", () => {
      const amountByDate = new Map([
        ["2026-06-01", 500],
        ["2026-06-15", 300],
      ]);
      const result = buildSpendingWeeks("2026-06", 1, amountByDate);
      expect(result.weeks.length).toBeGreaterThan(0);
      expect(result.monthLabels.length).toBe(result.weeks.length);
      expect(result.rangeLabel).toContain("Jun");
    });

    it("marks in-window cells correctly", () => {
      const amountByDate = new Map();
      const result = buildSpendingWeeks("2026-06", 1, amountByDate);
      const allCells = result.weeks.flat();
      const inWindow = allCells.filter((c) => c.inWindow);
      const outWindow = allCells.filter((c) => !c.inWindow);
      expect(inWindow.length).toBeGreaterThan(0);
      expect(outWindow.length).toBeGreaterThan(0); // padding days
    });

    it("reflects actual amounts in cells", () => {
      const amountByDate = new Map([["2026-06-15", 999]]);
      const result = buildSpendingWeeks("2026-06", 1, amountByDate);
      const allCells = result.weeks.flat();
      const jun15 = allCells.find((c) => c.date === "2026-06-15");
      expect(jun15.amount).toBe(999);
    });
  });
});
