import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Fingerprint, Lock, Mail, PiggyBank, User, type LucideIcon } from "lucide-react";

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
 * Sign-in / registration gate — "soft glass fintech".
 *
 * Left: a brand panel with an overlapping hero of floating glass
 * cards (balance, budget, savings gauge, daily-spend bars), callout
 * chips on leader lines, and one atmospheric gradient field. Right:
 * a single frosted sign-in card that carries only what is needed to
 * act. Every surface reads from the `--auth-*` tokens so light and
 * dark share one definition.
 *
 * Auth behavior is unchanged from the previous version: same
 * endpoints, same session flow, same generic error messages.
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
/* SVG chart primitives (the hero cards)                              */
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

/**
 * The one product visual: balance + trend.
 *
 * A gradient area chart with a dashed forecast tail, a hatched
 * "projected" zone, and a marker dot with a tooltip chip. The line
 * draws itself in on mount (stroke-dashoffset, transform-free).
 */
function BalanceCard() {
  const reduce = useReducedMotion();
  const path = React.useMemo(() => sparkPath(SPARK, 320, 64), []);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.1 }}
      className="auth-card auth-depth-2 w-full max-w-[380px] p-6"
      style={{ "--auth-tilt": "1deg" } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="flex items-end justify-between pb-2">
        <div>
          <p className="font-auth text-[12px] font-semibold uppercase tracking-[0.12em] text-[color:var(--auth-ink-3)]">
            Total balance
          </p>
          <p
            className={cn(
              "mt-1 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[color:var(--auth-ink)]",
              !reduce && "auth-count-up"
            )}
          >
            ₹2,84,930
          </p>
        </div>
        <span className="mb-1 flex items-center gap-0.5 rounded-full bg-[color:var(--auth-accent-soft)] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-[color:var(--auth-accent-deep)]">
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M5 8.5v-6M2.5 5 5 2.5 7.5 5" />
          </svg>
          4.2%
        </span>
      </div>

      <svg viewBox="0 0 320 96" className="mt-5 h-[92px] w-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="auth-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--auth-accent)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--auth-accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="auth-spark-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="50%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <pattern id="auth-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--auth-accent)" opacity="0.05" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--auth-accent)" strokeWidth="1" opacity="0.22" />
          </pattern>
          <filter id="auth-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="var(--auth-ink)" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* projected zone — hatched, from the forecast split to the right edge */}
        <rect x="224" y="0" width="96" height="96" fill="url(#auth-hatch)" />
        <line x1="224" y1="0" x2="224" y2="96" stroke="var(--auth-ink-3)" strokeOpacity="0.25" strokeDasharray="2 4" />

        {/* area + actual line */}
        <path d={`${path} L320 96 L0 96 Z`} fill="url(#auth-spark-fill)" />
        <path
          d={path}
          fill="none"
          stroke="url(#auth-spark-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="auth-spark-line"
          pathLength={1}
        />
        {/* forecast tail — dashed continuation of the trend */}
        <path
          d="M224 20 L258 13 L292 6"
          fill="none"
          stroke="var(--auth-accent)"
          strokeOpacity="0.65"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 5"
        />

        {/* marker: vertical rule, dot, and tooltip chip */}
        <line x1="180" y1="0" x2="180" y2="96" stroke="var(--auth-accent)" strokeOpacity="0.35" strokeWidth="1" />
        <circle cx="180" cy="22" r="4" fill="var(--auth-accent)" stroke="var(--auth-page)" strokeWidth="2" />
        <g transform="translate(135,0)" filter="url(#auth-tooltip-shadow)">
          <rect width="68" height="24" rx="12" fill="var(--auth-ink)" />
          <text x="34" y="16" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--auth-page)" fontFamily="inherit">
            ₹2.84L
          </text>
        </g>
      </svg>

      <p className="mt-4 text-[12px] text-[color:var(--auth-ink-3)]">
        Stored on this device
      </p>
    </motion.div>
  );
}

/**
 * Budget card: a segmented "battery" bar, rounded segments filled to
 * 70% with the signature gradient. Fills sequentially on mount.
 */
function BudgetCard() {
  const reduce = useReducedMotion();
  const SEGMENTS = 10;
  const FILLED = 7;
  const PER_SEGMENT = 3000; // ₹30,000 / 10 segments

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.2 }}
      className="auth-card auth-depth-1 w-[190px] p-4"
      style={{ "--auth-tilt": "-1.5deg" } as React.CSSProperties}
      aria-hidden="true"
    >
      <p className="font-auth text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--auth-ink-3)]">
        Monthly budget used
      </p>
      <p className="mt-1 text-[20px] font-semibold tracking-[-0.01em] tabular-nums text-[color:var(--auth-ink)]">
        70<span className="text-[13px] font-medium text-[color:var(--auth-ink-3)]">%</span>
      </p>
      <div className="mt-3 flex gap-1" role="presentation">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full cursor-pointer transition-transform hover:scale-110",
              i < FILLED
                ? "auth-gradient auth-segment"
                : "bg-[color:var(--auth-track)]",
              !reduce && i < FILLED && "auth-fill-in",
            )}
            style={!reduce && i < FILLED ? { animationDelay: `${0.12 + i * 0.05}s` } : undefined}
            title={`₹${(i + 1) * PER_SEGMENT}`}
          />
        ))}
      </div>
      <p className="mt-2.5 text-[11px] tabular-nums text-[color:var(--auth-ink-3)]">
        ₹21,000 of ₹30,000
      </p>
    </motion.div>
  );
}

