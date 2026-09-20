import { describe, it, expect } from "vitest";
import { parseReceiptText, receiptFromApi } from "./parse-receipt";

describe("parseReceiptText", () => {
  it("pulls merchant, total, date, payment, and line items from a typical bill", () => {
    const parsed = parseReceiptText(`
      Bikanervala
      Karol Bagh
      Date: 12/03/2026
      Samosa        40.00
      Chai          20.00
      GST           5.40
      TOTAL         65.40
      Paid via UPI
    `);
    expect(parsed.description).toMatch(/bikanervala/i);
    expect(parsed.amount).toBeCloseTo(-65.4);
    expect(parsed.date).toBe("2026-03-12");
    expect(parsed.payment_method).toBe("UPI");
    expect(parsed.items.map((i) => i.name)).toEqual(expect.arrayContaining(["Samosa", "Chai"]));
  });

  it("maps a Gemini-style API payload onto the same shape", () => {
    const parsed = receiptFromApi({
      description: "Nature's Basket",
      amount: -890,
      date: "2026-09-20",
      category: "Groceries",
      payment_method: "Card",
      quantity: 1,
      price: 890,
      notes: "Milk, bread",
      items: [{ name: "Milk", amount: 60, quantity: 1 }],
    });
    expect(parsed.description).toBe("Nature's Basket");
    expect(parsed.amount).toBe(-890);
    expect(parsed.items).toHaveLength(1);
  });
});
