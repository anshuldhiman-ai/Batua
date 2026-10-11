import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import LoginPage from "./LoginPage";
import { AuthProvider } from "./Auth";

vi.mock("@/lib/utils-finance", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  apiUrl: vi.fn((p) => p),
  formatINR: vi.fn(() => "₹0"),
  formatDate: vi.fn(() => ""),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { api } from "@/lib/utils-finance";

/**
 * Smoke test: the page must mount and paint content, never
 * a blank screen. Guards against a render-time exception
 * (e.g. a bad style prop) taking the whole gate down.
 */
describe("LoginPage renders content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { username: "u", email: "e@x.com" },
    });
  });

  it("mounts the sign-in card, headline and trust row", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    // The page shell has painted something.
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).not.toBe("");

    // The headline, card and trust row are all present.
    expect(
      screen.getByRole("heading", { name: /sign in/i, level: 1 })
    ).toBeInTheDocument();
    // Both the brand footer and the card trust row carry it —
    // query all of them rather than a single instance.
    expect(
      screen.getAllByText(/your data never leaves this device/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it("shows the brand panel content (desktop hero)", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/kept on your device/i)).toBeInTheDocument();
    expect(screen.getByText(/encrypted locally/i)).toBeInTheDocument();
  });
});