/**
 * Savings gauge: a semi-circular arc whose fill sweeps to 50%.
 * The arc draws in on mount (stroke-dashoffset).
 */
function SavingsGauge() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.28 }}
      className="auth-card auth-depth-0 w-[168px] p-4"
      style={{ "--auth-tilt": "1.5deg" } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 66" className="h-[56px] w-full" aria-hidden="true">
        <defs>
          <linearGradient id="auth-gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="50%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        {/* track — faint full arc */}
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--auth-track)" strokeWidth="12" strokeLinecap="round" opacity="0.4" />
        {/* fill — 50% of the semicircle's arc length */}
        <path
          d="M10 60 A50 50 0 0 1 110 60"
          fill="none"
          stroke="url(#auth-gauge)"
          strokeWidth="12"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={reduce ? "1 0" : "0.5 1"}
          className={!reduce ? "auth-gauge-sweep" : undefined}
        />
        {/* end-dot exactly on the arc end */}
        <circle cx="110" cy="60" r="4" fill="var(--auth-accent)" />
      </svg>
      <p className="-mt-5 text-center text-[22px] font-semibold tracking-[-0.01em] tabular-nums text-[color:var(--auth-ink)]">
        50<span className="text-[13px] font-medium text-[color:var(--auth-ink-3)]">%</span>
      </p>
      <p className="mt-0.5 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--auth-ink-2)]">
        Savings rate
      </p>
    </motion.div>
  );
}

/**
 * Daily-spend card: a mini dual-tone rounded bar chart —
 * green for spent, muted for remaining.
 */
