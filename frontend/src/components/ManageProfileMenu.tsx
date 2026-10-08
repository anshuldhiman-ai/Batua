import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  History,
  KeyRound,
  LogOut,
  UserRound,
  UserCircle2,
} from "lucide-react";

import { useAuth } from "@/components/Auth";
import { cn } from "@/lib/utils";

/**
 * "Manage profile" — the account menu in the top-right corner.
 *
 * Everything about the signed-in account lives here: the sign-in
 * log, password changes, and the username. It is a button + panel
 * rather than a route so it is reachable from any page without
 * leaving the one you are on.
 */

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

/** Relative-ish formatting: "today 14:32", "yesterday 09:10", else the date. */
function formatLoginTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(now)) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day(d) === day(yesterday)) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }) + `, ${time}`;
}

export default function ManageProfileMenu({
  className,
  onSignOut,
}: {
  className?: string;
  /** Sign-out handled by the parent so the nav can stay in sync. */
  onSignOut?: () => void;
}) {
  const { user, logout, changePassword, changeUsername, loginHistory } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "password" | "username" | "history">(
    "overview"
  );
  const reduce = useReducedMotion();

  // Change-password form
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState(false);

  // Change-username form
  const [newUsername, setNewUsername] = useState("");
  const [unPassword, setUnPassword] = useState("");
  const [unError, setUnError] = useState<string | null>(null);
  const [unSaving, setUnSaving] = useState(false);
  const [unDone, setUnDone] = useState(false);

  // Login history
  const [history, setHistory] = useState<string[] | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click / Escape, and return focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => triggerRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // Fresh history each time the panel opens.
  useEffect(() => {
    if (!open || tab !== "history") return;
    let cancelled = false;
    setHistory(null);
    setHistoryError(false);
    (async () => {
      try {
        const rows = await loginHistory();
        if (cancelled) return;
        setHistory(rows);
      } catch {
        if (cancelled) return;
        setHistoryError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, loginHistory]);

  const close = () => {
    setOpen(false);
    setPwError(null);
    setUnError(null);
    setPwDone(false);
    setUnDone(false);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSaving(true);
    setPwError(null);
    setPwDone(false);
    try {
      await changePassword(pwCurrent, pwNew);
      // The server invalidates the session on a password change,
      // so this signs the user out (the gate then shows login).
      await logout();
      onSignOut?.();
      return;
    } catch (err: any) {
      setPwError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not update the password"
      );
    } finally {
      setPwSaving(false);
    }
  };

  const submitUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) {
      setUnError("Enter a username first");
      return;
    }
    setUnSaving(true);
    setUnError(null);
    setUnDone(false);
    try {
      await changeUsername(unPassword, newUsername.trim());
      setUnDone(true);
      setNewUsername("");
      setUnPassword("");
    } catch (err: any) {
      setUnError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not change the username"
      );
    } finally {
      setUnSaving(false);
    }
  };

  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Manage profile"
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="manage-profile"
        title="Manage profile"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserCircle2 className="h-[20px] w-[20px]" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            role="menu"
            aria-label="Manage profile"
            data-testid="manage-profile-panel"
            className="absolute right-0 top-12 z-50 w-[320px] origin-top-right rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="mb-3 flex items-center gap-2.5 border-b border-border/50 pb-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user?.username ?? "Account"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email || "Local account"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close profile menu"
                className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4 rotate-180" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-accent/40 p-1">
              {(
                [
                  ["overview", "Overview", UserRound],
                  ["history", "Sign-in log", History],
                  ["password", "Password", KeyRound],
                  ["username", "Username", UserRound],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  data-testid={`profile-tab-${key}`}
                  aria-selected={tab === key}
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
                    tab === key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            {tab === "overview" && (
              <div className="space-y-2 text-sm">
                <div className="rounded-xl bg-accent/30 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Account type
                  </p>
                  <p className="mt-0.5 text-sm">Local single-user account</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Change your password, rename your username, or review the
                  sign-in log from the tabs above.
                </p>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}

            {tab === "history" && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  Sign-in history
                </h3>
                {history === null && !historyError && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Loading…
                  </p>
                )}
                {historyError && (
                  <p className="py-4 text-center text-xs text-destructive">
                    Could not load the sign-in log.
                  </p>
                )}
                {history !== null && history.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No sign-ins recorded yet.
                  </p>
                )}
                {history && history.length > 0 && (
                  <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {history.map((at, i) => (
                      <li
                        key={at + i}
                        data-testid="login-history-item"
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/30"
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            i === 0 ? "bg-emerald-500" : "bg-border"
                          )}
                        />
                        <span className="truncate">{formatLoginTime(at)}</span>
                        {i === 0 && (
                          <span className="ml-auto shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            latest
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "password" && (
              <form onSubmit={submitPassword} className="space-y-3">
                <Field
                  id="profile-current-password"
                  label="Current password"
                  type="password"
                  value={pwCurrent}
                  onChange={setPwCurrent}
                  autoComplete="current-password"
                />
                <Field
                  id="profile-new-password"
                  label="New password"
                  type="password"
                  value={pwNew}
                  onChange={setPwNew}
                  placeholder="At least 4 characters"
                  autoComplete="new-password"
                />
                {pwError && (
                  <p role="alert" className="text-xs text-destructive">
                    {pwError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={pwSaving || !pwCurrent || !pwNew}
                  className="h-9 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pwSaving ? "Updating…" : "Update password"}
                </button>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  You will be signed out on every device after the change.
                </p>
              </form>
            )}

            {tab === "username" && (
              <form onSubmit={submitUsername} className="space-y-3">
                <Field
                  id="profile-new-username"
                  label="New username"
                  value={newUsername}
                  onChange={setNewUsername}
                  placeholder={user?.username || "username"}
                  autoComplete="username"
                />
                <Field
                  id="profile-username-password"
                  label="Password (to confirm)"
                  type="password"
                  value={unPassword}
                  onChange={setUnPassword}
                  autoComplete="current-password"
                />
                {unError && (
                  <p role="alert" className="text-xs text-destructive">
                    {unError}
                  </p>
                )}
                {unDone && !unError && (
                  <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
                    Username updated.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={unSaving || !newUsername || !unPassword}
                  className="h-9 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {unSaving ? "Saving…" : "Save username"}
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
