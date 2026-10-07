import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import LoginPage from "./LoginPage";
import { AuthProvider } from "./Auth";

// Mock the api client so no network is touched.
vi.mock("@/lib/utils-finance", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  apiUrl: vi.fn((p) => p),
  formatINR: vi.fn(() => "₹0"),
  formatDate: vi.fn(() => ""),
}));

// Toast is visual chrome — silence it.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { api } from "@/lib/utils-finance";
import { toast } from "sonner";

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );

const fill = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
};

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    // Boot probe: the account exists, no saved session.
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { username: "u", email: "e@x.com" },
    });
  });

  it("shows the sign-in form by default", () => {
    renderPage();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
    // Email only appears in register mode
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("switches to register mode and adds the email field", () => {
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: /first time here/i })
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument();
  });

  it("toggles password visibility", () => {
    renderPage();
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(input.type).toBe("password");
  });

  it("rejects short usernames and passwords client-side", async () => {
    renderPage();
    fill("Username", "ab");
    fill("Password", "123");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(api.post).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("calls the login endpoint and navigates on success", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { username: "u", email: "e@x.com" }, token: "tk" },
    });
    renderPage();
    fill("Username", "anshuldhiman-ai");
    fill("Password", "1947");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/login", {
        username: "anshuldhiman-ai",
        password: "1947",
      });
    });
    expect(window.sessionStorage.getItem("batua-session-token")).toBe("tk");
  });

  it("registers then logs in", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { username: "u", email: "e@x.com" } },
    });
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: /first time here/i })
    );
    fill("Username", "anshuldhiman-ai");
    fill("Email", "anshuldhimanbadmosh2007@gmail.com");
    fill("Password", "1947");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/register", {
        username: "anshuldhiman-ai",
        email: "anshuldhimanbadmosh2007@gmail.com",
        password: "1947",
      });
    });
    // Followed by the login call to establish a session
    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      username: "anshuldhiman-ai",
      password: "1947",
    });
  });
});