function DailySpend() {
  const reduce = useReducedMotion();
  const BARS = [55, 80, 40, 65, 90, 48, 72];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.36 }}
      className="auth-card auth-depth-1 w-[150px] p-4"
      style={{ "--auth-tilt": "-1deg" } as React.CSSProperties}
      aria-hidden="true"
    >
      <p className="font-auth text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--auth-ink-3)]">
        Daily spending
      </p>
      <div className="mt-3 flex h-16 items-end gap-1.5">
        {BARS.map((v, i) => (
          <span key={i} className="flex h-full flex-1 flex-col justify-end gap-1">
            {/* spent */}
            <span
              className={cn("w-full rounded-[4px] auth-gradient", !reduce && "auth-fill-in")}
              style={{
                height: `${v}%`,
                animationDelay: !reduce ? `${0.25 + i * 0.05}s` : undefined,
                transformOrigin: "bottom",
              }}
            />
            {/* remaining */}
            <span className="w-full rounded-[4px] bg-[color:var(--auth-track)]" style={{ height: `${100 - v}%` }} />
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] tabular-nums text-[color:var(--auth-ink-3)]">
        This week · ₹8,240
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Callout chips with leader lines                                     */
/* ------------------------------------------------------------------ */

const CHIPS = [
  { icon: Lock, label: "Encrypted locally", style: { top: "2%", left: "0%" }, rotate: "-2deg" },
  { icon: Fingerprint, label: "On-device vault", style: { top: "12%", right: "0%" }, rotate: "1.5deg" },
  { icon: Check, label: "Zero uploads", style: { bottom: "20%", left: "0%" }, rotate: "1.5deg" },
  {
    icon: PiggyBank,
    label: "Saved this month ₹12,400",
    style: { bottom: "0%", right: "0%" },
    rotate: "-1.5deg",
  },
] as const;

/** A floating chip: soft icon circle + label, on a thin leader line.
 *  `position` is where it floats; `className` carries the
 *  responsive visibility classes. */
function CalloutChip({
  icon: Icon,
  label,
  position,
  className,
  rotate,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  position: React.CSSProperties;
  className?: string;
  rotate: string;
  delay: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      transition={{ ...ease, delay }}
      className={cn(
        "auth-chip absolute z-50 flex items-center gap-2.5 cursor-pointer",
        className
      )}
      style={{ rotate, ...position }}
      aria-hidden="true"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] auth-gradient text-white shadow-sm">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="whitespace-nowrap font-auth text-[12.5px] font-semibold text-[color:var(--auth-ink)]">
        {label}
      </span>
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
      className="relative order-2 overflow-hidden lg:order-1 lg:flex lg:flex-col"
      style={{ background: "var(--auth-brand-grad)" }}
      aria-label="About Batua"
    >
      <div className="auth-aurora" aria-hidden="true">
        <span className="auth-aurora-a" />
        <span className="auth-aurora-b" />
        <span className="auth-aurora-c" />
      </div>
      <div className="auth-grain" aria-hidden="true" />

      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="relative z-10 flex h-full flex-col justify-between p-8 lg:p-12"
      >
        {/* Logo */}
        <motion.div variants={item} className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl auth-gradient">
            <Logo className="h-6 w-6" />
          </span>
          <span className="font-auth text-[20px] font-bold tracking-[-0.01em] text-white">
            Batua
          </span>
        </motion.div>

        {/* Hero content */}
        <div className="flex flex-col gap-12">
          {/* Headline */}
          <motion.div variants={item} className="max-w-[540px] space-y-6">
            <h2 className="font-auth text-[40px] font-bold leading-[1.1] tracking-[-0.03em] text-white lg:text-[56px] lg:leading-[1.08]">
              Your finances,
              <br />
              <span className="auth-gradient-text">your device,</span>
              <br />
              your control.
            </h2>
            <p className="max-w-[480px] text-[16px] font-medium leading-[1.7] text-[#b8c1d0]/90 lg:text-[17px]">
              A personal finance app that keeps your data where it belongs—on your device. No cloud uploads, no data sharing, just complete privacy.
            </p>
          </motion.div>

          {/* Single hero card */}
          <motion.div variants={item} className="mx-auto w-full max-w-[500px] lg:mx-0">
            <BalanceCard />
          </motion.div>

          {/* Feature pills */}
          <motion.div variants={item} className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2.5 rounded-full border border-white/12 bg-gradient-to-br from-white/8 to-white/4 px-5 py-2.5 shadow-sm backdrop-blur-md transition-all hover:border-white/20 hover:from-white/10 hover:to-white/6">
              <Lock className="h-[18px] w-[18px] text-emerald-400" strokeWidth={2} />
              <span className="text-[13.5px] font-semibold text-white/95">Encrypted locally</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-full border border-white/12 bg-gradient-to-br from-white/8 to-white/4 px-5 py-2.5 shadow-sm backdrop-blur-md transition-all hover:border-white/20 hover:from-white/10 hover:to-white/6">
              <Fingerprint className="h-[18px] w-[18px] text-emerald-400" strokeWidth={2} />
              <span className="text-[13.5px] font-semibold text-white/95">On-device storage</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-full border border-white/12 bg-gradient-to-br from-white/8 to-white/4 px-5 py-2.5 shadow-sm backdrop-blur-md transition-all hover:border-white/20 hover:from-white/10 hover:to-white/6">
              <Check className="h-[18px] w-[18px] text-emerald-400" strokeWidth={2} />
              <span className="text-[13.5px] font-semibold text-white/95">Zero cloud sync</span>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.footer
          variants={item}
          className="flex flex-col items-start gap-1 text-[13px] font-medium text-[#6b7482]"
        >
          <span className="font-auth">© 2026 Batua</span>
          <span className="text-[12px] text-[#6b7482]">
            Personal finance, privately managed
          </span>
        </motion.footer>
      </motion.div>
    </section>
  );
}

/**
 * Gentle cursor parallax for the hero cards (max ~8px). The listener
 * is passive and the rAF loop stops on unmount; disabled entirely
 * for reduced motion or coarse pointers.
 */
function HeroParallax({
  children,
  reduce,
}: {
  children: React.ReactNode;
  reduce: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduce) return undefined;
    // Also disable on touch devices for performance
    const isTouch = typeof window !== "undefined" && (
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window
    );
    if (isTouch) return undefined;

    const el = ref.current;
    if (!el) return undefined;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      el.style.transform = `translate3d(${(cx * 8).toFixed(2)}px, ${(cy * 8).toFixed(2)}px, 0)`;
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
    <div ref={ref} className="absolute inset-0 will-change-transform">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recovery dialog (the "forgot password" path)                       */
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
      // The server requires the current password: the token
      // replaces the password, so only someone who already
      // holds it may mint one.
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
            <AuthInput
              id="recovery-password"
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <AuthButton type="submit" variant="primary" loading={busy} loadingLabel="Creating…" disabled={!username.trim() || !password}>
              Create token
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
      className="relative grid h-dvh grid-cols-1 overflow-hidden bg-[color:var(--auth-page)] [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] lg:grid-cols-[55fr_45fr]"
      style={{ color: "var(--auth-ink)" }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] bg-[color:var(--auth-accent)] text-white px-4 py-2 rounded-lg font-medium"
      >
        Skip to main content
      </a>
      <AuthBackdrop />

      <BrandPanel />

      <div className="auth-panel-seam hidden lg:block" aria-hidden="true" />

      <main id="main-content" className="relative z-10 order-1 min-h-0 overflow-y-auto px-4 py-8 sm:px-10 lg:order-2 lg:flex lg:px-14 lg:py-0">
        <motion.div
          variants={reduce ? noMotion : staggerContainer}
          initial="hidden"
          animate="show"
          className="m-auto w-full max-w-[420px]"
        >
          {/* The sign-in card — premium glass with enhanced depth */}
          <motion.div variants={item} className="auth-signin-card auth-top-highlight">
            <motion.div variants={item} className="flex flex-col items-center text-center">
              <span className="relative flex items-center gap-2.5 rounded-full border border-[color:var(--auth-line)] bg-gradient-to-br from-[color:var(--auth-surface)] to-[color:var(--auth-surface-2)] px-4 py-1.5 text-[12.5px] font-semibold text-[color:var(--auth-ink)] shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--auth-accent)] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--auth-accent)]" />
                </span>
                {mode === "login" ? "Welcome back" : "New account"}
              </span>
              <motion.h1
                variants={item}
                className="mt-4 text-[28px] font-bold tracking-[-0.025em] text-[color:var(--auth-ink)] lg:text-[30px]"
              >
                {mode === "login" ? "Sign in" : "Create account"}
              </motion.h1>
              <motion.p variants={item} className="mt-2 text-[14.5px] leading-relaxed text-[color:var(--auth-ink-2)]">
                {mode === "login"
                  ? "Enter your credentials to access your vault."
                  : "A local account — nothing leaves this device."}
              </motion.p>
            </motion.div>

            {banner && (
              <motion.div variants={item} className="mt-5" aria-live="polite">
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
              className="mt-6 space-y-5"
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
                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-[color:var(--auth-ink-2)]">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                      className="auth-toggle"
                    />
                    Remember this device
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecoveryOpen(true)}
                    className="cursor-pointer rounded-md px-1 py-1 text-[13.5px] font-medium text-[color:var(--auth-accent)] transition-colors hover:text-[color:var(--auth-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <AuthButton
                type="submit"
                variant="gradient"
                loading={busy}
                loadingLabel={mode === "login" ? "Signing in…" : "Creating account…"}
                disabled={succeeded}
                success={succeeded}
                withArrow={!succeeded}
              >
                {succeeded ? "Signed in" : mode === "login" ? "Sign in" : "Create account"}
              </AuthButton>

              {/* Passkey path — disabled until the backend issues a
                  WebAuthn challenge: a button that visibly does
                  nothing reads as broken. Re-enable this block when
                  POST /auth/passkey-options exists. */}
              {false && mode === "login" && typeof window !== "undefined" &&
                (window.PublicKeyCredential !== undefined) && (
                  <>
                    <div className="flex items-center gap-3" aria-hidden="true">
                      <span className="h-px flex-1 bg-[color:var(--auth-line)]" />
                      <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-[color:var(--auth-ink-3)]">
                        or
                      </span>
                      <span className="h-px flex-1 bg-[color:var(--auth-line)]" />
                    </div>
                    <PasskeyButton />
                  </>
                )}
            </motion.form>
          </motion.div>

          <motion.p variants={item} className="mt-6 text-center text-[14px] text-[color:var(--auth-ink-2)]">
            {mode === "login" ? "New to Batua? " : "Already have an account? "}
            <button
              type="button"
              onClick={switchMode}
              className="cursor-pointer font-medium text-[color:var(--auth-accent)] transition-colors hover:text-[color:var(--auth-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </motion.p>

          <motion.p
            variants={item}
            className="mt-4 flex items-center justify-center gap-1.5 text-[12.5px] text-[color:var(--auth-ink-3)]"
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            Your data never leaves this device
          </motion.p>

          <RecoveryDialog open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
        </motion.div>
      </main>
    </div>
  );
}

/**
 * "Unlock with device biometrics / passkey".
 *
 * Renders only when WebAuthn is available (the parent checks
 * `window.PublicKeyCredential`). The click handler is a stub —
 * the passkey ceremony needs the server's challenge, which the
 * backend doesn't issue yet. Wire up `onPasskey` here once
 * POST /auth/passkey-options exists.
 */
function PasskeyButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // TODO: wire to the passkey ceremony once the backend
        // issues a challenge. Until then it's a no-op.
      }}
      className="auth-card flex h-[52px] w-full items-center justify-center gap-2.5 text-[14.5px] font-medium text-[color:var(--auth-ink)] transition-transform duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
    >
      <Fingerprint className="h-[19px] w-[19px] text-[color:var(--auth-accent)]" aria-hidden="true" />
      Unlock with device biometrics / passkey
    </button>
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
