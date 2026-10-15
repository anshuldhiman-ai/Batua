import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";

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
 * Sign-in / registration gate — Obsidian Slate Glassmorphism.
 *
 * Left: Balanced hero stage with overlapping depth cards, headline with
 * text-wrap balance, on-device AI focus, and net worth chart with date labels.
 * Right: Obsidian-slate glassmorphism card with gradient hairline, inner
 * highlight, custom emerald checkbox, and lime-to-emerald pill CTA.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const USERNAME_MIN = 3;
const PASSWORD_MIN = 4;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side attempt limiter against local brute-force attempts. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

/* ------------------------------------------------------------------ */
/* Hero visual primitives: Budget bar, Floating chip, Telemetry card  */
/* ------------------------------------------------------------------ */

/**
 * Monthly budget card offset behind the telemetry card for optical depth.
 */
function BudgetCard() {
  const reduce = useReducedMotion();
  const SEGMENTS = 8;
  const FILLED = 6;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...ease, delay: 0.2 }}
      className="rounded-2xl border border-white/[0.08] bg-[#0d1713]/90 p-3.5 backdrop-blur-xl shadow-[0_16px_36px_-8px_rgba(0,0,0,0.6)] w-[210px]"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-300">
          Monthly budget
        </span>
        <span className="text-[11px] font-bold tabular-nums text-emerald-400">75%</span>
      </div>
      <div className="mt-2.5 flex gap-1" role="presentation">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < FILLED
                ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                : "bg-white/10"
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400 tabular-nums">
        ₹22,500 of ₹30,000 used
      </p>
    </motion.div>
  );
}

/**
 * Floating glass chip positioned outside the card bounds.
 */
