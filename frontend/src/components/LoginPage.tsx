import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Fingerprint, ShieldCheck, Wallet } from "lucide-react";

import { useAuth } from "@/components/Auth";
import { api } from "@/lib/utils-finance";
import {
  AuthAlert,
  AuthButton,
  AuthCheckbox,
  AuthInput,
  PasswordInput,
  SegmentedControl,
  StrengthMeter,
  passwordStrength,
  type StrengthScore,
} from "@/components/ui/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ease, fadeUp, noMotion, staggerContainer } from "@/lib/motion";import { cn } from "@/lib/utils";

/**
 * Sign-in / registration gate.
 *
 * Split screen: a quiet brand panel on the left (one balance
 * card, three trust points, nothing else) and a flat, centered
 * form on the right. Every state is designed — default, hover,
 * focus-visible, active, disabled, loading, error, success —
 * and the whole surface is driven by `--auth-*` variables so
 * light and dark both come from the same tokens.
 *
 * Auth behavior is unchanged from the previous version: same
 * endpoints, same session flow, same generic error messages.
 * Only presentation (and the field-level validation UX) moved.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const USERNAME_MIN = 3;
const PASSWORD_MIN = 4;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side attempt limiter — the backend has no lockout, so
 *  this is the front line against brute force on a local app. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

/** 6s float, per the design spec. Transform-only for 60fps. */
const FLOAT = { duration: 6, repeat: Infinity, ease: "easeInOut" as const };

/* ------------------------------------------------------------------ */
/* Brand panel (left)                                                   */
/* ------------------------------------------------------------------ */

/**
 * A single, quiet sparkline. Real-ish closing prices so the
 * shape is honest; the end dot marks "today".
 */
const SPARK = [42, 45, 44, 48, 47, 52, 51, 55, 58, 57, 61, 64, 63, 67, 71, 70, 74, 78, 77, 82];

function sparkPath(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  return values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)} ${(height - ((v - min) / span) * (height - 6) - 3).toFixed(2)}`
    )
    .join(" ");
}

/** The one product visual: balance + trend. Glassmorphism-lite. */
function BalanceCard() {
  const reduce = useReducedMotion();
  const path = React.useMemo(() => sparkPath(SPARK, 260, 56), []);

  return (
    <div
      className={cn(
        "w-[300px] rounded-2xl border border-white/[0.07] bg-white/[0.05] p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl",
        !reduce && "auth-float"
      )}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#a3acb9]">Total balance</span>
        <span className="flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-emerald-300">
          +4.2%
        </span>
      </div>
      <p className="mt-2 font-display text-[32px] font-semibold tracking-[-0.02em] text-white tabular-nums">
        ₹2,84,930
      </p>
      <svg viewBox="0 0 260 56" className="mt-3 h-14 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="auth-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L260 56 L0 56 Z`} fill="url(#auth-spark-fill)" />
        <path
          d={path}
          fill="none"
          stroke="#10b981"
          strokeOpacity="0.9"
          strokeWidth="2"
          strokeLinecap="round"
          className="auth-spark-line"
        />
        <circle cx="257" cy="4.5" r="3" fill="#10b981" />
      </svg>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7482]">
        Batua vault · this device
      </p>
    </div>
  );
}

const TRUST_POINTS = [
  { icon: Wallet, label: "Local-first storage" },
  { icon: ShieldCheck, label: "End-to-end private" },
  { icon: Check, label: "No ads, no tracking" },
] as const;

