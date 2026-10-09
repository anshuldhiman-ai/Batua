import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronRight,
  History,
  KeyRound,
  LogOut,
  UserRound,
  UserCircle2,
  X,
} from "lucide-react";

import { useAuth } from "@/components/Auth";
import { cn } from "@/lib/utils";

/**
 * "Manage profile" — the account button in the top-right corner.
 *
 * Hovering the avatar shows the account basics (name + email);
 * clicking opens the profile manager in its own centered window
 * so the account can be managed properly — sign-in log,
 * password and username changes — instead of a cramped dropdown.
 *
 * The window is rendered through a portal to document.body so
 * its fixed positioning is never clipped by the navbar's
 * stacking context (which used to make it overlap/crash the bar).
 *
 * It is a button + window rather than a route so it is
 * reachable from any page without leaving the one you are on.
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

interface ProfileWindowProps {
  reduce: boolean;
  tab: "overview" | "password" | "username" | "history";
  setTab: (t: "overview" | "password" | "username" | "history") => void;
  initials: string;
  user: { username?: string; email?: string } | null;
  history: string[] | null;
  historyError: boolean;
  pwCurrent: string;
  pwNew: string;
  pwError: string | null;
  pwSaving: boolean;
  samePassword: boolean;
  newUsername: string;
  unPassword: string;
  unError: string | null;
  unSaving: boolean;
  unDone: boolean;
  setPwCurrent: (v: string) => void;
  setPwNew: (v: string) => void;
  setNewUsername: (v: string) => void;
  setUnPassword: (v: string) => void;
  submitPassword: (e: React.FormEvent) => void;
  submitUsername: (e: React.FormEvent) => void;
  close: () => void;
  logout: () => Promise<void>;
}

function ProfileWindow(p: ProfileWindowProps) {
  const {
    reduce,
    tab,
    setTab,
    initials,
    user,
    history,
    historyError,
    pwCurrent,
    pwNew,
    pwError,
    pwSaving,
    samePassword,
    newUsername,
    unPassword,
    unError,
    unSaving,
    unDone,
    setPwCurrent,
    setPwNew,
    setNewUsername,
    setUnPassword,
    submitPassword,
    submitUsername,
    close,
    logout,
  } = p;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="profile-backdrop"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? undefined : { opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      {/* The window */}
      <motion.div
        key="profile-window"
        role="dialog"
        aria-modal="true"
        aria-label="Manage profile"
        data-testid="manage-profile-panel"
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/60 bg-card/95 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-center gap-3 border-b border-border/50 pb-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">
              {user?.username ?? "Account"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email || "Local account"}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close profile manager"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-accent/40 p-1">
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
            <div className="rounded-xl bg-accent/30 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Username
              </p>
              <p className="mt-0.5 truncate text-sm">{user?.username ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-accent/30 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </p>
              <p className="mt-0.5 truncate text-sm">{user?.email || "—"}</p>
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
            {samePassword && !pwSaving && (
              <p className="text-xs text-destructive">
                New password must be different from the current one.
              </p>
            )}
            {pwError && (
              <p role="alert" className="text-xs text-destructive">
                {pwError}
              </p>
            )}
            <button
              type="submit"
              disabled={pwSaving || !pwCurrent || !pwNew || samePassword}
              className="h-9 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pwSaving ? "Updating…" : "Update password"}
            </button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              You will be signed out after the change.
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
    </>
  );
}

export default function ManageProfileMenu({
  className,
  onSignOut,
  variant = "top-right",
}: {
  className?: string;
  /** Sign-out handled by the parent so the nav can stay in sync. */
  onSignOut?: () => void;
  /**
   * Where the trigger sits, which sets the hover card's anchor:
   * "top-right" (navbar corner, card drops down) or
   * "bottom-left" (sidebar corner, card rises up). The window
   * itself is always screen-centered either way.
   */
  variant?: "top-right" | "bottom-left";
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

  // Close on Escape, and return focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => triggerRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // Fresh history each time the window opens.
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
    if (pwNew === pwCurrent) {
      setPwError("New password must be different from the current one.");
      return;
    }
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
  const samePassword = pwCurrent !== "" && pwNew === pwCurrent;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {/* Trigger: hover shows the account basics, click opens the window */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Manage profile"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="manage-profile"
        title="Manage profile"
        className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserCircle2 className="h-[20px] w-[20px]" />
      </button>

      {/* Hover card — the account basics, without opening the window */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: variant === "bottom-left" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: variant === "bottom-left" ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "pointer-events-none absolute z-40 w-56 origin-top-right rounded-xl border border-border/60 bg-card/95 p-3 shadow-xl shadow-black/10 backdrop-blur-xl",
              variant === "bottom-left"
                ? "left-0 bottom-12 origin-bottom-left"
                : "right-0 top-12"
            )}
            data-testid="profile-hover-card"
          >
            <div className="flex items-center gap-2.5">
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
            </div>
            <p className="mt-2.5 flex items-center gap-1.5 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <ChevronRight className="h-3.5 w-3.5" />
              Click the avatar to manage the account
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile manager — its own window, not a dropdown.
          Rendered through a portal so the fixed positioning is
          never clipped by the navbar's stacking context. */}
      <AnimatePresence>
        {open &&
          createPortal(
            <ProfileWindow
              reduce={reduce}
              tab={tab}
              setTab={setTab}
              initials={initials}
              user={user}
              history={history}
              historyError={historyError}
              pwCurrent={pwCurrent}
              pwNew={pwNew}
              pwError={pwError}
              pwSaving={pwSaving}
              samePassword={samePassword}
              newUsername={newUsername}
              unPassword={unPassword}
              unError={unError}
              unSaving={unSaving}
              unDone={unDone}
              setPwCurrent={setPwCurrent}
              setPwNew={setPwNew}
              setNewUsername={setNewUsername}
              setUnPassword={setUnPassword}
              submitPassword={submitPassword}
              submitUsername={submitUsername}
              close={close}
              logout={logout}
            />,
            document.body
          )}
      </AnimatePresence>
    </div>
  );
}
