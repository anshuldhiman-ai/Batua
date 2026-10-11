import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api, apiUrl } from "@/lib/utils-finance";

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

/** The open session's sign-in epoch-ms, kept in sessionStorage
 *  so a reload mid-session still reports an honest duration. */
const SESSION_START_KEY = "batua-session-start";

function readSavedUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** POST with keepalive — this rides beforeunload, where
 *  nothing may be awaited. `apiUrl` gives the same
 *  baseURL axios uses, so the beacon hits the same server. */
function fireAndForget(url: string, body: unknown) {
  try {
    void fetch(`${apiUrl("")}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* offline — the session simply stays open server-side */
  }
}

/** Close the open session entry. Called on sign-out and on
 *  tab/browser close. Durations under 1s are ignored (the
 *  beacon fires on quick bounces) and a missing start time
 *  means no session to close. */
function closeSession(reason: "logout" | "close") {
  const started = Number(sessionStorage.getItem(SESSION_START_KEY) || 0);
  if (!started) return;
  const duration = Math.round((Date.now() - started) / 1000);
  sessionStorage.removeItem(SESSION_START_KEY);
  if (duration < 1) return;
  fireAndForget("/auth/session/close", { duration_seconds: duration, reason });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [hasAccount, setHasAccount] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(readSavedUser);
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem(TOKEN_KEY)
  );

  // A session was restored (reload) — re-open the log entry so
  // the sign-in time reflects this visit, then keep the start
  // clock running. Without this, a reload would attribute the
  // whole visit to the pre-reload entry's (never-closed) row.
  useEffect(() => {
    if (!token) return undefined;
    fireAndForget("/auth/session/open", {});
    sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
    return undefined;
  }, [token]);

  // Exit beacon: tab close / browser close / navigation away.
  // `sendBeacon`-style keepalive fetch survives the unload;
  // pagehide is the modern event (bfcache-safe).
  useEffect(() => {
    const onHide = () => closeSession("close");
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      // Mobile: the OS may kill the tab without a pagehide.
      if (document.visibilityState === "hidden") closeSession("close");
    });
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

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
      // persist() flips the token, which fires the
      // session-log effect below (the single place a
      // session is opened — keeps reloads and fresh
      // logins on one path, no duplicate open rows).
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
    // Close the session log entry (duration + exit time)
    // before clearing the token, so the visit is recorded.
    closeSession("logout");
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