function BrandPanel() {
  const reduce = useReducedMotion();
  const variants = reduce ? noMotion : staggerContainer;
  const item = reduce ? noMotion : fadeUp;

  return (
    <section
      className="relative hidden flex-col overflow-hidden lg:flex"
      style={{ background: "var(--auth-brand-grad)" }}
      aria-label="About Batua"
    >
      {/* Very faint grid, masked to fade out at the edges. */}
      <div
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(75%_75%_at_50%_45%,black,transparent)]"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col p-12">
        <motion.div variants={item} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--auth-accent)]">
            <Wallet className="h-[18px] w-[18px] text-[color:var(--auth-accent-ink)]" strokeWidth={1.75} />
          </span>
          <span className="font-display text-[17px] font-semibold tracking-tight text-white">
            Batua
          </span>
        </motion.div>

        <div className="my-auto max-w-[420px] space-y-10">
          <motion.div variants={item} className="space-y-4">
            <h2 className="text-[40px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
              Your money. Your device. Your control.
            </h2>
            <p className="text-[15px] leading-relaxed text-[#a3acb9]">
              Every rupee tracked, nothing uploaded. Batua keeps your
              finances on this device — always.
            </p>
          </motion.div>

          <motion.div variants={item}>
            <BalanceCard />
          </motion.div>

          <motion.ul variants={item} className="space-y-3">
            {TRUST_POINTS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-3 text-sm font-medium text-[#a3acb9]"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <Icon className="h-[15px] w-[15px] text-[#34d399]" strokeWidth={1.75} />
                </span>
                {label}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.footer
          variants={item}
          className="flex items-center justify-between text-[13px] text-[#6b7482]"
        >
          <span>© 2026 Batua</span>
          <span className="flex gap-4">
            <span>Privacy</span>
            <span>Terms</span>
          </span>
        </motion.footer>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recovery dialog (the "forgot password" path)                         */
/* ------------------------------------------------------------------ */

/**
 * Mints a one-time reset token from the server
 * (POST /api/auth/recovery-token). The token is exchanged for
 * a new password at Settings → Account on a signed-in device.
 */
function RecoveryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/recovery-token", {
        username: username.trim(),
      });
      setToken(data.token ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Could not mint a recovery token");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Recover your account</DialogTitle>
          <DialogDescription>
            Mint a recovery token for your username, then exchange it
            for a new password.
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--auth-accent)]/30 bg-[color:var(--auth-accent)]/8 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--auth-accent)]" />
              <div className="min-w-0">
                <p className="text-sm leading-relaxed text-[color:var(--auth-ink-2)]">
                  Your recovery token — copy it now. It is single-use and
                  expires after 15 minutes.
                </p>
                <code className="mt-2 block break-all rounded-md bg-[color:var(--auth-surface)] px-3 py-2 font-mono text-xs text-[color:var(--auth-ink)]">
                  {token}
                </code>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-[color:var(--auth-ink-3)]">
              Exchange it at Settings → Account on any device, or POST it
              to <code>/api/auth/reset</code> with a new password.
            </p>
          </div>
        ) : (
          <form onSubmit={request} className="space-y-4">
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthInput
              id="recovery-username"
              label="Username"
              placeholder="e.g. alex.sharma"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={username.trim() && username.trim().length < USERNAME_MIN ? `At least ${USERNAME_MIN} characters` : null}
            />
            <AuthButton type="submit" variant="primary" loading={busy} loadingLabel="Minting…" disabled={!username.trim()}>
              Mint recovery token
            </AuthButton>
            <p className="text-xs leading-relaxed text-[color:var(--auth-ink-3)]">
              The token appears here once — keep it somewhere safe.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Passkey / biometric (WebAuthn)                                       */
/* ------------------------------------------------------------------ */

function usePlatformAuthenticator() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ok =
          typeof window.PublicKeyCredential !== "undefined" &&
          (await (
            window.PublicKeyCredential as unknown as {
              isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean>;
            }
          ).isUserVerifyingPlatformAuthenticatorAvailable());
        if (alive) setAvailable(Boolean(ok));
      } catch {
        if (alive) setAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/* ------------------------------------------------------------------ */
/* The page                                                             */
/* ------------------------------------------------------------------ */

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const { register, login } = useAuth();
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [remember, setRemember] = useState(true);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "warning"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const attemptsRef = React.useRef(0);
  const formRef = React.useRef<HTMLFormElement>(null);
  const passkeyAvailable = usePlatformAuthenticator();

  const strength: { score: StrengthScore; label: string; checks: { label: string; met: boolean }[] } =
    React.useMemo(() => passwordStrength(form.password), [form.password]);

  const item = reduce ? noMotion : fadeUp;

  /* ---- rate limit / lockout countdown -------------------------------- */
  useEffect(() => {
    if (lockoutUntil === 0) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setLockoutUntil(0);
        attemptsRef.current = 0;
        setBanner(null);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lockoutUntil]);

  /* ---- caps lock tracking -------------------------------------------- */
  const trackCapsLock = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock"));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /* ---- validation ----------------------------------------------------- */
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (form.username.trim().length < USERNAME_MIN) {
      errors.username = `Username must be at least ${USERNAME_MIN} characters`;
    }
    if (mode === "register") {
      if (!EMAIL_RE.test(form.email.trim())) {
        errors.email = "Enter a valid email address";
      }
      if (form.password.length < PASSWORD_MIN) {
        errors.password = `Password must be at least ${PASSWORD_MIN} characters`;
      }
      if (form.password !== form.confirm) {
        errors.confirm = "Passwords do not match";
      }
    } else if (form.password.length < PASSWORD_MIN) {
      errors.password = `Password must be at least ${PASSWORD_MIN} characters`;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ---- submit ---------------------------------------------------------- */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || succeeded || lockoutUntil > Date.now()) return;
    setBanner(null);

    if (attemptsRef.current >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_SECONDS * 1000;
      setLockoutUntil(until);
      setBanner({
        kind: "warning",
        text: `Too many attempts. Try again in ${LOCKOUT_SECONDS}s.`,
      });
      return;
    }

    if (!validate()) {
      // A single 150ms shake, not a toast — the errors are on the fields.
      formRef.current?.classList.remove("auth-shake");
      void formRef.current?.offsetWidth;
      formRef.current?.classList.add("auth-shake");
      return;
    }

    setBusy(true);
    try {
      const username = form.username.trim();
      if (mode === "login") {
        await login(username, form.password);
      } else {
        await register(username, form.email.trim(), form.password);
        await login(username, form.password);
      }
      attemptsRef.current = 0;
      // Brief success micro-state so the user sees the checkmark
      // before the app mounts and the gate unmounts this page.
      setSucceeded(true);
      window.setTimeout(() => navigate("/dashboard", { replace: true }), 450);
    } catch (err: any) {
      // Generic on purpose — never reveal whether the username or
      // the password was the wrong half.
      attemptsRef.current += 1;
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409) {
        // Register collided with an existing account — surface it,
        // it's actionable (switch to sign in).
        setBanner({ kind: "error", text: "An account with this username already exists. Sign in instead." });
      } else if (status === 404) {
        setBanner({ kind: "error", text: "No account found with that username. Create one to get started." });
      } else if (status === 401 || status === 400) {
        setBanner({ kind: "error", text: "Couldn't sign in. Check your details and try again." });
      } else if (!err?.response) {
        setBanner({ kind: "error", text: "Couldn't reach the Batua server. Check that it's running and try again." });
      } else {
        setBanner({
          kind: "error",
          text: typeof detail === "string" ? detail : "Something went wrong. Please try again.",
        });
      }
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockoutUntil(until);
        setBanner({ kind: "warning", text: `Too many attempts. Try again in ${LOCKOUT_SECONDS}s.` });
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmError =
    mode === "register" && confirmTouched && form.confirm && form.password !== form.confirm
      ? "Passwords do not match"
      : null;

  return (
    <div
      className="grid min-h-dvh grid-cols-1 bg-[color:var(--auth-page)] lg:grid-cols-2"
      style={{ color: "var(--auth-ink)" }}
    >
      <BrandPanel />

      <main className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
        <motion.div
          variants={reduce ? noMotion : staggerContainer}
          initial="hidden"
          animate="show"
          className="w-full max-w-[400px]"
        >
          {/* Compact logo header — the mobile stand-in for the brand panel */}
          <motion.div variants={item} className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--auth-accent)]">
              <Wallet className="h-[18px] w-[18px] text-[color:var(--auth-accent-ink)]" strokeWidth={1.75} />
            </span>
            <span className="font-display text-[17px] font-semibold tracking-tight text-[color:var(--auth-ink)]">
              Batua
            </span>
          </motion.div>

          {/* Heading */}
          <motion.div variants={item} className="mb-7 space-y-2">
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--auth-ink)]">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-[14px] leading-relaxed text-[color:var(--auth-ink-2)]">
              {mode === "login"
                ? "Sign in to continue to your vault."
                : "One account per install — your data stays on this device."}
            </p>
          </motion.div>

          {/* Segmented control */}
          <motion.div variants={item} className="mb-6">
            <SegmentedControl
              id="auth-mode"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setFieldErrors({});
                setConfirmTouched(false);
                setBanner(null);
              }}
              options={[
                { value: "login", label: "Sign in" },
                { value: "register", label: "Register" },
              ]}
            />
          </motion.div>

          {/* Server / network banner */}
          {banner && (
            <motion.div variants={item} className="mb-5">
              <AuthAlert variant={banner.kind}>
                {banner.kind === "warning"
                  ? `Too many attempts. Try again in ${secondsLeft}s.`
                  : banner.text}
              </AuthAlert>
            </motion.div>
          )}

          <motion.form
            ref={formRef}
            variants={item}
            onSubmit={submit}
            noValidate
            className="space-y-5"
          >
            {/* Username */}
            <AuthInput
              id="login-username"
              label="Username"
              placeholder="e.g. alex.sharma"
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={form.username}
              onChange={set("username")}
              error={fieldErrors.username}
            />

            {/* Email — register only */}
            {mode === "register" && (
              <AuthInput
                id="login-email"
                label="Email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={set("email")}
                error={fieldErrors.email}
              />
            )}

            {/* Password */}
            <PasswordInput
              id="login-password"
              label="Password"
              placeholder="••••••••"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={form.password}
              onChange={set("password")}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              error={fieldErrors.password}
              capsLock={capsLock}
            >
              {mode === "register" && form.password.length > 0 && (
                <StrengthMeter score={strength.score} />
              )}
            </PasswordInput>

            {/* Register: strength requirements + confirm */}
            {mode === "register" && (
              <div className="space-y-3">
                <ul className="space-y-1.5">
                  {strength.checks.map((check) => (
                    <li
                      key={check.label}
                      className={cn(
                        "flex items-center gap-2 text-[13px]",
                        check.met
                          ? "text-[color:var(--auth-accent)]"
                          : "text-[color:var(--auth-ink-3)]"
                      )}
                    >
                      <Check
                        className={cn("h-3.5 w-3.5", !check.met && "opacity-40")}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      {check.label}
                      <span className="sr-only">{check.met ? "— met" : "— not met"}</span>
                    </li>
                  ))}
                </ul>
                <PasswordInput
                  id="login-confirm"
                  label="Confirm password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={set("confirm")}
                  onBlur={() => setConfirmTouched(true)}
                  error={confirmError}
                />
              </div>
            )}

            {/* Remember me / forgot */}
            <div className="flex items-center justify-between gap-3">
              <AuthCheckbox
                id="login-remember"
                label="Remember this device"
                checked={remember}
                onChange={setRemember}
              />
              <button
                type="button"
                onClick={() => setRecoveryOpen(true)}
                className="min-h-[44px] cursor-pointer px-1 text-sm font-medium text-[color:var(--auth-accent)] transition-colors hover:text-[color:var(--auth-accent-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--auth-panel)]"
              >
                Forgot password?
              </button>
            </div>

            {/* Primary action */}
            <AuthButton
              type="submit"
              loading={busy}
              loadingLabel={mode === "login" ? "Signing in…" : "Creating account…"}
              disabled={succeeded}
              className={cn(succeeded && "border-[color:var(--auth-accent)]/40")}
            >
              {succeeded ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Signed in
                </>
              ) : mode === "login" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </AuthButton>
          </motion.form>

          {/* Passkey / biometric — only when the platform can do it */}
          {passkeyAvailable && (
            <motion.div variants={item} className="mt-6">
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-[color:var(--auth-line)]" />
                <span className="text-[13px] text-[color:var(--auth-ink-3)]">or</span>
                <span className="h-px flex-1 bg-[color:var(--auth-line)]" />
              </div>
              <AuthButton
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={() => setBanner({ kind: "warning", text: "Passkey sign-in isn't set up on this device yet." })}
              >
                <Fingerprint className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Sign in with passkey
              </AuthButton>
            </motion.div>
          )}

          {/* Secondary: switch mode */}
          <motion.p variants={item} className="mt-6 text-center text-sm text-[color:var(--auth-ink-2)]">
            {mode === "login" ? "New to Batua? " : "Already have an account? "}
            <button
              type="button"
              onClick={() =>
                setMode((m) => {
                  setFieldErrors({});
                  setConfirmTouched(false);
                  setBanner(null);
                  return m === "login" ? "register" : "login";
                })
              }
              className="cursor-pointer font-medium text-[color:var(--auth-accent)] transition-colors hover:text-[color:var(--auth-accent-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--auth-panel)]"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </motion.p>

          {/* Security note — compact, collapsible */}
          <motion.div variants={item} className="mt-6">
            <details className="group rounded-lg border border-[color:var(--auth-line)] bg-[color:var(--auth-surface)] px-3.5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-[color:var(--auth-ink-2)] transition-colors hover:text-[color:var(--auth-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)] [&::-webkit-details-marker]:hidden">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[color:var(--auth-accent)]" strokeWidth={1.5} />
                <span>Your data stays on this device</span>
                <ArrowRight
                  className="ml-auto h-3.5 w-3.5 rotate-90 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--auth-ink-3)]">
                Nothing leaves this machine — no servers, no sync, no analytics.
                Lost your password? Mint a recovery token from{" "}
                <button
                  type="button"
                  onClick={() => setRecoveryOpen(true)}
                  className="cursor-pointer font-medium text-[color:var(--auth-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]"
                >
                  Settings → Account
                </button>
                .
              </p>
            </details>
          </motion.div>

          <RecoveryDialog open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
        </motion.div>
      </main>
    </div>
  );
}