function FloatingChip({
  icon: Icon,
  label,
  className,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-[#091510]/95 px-3 py-1.5 backdrop-blur-xl shadow-[0_8px_24px_-4px_rgba(0,0,0,0.5)]",
        className
      )}
      aria-hidden="true"
    >
      <Icon className="h-3.5 w-3.5 text-emerald-400 shrink-0" strokeWidth={2} />
      <span className="text-[11.5px] font-semibold text-slate-200 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

/**
 * Product telemetry card with taller sparkline, distinct tooltip figure,
 * and faint date labels on the x-axis.
 */
function TelemetryCard() {
  const reduce = useReducedMotion();

  // Smooth spline curve across dates in October
  const sparkPath =
    "M 0 85 C 30 85, 45 74, 70 74 C 95 74, 110 80, 135 80 C 160 80, 175 62, 200 62 C 225 62, 240 70, 265 70 C 290 70, 305 50, 330 50 C 355 50, 370 56, 395 56 C 410 56, 420 32, 435 32";
  const areaPath = `${sparkPath} L 435 110 L 0 110 Z`;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.12 }}
      className="relative z-10 w-full rounded-2xl border border-emerald-500/20 bg-[#091410]/90 p-4 sm:p-5 backdrop-blur-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]"
      aria-hidden="true"
    >
      {/* Header: Local Vault Active and Sample Data pill */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold text-emerald-400">Local Vault Active</span>
          <span className="text-white/20">|</span>
          <span className="text-slate-300">On-device AI</span>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
          Sample data
        </span>
      </div>

      {/* Net Worth Figure */}
      <div className="mt-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
          Net worth
        </p>
        <div className="mt-1 flex items-baseline gap-2.5">
          <p
            className={cn(
              "text-[28px] sm:text-[32px] font-bold leading-none tracking-tight text-white tabular-nums",
              !reduce && "auth-count-up"
            )}
          >
            ₹1,42,850
          </p>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-400 border border-emerald-500/25">
            <TrendingUp className="h-3 w-3" />
            +8.4%
          </span>
        </div>
      </div>

      {/* Taller Sparkline Area Chart with x-axis date labels */}
      <div className="mt-3 relative">
        <svg
          viewBox="0 0 440 125"
          className="h-[110px] sm:h-[120px] w-full overflow-visible"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="telemetry-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.32" />
              <stop offset="60%" stopColor="#10B981" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="telemetry-spark-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="50%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <filter id="telemetry-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#10B981" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Area Fill */}
          <path d={areaPath} fill="url(#telemetry-spark-fill)" />

          {/* Sparkline Curve */}
          <path
            d={sparkPath}
            fill="none"
            stroke="url(#telemetry-spark-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="auth-spark-line"
            pathLength={1}
          />

          {/* Inflection indicator dots along the trend */}
          {[
            [70, 74],
            [135, 80],
            [200, 62],
            [265, 70],
            [330, 50],
            [395, 56],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2.5" fill="#34D399" opacity="0.65" />
          ))}

          {/* Vertical dashed guide line dropping from marker dot */}
          <line
            x1="385"
            y1="56"
            x2="385"
            y2="110"
            stroke="#10B981"
            strokeOpacity="0.45"
            strokeDasharray="3 3"
            strokeWidth="1.5"
          />

          {/* Marker dot at 12 Oct observation */}
          <circle cx="385" cy="56" r="7" fill="#10B981" fillOpacity="0.25" filter="url(#telemetry-glow)" />
          <circle cx="385" cy="56" r="4.5" fill="#34D399" stroke="#060b08" strokeWidth="2" />

          {/* Tooltip chip with distinct figure and date */}
          <g transform="translate(325, 20)">
            <rect width="112" height="22" rx="11" fill="#0c231a" stroke="#10B981" strokeOpacity="0.5" strokeWidth="1" />
            <text x="56" y="15" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#34D399" fontFamily="inherit">
              12 Oct · ₹1,38,200
            </text>
          </g>

          {/* Faint X-Axis date labels */}
          <text x="4" y="122" fill="#94a3b8" opacity="0.6" fontSize="9.5" fontWeight="500" fontFamily="inherit">
            1 Oct
          </text>
          <text x="110" y="122" fill="#94a3b8" opacity="0.6" fontSize="9.5" fontWeight="500" fontFamily="inherit">
            8 Oct
          </text>
          <text x="220" y="122" fill="#94a3b8" opacity="0.6" fontSize="9.5" fontWeight="500" fontFamily="inherit">
            15 Oct
          </text>
          <text x="325" y="122" fill="#94a3b8" opacity="0.6" fontSize="9.5" fontWeight="500" fontFamily="inherit">
            22 Oct
          </text>
          <text x="408" y="122" fill="#94a3b8" opacity="0.8" fontSize="9.5" fontWeight="600" fontFamily="inherit">
            Today
          </text>
        </svg>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Brand panel (left)                                                 */
/* ------------------------------------------------------------------ */

