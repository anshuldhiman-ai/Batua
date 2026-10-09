import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api } from "@/lib/utils-finance";

/**
 * Auth session for Batua's single local account.
 *
 * The session token lives in sessionStorage (not localStorage) so it
 * disappears when the browser closes — this is a personal finance app
 * on a personal machine, and an unlocked tab shouldn't outlive the
 * window. On mount, `boot` probes the server: a 200 from /auth/me
 * means the account exists, a 404 means first run (no account yet →
 * the register screen).
 */

interface AuthUser {
  username: string;
  email: string;
}

interface AuthContextValue {
  /** True until the initial boot probe resolves. */
  loading: boolean;
  /** True once the server reports an account (after first register). */
  hasAccount: boolean;
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Rename the account (requires the current password). */
  changeUsername: (password: string, username: string) => Promise<AuthUser>;
  /** Recent sign-in timestamps, newest first. */
  loginHistory: () => Promise<string[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "batua-session-token";
const USER_KEY = "batua-session-user";

function readSavedUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [hasAccount, setHasAccount] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(readSavedUser);
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem(TOKEN_KEY)
  );

  // Boot probe: does this install have an account yet, and is a
  // saved session still worth keeping? A saved token is only
  // trusted when /auth/me answers (the API itself is the source of
  // truth; if the token was revoked server-side the next request
  // will fail and the user simply logs in again).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get("/auth/me");
        if (cancelled) return;
        setHasAccount(true);
        if (sessionStorage.getItem(TOKEN_KEY)) {
          setUser({ username: me.data.username, email: me.data.email ?? "" });
        } else {
          setUser(null);
          setToken(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) {
          // No account on this server — first run, go to register.
          setHasAccount(false);
        }
        // Any other failure (backend offline): assume an account
        // exists so the user sees the login form, whose error
        // toast will surface the real problem.
        setUser(null);
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((tk: string | null, u: AuthUser | null) => {
    if (tk) sessionStorage.setItem(TOKEN_KEY, tk);
    else sessionStorage.removeItem(TOKEN_KEY);
    if (u) sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    else sessionStorage.removeItem(USER_KEY);
    setToken(tk);
    setUser(u);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.post("/auth/login", { username, password });
      const { user: u, token: tk } = res.data;
      persist(tk ?? null, u);
    },
    [persist]
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const res = await api.post("/auth/register", { username, email, password });
      setHasAccount(true);
      return res.data;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      persist(null, null);
    }
  }, [persist]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      return res.data;
    },
    []
  );

  const changeUsername = useCallback(
    async (password: string, username: string) => {
      const res = await api.post("/auth/change-username", {
        username,
        password,
      });
      const { user: u } = res.data;
      // Keep the cached user in sync so the avatar/menus update at once.
      persist(token, u);
      return u as AuthUser;
    },
    [persist, token]
  );

  const loginHistory = useCallback(async () => {
    const res = await api.get("/auth/login-history");
    const rows = res.data?.history ?? [];
    // Entries are stored as {"at": iso} objects; older shapes
    // (or a test double) may return plain strings — accept both.
    return rows.map((r: any) =>
      typeof r === "string" ? r : r?.at
    ) as string[];
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        hasAccount,
        user,
        token,
        login,
        register,
        logout,
        changePassword,
        changeUsername,
        loginHistory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
