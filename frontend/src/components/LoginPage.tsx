import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, Check, Lock, Mail, User } from "lucide-react";

import { useAuth } from "@/components/Auth";
import Logo from "@/components/Logo";
import { api } from "@/lib/utils-finance";
import {
  AuthAlert,
  AuthButton,
  AuthInput,
  PasswordInput,
  StrengthMeter,
  passwordStrength,
} from "@/components/ui/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ease, fadeUp, noMotion, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sign-in / registration gate.
 *
 * Split screen: a brand panel with one product preview on
 * the left, and a single form card on the right. The form
 * carries only what is needed to act — fields, the primary
 * action, and the mode switch. Every surface reads from the
 * `--auth-*` tokens so light and dark share one definition.
 *
 * Auth behavior: same endpoints, same session flow, same
 * generic error messages.
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

/* ------------------------------------------------------------------ */
/* Brand panel (left)                                                   */
/* ------------------------------------------------------------------ */

/** Sample balance trend. Shape only — the figures are illustrative. */
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

function BalanceCard() {
  const reduce = useReducedMotion();
  const path = React.useMemo(() => sparkPath(SPARK, 320, 64), []);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.1 }}
      className="w-full max-w-[380px] rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#a3acb9]">Total balance</span>
        <span className="flex items-center gap-0.5 rounded-full bg-emerald-300/10 px-2 py-0.5 text-[12px] font-medium tabular-nums text-emerald-300">
          <ArrowDownRight className="h-3 w-3 rotate-180" />
          4.2%
        </span>
      </div>
      <p
        className={cn(
          "mt-2 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-white",
          !reduce && "auth-count-up"
        )}
      >
        ₹2,84,930
      </p>
      <svg viewBox="0 0 320 64" className="mt-5 h-16 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="auth-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L320 64 L0 64 Z`} fill="url(#auth-spark-fill)" />
        <path
          d={path}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          className="auth-spark-line"
        />
      </svg>
      <p className="mt-4 text-[12px] text-[#6b7482]">Sample data · stored on this device</p>
    </motion.div>
  );
}

function BrandPanel() {
  const reduce = useReducedMotion();
  const variants = reduce ? noMotion : staggerContainer;
  const item = reduce ? noMotion : fadeUp;

  return (
    // The brand panel is always dark — it is the product's
    // visual identity, not a themed surface.
    <section
      className="relative hidden overflow-hidden lg:flex lg:flex-col"
      style={{ background: "var(--auth-brand-grad)" }}
      aria-label="About Batua"
    >
      <div
        className="auth-aurora"
        style={
          {
            "--auth-glow-a": "rgba(16,185,129,0.16)",
            "--auth-glow-b": "rgba(20,184,166,0.10)",
            "--auth-glow-c": "rgba(79,70,229,0.08)",
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <span className="auth-aurora-a" />
        <span className="auth-aurora-b" />
        <span className="auth-aurora-c" />
      </div>
      <div className="auth-grain" aria-hidden="true" />

      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="relative z-10 flex h-full flex-col p-12"
      >
        <motion.div variants={item} className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--auth-accent)]">
            <Logo className="h-6 w-6" />
          </span>
          <span className="font-brand text-[19px] font-semibold text-white">Batua</span>
        </motion.div>

        <div className="my-auto flex flex-col gap-10">
          <motion.div variants={item} className="max-w-[440px] space-y-4">
            <h2 className="text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
              Your money,
              <br />
              kept on your device.
            </h2>
            <p className="max-w-[400px] text-[15px] leading-relaxed text-[#a3acb9]">
              Track every rupee without uploading a single transaction. Your
              finances stay on this device.
            </p>
          </motion.div>

          <motion.div variants={item}>
            <BalanceCard />
          </motion.div>
        </div>

        <motion.footer variants={item} className="text-[13px] text-[#6b7482]">
          © 2026 Batua
        </motion.footer>
      </motion.div>
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
      setError(err?.response?.data?.detail || err?.message || "Could not create a recovery token");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {token
              ? "Copy this token. It works once and expires in 15 minutes."
              : "Create a one-time token for your username."}
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <code className="block break-all rounded-lg border border-[color:var(--auth-line)] bg-[color:var(--auth-surface)] px-4 py-3 font-mono text-xs text-[color:var(--auth-ink)]">
            {token}
          </code>
        ) : (
          <form onSubmit={request} className="space-y-5">
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthInput
              id="recovery-username"
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={username.trim() && username.trim().length < USERNAME_MIN ? `At least ${USERNAME_MIN} characters` : null}
            />
            <AuthButton type="submit" variant="primary" loading={busy} loadingLabel="Creating…" disabled={!username.trim()}>
              Create token
            </AuthButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
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
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [banner, setBanner] = useState<{ kind: "error" | "warning"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const attemptsRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  const strength = React.useMemo(() => passwordStrength(form.password), [form.password]);

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

  const switchMode = () =>
    setMode((m) => {
      setFieldErrors({});
      setConfirmTouched(false);
      setBanner(null);
      return m === "login" ? "register" : "login";
    });

  return (
    <div
      className="relative grid h-dvh grid-cols-1 overflow-hidden bg-[color:var(--auth-page)] [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] lg:grid-cols-[55fr_45fr]"
      style={{ color: "var(--auth-ink)" }}
    >
      <AuthBackdrop />

      <BrandPanel />

      <main className="relative z-10 flex min-h-0 overflow-y-auto px-5 sm:px-10 lg:px-14">
        <motion.div
          variants={reduce ? noMotion : staggerContainer}
          initial="hidden"
          animate="show"
          className="m-auto w-full max-w-[400px] py-10"
        >
          <motion.div variants={item} className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--auth-accent)]">
              <Logo className="h-6 w-6" />
            </span>
            <span className="font-brand text-[19px] font-semibold text-[color:var(--auth-ink)]">
              Batua
            </span>
          </motion.div>

          <motion.div
            variants={item}
            className="rounded-2xl border border-[color:var(--auth-line)] bg-[color:var(--auth-panel)] p-7 sm:p-8"
          >
            <motion.h1 variants={item} className="mb-7 text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--auth-ink)]">
              {mode === "login" ? "Sign in" : "Create account"}
            </motion.h1>

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
              <AuthInput
                id="login-username"
                label="Username"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                icon={<User className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                value={form.username}
                onChange={set("username")}
                error={fieldErrors.username}
              />

              {mode === "register" && (
                <AuthInput
                  id="login-email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  icon={<Mail className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  value={form.email}
                  onChange={set("email")}
                  error={fieldErrors.email}
                />
              )}

              <PasswordInput
                id="login-password"
                label="Password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                icon={<Lock className="h-[18px] w-[18px]" strokeWidth={1.5} />}
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

              {mode === "register" && (
                <PasswordInput
                  id="login-confirm"
                  label="Confirm password"
                  autoComplete="new-password"
                  icon={<Lock className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  value={form.confirm}
                  onChange={set("confirm")}
                  onBlur={() => setConfirmTouched(true)}
                  error={confirmError}
                />
              )}

              {mode === "login" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setRecoveryOpen(true)}
                    className="cursor-pointer rounded-md px-1 py-1 text-[13px] font-medium text-[color:var(--auth-accent)] transition-colors hover:text-[color:var(--auth-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <AuthButton
                type="submit"
                loading={busy}
                loadingLabel={mode === "login" ? "Signing in…" : "Creating account…"}
                disabled={succeeded}
                withArrow={!succeeded}
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
          </motion.div>

          <motion.p variants={item} className="mt-6 text-center text-sm text-[color:var(--auth-ink-2)]">
            {mode === "login" ? "New to Batua? " : "Already have an account? "}
            <button
              type="button"
              onClick={switchMode}
              className="cursor-pointer font-medium text-[color:var(--auth-accent)] transition-colors hover:text-[color:var(--auth-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </motion.p>

          <RecoveryDialog open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
        </motion.div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page backdrop: aurora + grain + cursor spotlight                    */
/* ------------------------------------------------------------------ */

/**
 * Atmosphere layer for the whole auth screen. The cursor
 * spotlight is lerped toward the pointer and only runs on
 * fine pointers. Decorative: aria-hidden, pointer-events-none.
 */
function AuthBackdrop() {
  const reduce = useReducedMotion();
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return undefined;
    const el = spotlightRef.current;
    if (!el) return undefined;

    let x = 50;
    let y = 40;
    let targetX = 50;
    let targetY = 40;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth) * 100;
      targetY = (e.clientY / window.innerHeight) * 100;
    };

    const tick = () => {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      el.style.setProperty("--auth-mx", `${x.toFixed(2)}%`);
      el.style.setProperty("--auth-my", `${y.toFixed(2)}%`);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="auth-aurora">
        <span className="auth-aurora-a" />
        <span className="auth-aurora-b" />
        <span className="auth-aurora-c" />
      </div>
      <div className="auth-grain" />
      <div ref={spotlightRef} className="auth-spotlight" />
    </div>
  );
}