function BrandPanel() {
  const reduce = useReducedMotion();
  const variants = reduce ? noMotion : staggerContainer;
  const item = reduce ? noMotion : fadeUp;

  return (
    <section
      className="relative order-2 overflow-hidden lg:order-1 lg:flex lg:flex-col lg:h-full justify-between p-6 sm:p-8 lg:py-8 lg:px-10 xl:px-14 bg-gradient-to-br from-[#0a1410] via-[#060b08] to-[#040806]"
      aria-label="About Batua"
    >
      {/* Ambient background atmosphere */}
      <div className="auth-aurora" aria-hidden="true">
        <span className="auth-aurora-a" />
        <span className="auth-aurora-b" />
        <span className="auth-aurora-c" />
      </div>
      <div className="auth-grain" aria-hidden="true" />

      {/* Large blurred emerald stage glow behind hero */}
      <div
        className="pointer-events-none absolute left-1/3 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[520px] w-[520px] rounded-full bg-emerald-500/[0.12] blur-[130px]"
        aria-hidden="true"
      />

      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="relative z-10 flex h-full flex-col justify-between max-w-[620px] xl:max-w-[680px] w-full mx-auto"
      >
        {/* Top spacer (top-left logo removed to avoid duplicate mark) */}
        <div className="hidden lg:block h-2" />

        {/* Hero content stage filling ~85% width */}
        <div className="my-auto flex flex-col gap-5 py-3 lg:gap-6 lg:py-2 w-full">
          {/* Balanced Headline & On-device AI Subtitle */}
          <motion.div variants={item} className="space-y-3">
            <h2 className="font-auth text-[30px] font-bold leading-[1.15] tracking-[-0.03em] text-white sm:text-[34px] lg:text-[38px] xl:text-[42px] [text-wrap:balance]">
              Your money,{" "}
              <span className="auth-gradient-text">kept on your device.</span>
            </h2>
            <p className="max-w-[520px] text-[13.5px] font-medium leading-[1.65] text-slate-300 lg:text-[14.5px] [text-wrap:balance]">
              Private financial intelligence powered by on-device AI. Insights, categorization, and zero-knowledge tracking that never leave your hardware.
            </p>
          </motion.div>

          {/* Single Trust Badge */}
          <motion.div variants={item} className="flex items-center gap-3 max-w-[420px]">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 backdrop-blur-md transition-all hover:border-emerald-500/30 hover:bg-white/[0.05]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-white leading-tight">
                  AES-256 on-device encryption
                </span>
                <span className="text-[11.5px] font-medium text-slate-300 leading-tight mt-0.5">
                  100% Offline • Zero cloud telemetry<span className="sr-only"> (Encrypted locally)</span>
                </span>
              </div>
            </div>
          </motion.div>

          {/* Layered hero stage: Main telemetry card + overlapping budget card + floating chip */}
          <motion.div variants={item} className="relative w-full max-w-[560px] pt-2 pb-4">
            {/* Overlapping budget card offset behind bottom-right */}
            <div className="absolute -bottom-3 -right-2 sm:-right-4 z-0 hidden sm:block">
              <BudgetCard />
            </div>

            {/* Floating chip offset outside top-right */}
            <div className="absolute -top-3 right-4 z-20 hidden sm:block">
              <FloatingChip icon={Lock} label="Zero cloud sync" />
            </div>

            {/* Main telemetry card */}
            <TelemetryCard />
          </motion.div>
        </div>

        {/* Footer */}
        <motion.footer
          variants={item}
          className="pt-2 text-[12px] font-medium text-slate-300"
        >
          <span>© 2026 Batua • Built for your financial freedom</span>
        </motion.footer>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recovery dialog (the "forgot password" path)                       */
/* ------------------------------------------------------------------ */

function RecoveryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/recovery-token", {
        username: username.trim(),
        password,
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
      <DialogContent className="max-w-md border-white/10 bg-[#0c1612] text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Vault Recovery & Reset</DialogTitle>
          <DialogDescription className="text-slate-300">
            {token
              ? "Copy this recovery key. It works once to unlock settings on this device and expires in 15 minutes."
              : "Because Batua stores your vault offline on this device, passphrases cannot be recovered remotely. Holding your current passphrase allows you to generate a one-time recovery key."}
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <code className="block break-all rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-emerald-400">
            {token}
          </code>
        ) : (
          <form onSubmit={request} className="space-y-4">
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthInput
              id="recovery-username"
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={username.trim() && username.trim().length < USERNAME_MIN ? `At least ${USERNAME_MIN} characters` : null}
            />
            <AuthInput
              id="recovery-password"
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <AuthButton
              type="submit"
              variant="gradient"
              loading={busy}
              loadingLabel="Creating…"
              disabled={!username.trim() || !password}
            >
              Generate recovery key
            </AuthButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                           */
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
  const [rememberDevice, setRememberDevice] = useState(false);
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
      setSucceeded(true);
      window.setTimeout(() => navigate("/dashboard", { replace: true }), 700);
    } catch (err: any) {
      attemptsRef.current += 1;
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409) {
        setBanner({ kind: "error", text: "An account with this username already exists. Sign in instead." });
      } else if (status === 404) {
        setBanner({ kind: "error", text: "No account found with that username. Create one to get started." });
      } else if (status === 401 || status === 400) {
        setBanner({ kind: "error", text: "Invalid credentials. Please check your username and password." });
      } else if (!err?.response) {
        setBanner({ kind: "error", text: "Server unreachable. Ensure the backend is running and try again." });
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
      className="relative grid min-h-dvh grid-cols-1 overflow-x-hidden bg-[#060b08] [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] lg:h-dvh lg:grid-cols-[54fr_46fr] lg:overflow-hidden text-white"
      style={{
        color: "var(--auth-ink, #EDF3EF)",
        "--auth-surface": "rgba(255, 255, 255, 0.05)",
        "--auth-ink": "#EDF3EF",
        "--auth-ink-2": "#cbd5e1",
        "--auth-ink-3": "#94a3b8",
        "--auth-accent": "#10B981",
        "--auth-accent-soft": "rgba(16, 185, 129, 0.16)",
      } as React.CSSProperties}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg font-medium"
      >
        Skip to main content
      </a>
      <AuthBackdrop />

      <BrandPanel />

      {/* Glowing 1px panel seam divider */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-[54%] hidden w-px bg-gradient-to-b from-transparent via-emerald-500/20 to-transparent lg:block shadow-[0_0_15px_rgba(16,185,129,0.15)] z-20"
        aria-hidden="true"
      />

      <main
        id="main-content"
        className="relative z-10 order-1 flex min-h-0 items-center justify-center px-4 py-6 sm:px-8 lg:order-2 lg:h-full lg:px-10 xl:px-14 lg:py-6 overflow-y-auto"
      >
        {/* Subtle glow behind card */}
        <div
          className="pointer-events-none absolute right-1/4 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full bg-emerald-500/[0.08] blur-[110px]"
          aria-hidden="true"
        />

        <motion.div
          variants={reduce ? noMotion : staggerContainer}
          initial="hidden"
          animate="show"
          className="m-auto w-full max-w-[440px] py-2"
        >
          {/* Obsidian-slate glassmorphism card with hairline, inner highlight, focus-within glow */}
          <motion.div
            variants={item}
            className={cn(
              "relative w-full rounded-[28px] p-6 sm:p-7 backdrop-blur-2xl transition-all duration-200",
              "bg-[#0a130f]/85 border border-white/[0.09]",
              "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.14),0_24px_50px_-12px_rgba(0,0,0,0.8)]",
              "focus-within:border-emerald-500/40 focus-within:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.18),0_24px_50px_-12px_rgba(0,0,0,0.8),0_0_30px_-5px_rgba(16,185,129,0.22)]"
            )}
          >
            {/* Gradient hairline on top edge */}
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent"
              aria-hidden="true"
            />

            {/* Logo header: Batua logo icon + BATUA wordmark + SIGN IN in Dashboard display font */}
            <motion.div variants={item} className="flex flex-col items-center text-center mb-4">
              <Logo className="h-10 w-10 shrink-0 text-white" />
              <span className="mt-1.5 font-brand text-[20px] uppercase leading-none tracking-[0.16em] text-white">
                BATUA
              </span>
              <h1 className="mt-2.5 font-display text-[19px] sm:text-[21px] font-bold tracking-wider text-white uppercase">
                {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
              </h1>
            </motion.div>

            {banner && (
              <motion.div variants={item} className="mt-3.5" aria-live="polite">
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
              className="mt-4 space-y-3 sm:space-y-3.5"
            >
              <AuthInput
                id="login-username"
                label="Username"
                placeholder="Enter your username"
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
                  placeholder="Enter your email"
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
                placeholder="Enter your password"
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
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  icon={<Lock className="h-[18px] w-[18px]" strokeWidth={1.5} />}
                  value={form.confirm}
                  onChange={set("confirm")}
                  onBlur={() => setConfirmTouched(true)}
                  error={confirmError}
                />
              )}

              {mode === "login" && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {/* Custom checkbox with emerald checkmark */}
                  <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] sm:text-[13px] font-medium text-slate-300 transition-colors hover:text-white select-none">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-4 w-4 rounded-[5px] border border-white/20 bg-white/[0.04] transition-all peer-checked:border-emerald-500 peer-checked:bg-emerald-500/90 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[#09110d] flex items-center justify-center shadow-inner">
                        <Check
                          className={cn(
                            "h-3 w-3 stroke-[2.5] text-slate-950 transition-transform duration-150",
                            rememberDevice ? "scale-100 opacity-100" : "scale-0 opacity-0"
                          )}
                        />
                      </div>
                    </div>
                    <span>Keep vault unlocked on this device</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecoveryOpen(true)}
                    className="cursor-pointer shrink-0 text-[12.5px] sm:text-[13px] font-medium text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Lime-to-emerald gradient pill CTA button with animation, hover sheen, and sliding arrow */}
              <motion.button
                type="submit"
                disabled={busy || succeeded}
                whileHover={succeeded || busy ? undefined : { scale: 1.015 }}
                whileTap={succeeded || busy ? undefined : { scale: 0.985 }}
                aria-label={mode === "login" ? "Sign in — Go Ahead" : "Create account — Go Ahead"}
                className={cn(
                  "auth-sheen group relative flex h-12 w-full items-center justify-center gap-2 rounded-full font-bold text-[15px] transition-all duration-200 cursor-pointer mt-2 overflow-hidden",
                  "bg-gradient-to-r from-[#34D399] via-[#10B981] to-[#059669] text-slate-950",
                  "shadow-[0_10px_28px_-6px_rgba(16,185,129,0.5),0_2px_8px_rgba(16,185,129,0.3)]",
                  "hover:brightness-105 hover:shadow-[0_14px_34px_-6px_rgba(16,185,129,0.65),0_4px_12px_rgba(16,185,129,0.35)] active:translate-y-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09110d]",
                  "disabled:pointer-events-none disabled:opacity-60"
                )}
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <span className="auth-spinner border-slate-950 border-r-transparent" aria-hidden="true" />
                    <span>{mode === "login" ? "Unlocking vault…" : "Creating vault…"}</span>
                  </span>
                ) : succeeded ? (
                  <motion.span
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="flex items-center gap-2"
                  >
                    <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" />
                    <span>Unlocked</span>
                  </motion.span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span>Go Ahead</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1.5" aria-hidden="true" />
                  </span>
                )}
              </motion.button>
            </motion.form>

            {/* Mode switch toggle */}
            <p className="mt-4 text-center text-[13.5px] text-slate-300">
              {mode === "login" ? "Don't have a vault? " : "Already have a vault? "}
              <button
                type="button"
                onClick={switchMode}
                aria-label={mode === "login" ? "Create an account" : "Sign in"}
                className="cursor-pointer font-semibold text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
              >
                {mode === "login" ? "Create local account" : "Sign in"}
              </button>
            </p>

            {/* Popup celebration on succeeding */}
            <AnimatePresence>
              {succeeded && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="absolute inset-0 z-50 flex items-center justify-center rounded-[28px] bg-[#070e0b]/92 p-6 backdrop-blur-md"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 350, damping: 20, delay: 0.05 }}
                    className="flex flex-col items-center text-center p-6 rounded-2xl border border-emerald-500/30 bg-[#0d1a14] shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_35px_rgba(16,185,129,0.25)]"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                      <Check className="h-7 w-7 stroke-[2.5]" />
                    </div>
                    <h3 className="font-display mt-3.5 text-lg font-bold tracking-wider text-white uppercase">
                      Vault Unlocked
                    </h3>
                    <p className="mt-1 text-xs text-slate-300">
                      Redirecting to your dashboard…
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Bottom trust badge with AA contrast */}
          <motion.p
            variants={item}
            className="mt-3.5 flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-300"
          >
            <Lock className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            <span>Your data never leaves this device</span>
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
