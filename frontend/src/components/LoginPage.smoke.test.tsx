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

    // The headline, card and vault-switch row are all present.
    expect(
      screen.getByRole("heading", { name: /^sign in$/i, level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /unlock batua/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create local account/i })
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
    expect(
      screen.getByRole("heading", { name: /take control of your money/i, level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByText(/keeps your data on your device/i)).toBeInTheDocument();
    // The three trust pillars under the headline.
    expect(screen.getByText(/100% offline/i)).toBeInTheDocument();
    expect(screen.getByText(/bank-grade security/i)).toBeInTheDocument();
  });
});
