import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Cpu,
  Mail,
  Shield,
  ShieldCheck,
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
 * Sign-in / registration gate — Privacy-first, Local-first Personal Finance Vault.
 *
 * Left: Deep matte charcoal background, Private On-Device Intelligence tag,
 * stark white & neon mint headline, stylized calendar heatmap activity matrix,
 * prominent glowing hardware protected microchip badge.
 * Right: Lighter dark grey background with floating frosted-glass login card,
 * UNLOCK LOCAL VAULT headline, green glowing shield password icon,
 * "Trust this device for this session", "Lost access? Reset local database",
 * and "ACCESS LOCAL LEDGER" primary action button.
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
/* Visual Primitives: Local Ledger Feed & Hardware Security Badge       */
/* ------------------------------------------------------------------ */

/**
 * Sleek, authentic Local Ledger Feed preview showcasing user entries,
 * air-gapped privacy metrics, and local intelligence.
 */
function LocalLedgerCard() {
  const reduce = useReducedMotion();

  const mockEntries = [
    {
      title: "Client Retainer Payout",
      category: "Income • Consulting",
      time: "Today, 15:30",
      amount: "+₹65,000",
      isIncome: true,
    },
    {
      title: "Organic Market & Groceries",
      category: "Food & Household",
      time: "Yesterday, 19:15",
      amount: "-₹3,450",
      isIncome: false,
    },
    {
      title: "High-Speed Fiber Network",
      category: "Utilities & Workspace",
      time: "Oct 14",
      amount: "-₹1,180",
      isIncome: false,
    },
  ];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.12 }}
      className="w-full rounded-2xl border border-white/[0.08] bg-[#0c130f]/80 p-4 sm:p-5 backdrop-blur-2xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)]"
      aria-hidden="true"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ADE80] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4ADE80]" />
          </span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-200">
            LOCAL TRANSACTION FEED
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#4ADE80]">
            ON-DEVICE SQLITE
          </span>
        </div>
      </div>

      {/* Entry Rows */}
      <div className="mt-3 divide-y divide-white/[0.05]">
        {mockEntries.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-mono font-bold",
                  item.isIncome
                    ? "border-emerald-500/30 bg-emerald-500/15 text-[#4ADE80]"
                    : "border-white/10 bg-white/[0.04] text-slate-300"
                )}
              >
                {item.isIncome ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium text-white truncate leading-tight">
                  {item.title}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5 truncate leading-tight">
                  {item.category} • {item.time}
                </span>
              </div>
            </div>
            <div
              className={cn(
                "font-mono text-[13px] font-bold shrink-0 ml-3",
                item.isIncome ? "text-[#4ADE80]" : "text-slate-200"
              )}
            >
              {item.amount}
            </div>
          </div>
        ))}
      </div>

      {/* Telemetry bottom bar */}
      <div className="mt-3.5 pt-3 border-t border-white/[0.07] grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col">
          <span className="text-[9.5px] font-mono text-slate-400 uppercase tracking-wider">
            Remote Calls
          </span>
          <span className="text-[12px] font-mono font-bold text-emerald-400 mt-0.5">
            0 KB / Offline
          </span>
        </div>
        <div className="flex flex-col border-x border-white/[0.06]">
          <span className="text-[9.5px] font-mono text-slate-400 uppercase tracking-wider">
            Data Store
          </span>
          <span className="text-[12px] font-mono font-bold text-white mt-0.5">
            Air-Gapped
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9.5px] font-mono text-slate-400 uppercase tracking-wider">
            Telemetry
          </span>
          <span className="text-[12px] font-mono font-bold text-emerald-400 mt-0.5">
            Zero Tracking
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Prominent hardware security trust badge.
 */
function HardwareSecurityBadge() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.2 }}
      className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c120e]/60 px-4 py-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] w-full"
      aria-hidden="true"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[#4ADE80]">
          <Cpu className="h-4.5 w-4.5" strokeWidth={1.8} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[12px] font-bold tracking-wider text-white uppercase truncate">
            HARDWARE-BOUND LEDGER SECURITY
          </span>
          <span className="text-[11px] font-medium text-slate-400 mt-0.5 truncate">
            AES-256 client keys reside exclusively in physical host memory
          </span>
        </div>
      </div>
      <div className="shrink-0 ml-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-[#4ADE80]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" />
          AIR-GAPPED
        </span>
      </div>
    </motion.div>
  );
}

/**
 * Ambient fluid wave background animation.
 * Smooth, continuous multi-frequency undulating oceanic waves.
 * Zero stroke borders or harsh overlay lines.
 */
function WaveBackground({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden select-none",
        className
      )}
      aria-hidden="true"
    >
      {/* Top fade gradient mask to seamlessly blend into deep background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#12161A] via-transparent to-[#12161A] z-10 pointer-events-none" />

      {/* Undulating wave viewport */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 h-[380px] sm:h-[450px] w-full",
          !reduce && "auth-wave-undulate"
        )}
      >
        {/* Layer 1: Deep rolling oceanic swell with gradient fill (no stroke line) */}
        <div
          className={cn(
            "absolute inset-0 w-[200%] flex",
            !reduce && "auth-wave-layer-1"
          )}
        >
          <svg
            viewBox="0 0 1600 380"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="wave-grad-1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                <stop offset="45%" stopColor="#059669" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#12161A" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 180 C 200 110, 200 250, 400 180 C 600 110, 600 250, 800 180 C 1000 110, 1000 250, 1200 180 C 1400 110, 1400 250, 1600 180 L 1600 380 L 0 380 Z"
              fill="url(#wave-grad-1)"
            />
          </svg>
        </div>

        {/* Layer 2: Counter-drifting harmonic wave (no stroke line) */}
        <div
          className={cn(
            "absolute inset-0 w-[200%] flex",
            !reduce && "auth-wave-layer-2"
          )}
        >
          <svg
            viewBox="0 0 1600 380"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="wave-grad-2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.16" />
                <stop offset="50%" stopColor="#0F766E" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#12161A" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 210 C 100 150, 100 270, 200 210 C 300 150, 300 270, 400 210 C 500 150, 500 270, 600 210 C 700 150, 700 270, 800 210 C 900 150, 900 270, 1000 210 C 1100 150, 1100 270, 1200 210 C 1300 150, 1300 270, 1400 210 C 1500 150, 1500 270, 1600 210 L 1600 380 L 0 380 Z"
              fill="url(#wave-grad-2)"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * Starfield animation with twinkling stars and shooting stars.
 * Rendered exclusively on the upper portion of the right-hand authentication panel.
 */
const TWINKLE_STARS = [
  { top: "6%", left: "15%", size: 2, delay: "0s", duration: "1.4s" },
  { top: "14%", left: "42%", size: 1.5, delay: "0.4s", duration: "1.8s" },
  { top: "9%", left: "75%", size: 2.5, delay: "0.2s", duration: "1.5s" },
  { top: "22%", left: "86%", size: 1.5, delay: "0.9s", duration: "2.0s" },
  { top: "18%", left: "28%", size: 2, delay: "0.6s", duration: "1.6s" },
  { top: "30%", left: "14%", size: 1, delay: "1.1s", duration: "1.7s" },
  { top: "11%", left: "62%", size: 2, delay: "0.3s", duration: "1.9s" },
  { top: "25%", left: "68%", size: 1.5, delay: "1.2s", duration: "1.5s" },
  { top: "35%", left: "52%", size: 1, delay: "0.5s", duration: "1.7s" },
  { top: "16%", left: "94%", size: 2, delay: "0.8s", duration: "1.6s" },
  { top: "5%", left: "35%", size: 1.5, delay: "1.3s", duration: "1.8s" },
  { top: "28%", left: "82%", size: 2, delay: "0.1s", duration: "1.5s" },
  { top: "38%", left: "24%", size: 1.5, delay: "0.7s", duration: "1.9s" },
  { top: "12%", left: "8%", size: 1, delay: "1.0s", duration: "1.4s" },
  { top: "32%", left: "92%", size: 1.5, delay: "0.4s", duration: "1.8s" },
];

function StarFieldAnimation() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[380px] overflow-hidden select-none z-0"
      aria-hidden="true"
    >
      {/* Soft gradient mask so stars fade gently toward the center card */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#12161A]/30 to-[#12161A] z-10 pointer-events-none" />

      {/* Blinking / Twinkling stars */}
      {TWINKLE_STARS.map((star, i) => (
        <span
          key={i}
          className="auth-star"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}

      {/* Shooting stars with glowing comet tails — fast sweeps */}
      <span
        className="auth-meteor"
        style={{ top: "10%", right: "12%", animationDelay: "0.4s", animationDuration: "3.8s" }}
      />
      <span
        className="auth-meteor"
        style={{ top: "24%", right: "36%", animationDelay: "1.8s", animationDuration: "4.5s" }}
      />
      <span
        className="auth-meteor"
        style={{ top: "8%", right: "65%", animationDelay: "3.2s", animationDuration: "4.0s" }}
      />
    </div>
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
      className="relative order-2 overflow-hidden lg:order-1 lg:flex lg:flex-col lg:h-full justify-between p-6 sm:p-8 lg:py-10 lg:px-12 xl:px-16 bg-[#0A0A0A] text-white"
      aria-label="About Batua"
    >
      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="relative z-10 flex h-full flex-col justify-between max-w-[540px] w-full mx-auto"
      >
        <div className="hidden lg:block h-2" />

        {/* Structured Headline & Visuals */}
        <div className="my-auto flex flex-col gap-5 py-2 w-full">
          {/* Header Tag Pill */}
          <motion.div variants={item}>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-3.5 py-1 text-[11px] font-mono font-semibold tracking-widest uppercase text-[#4ADE80] w-fit shadow-[0_0_15px_-3px_rgba(74,222,128,0.25)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] shadow-[0_0_8px_#4ADE80] animate-pulse" />
              LOCAL-FIRST LEDGER • AIR-GAPPED
            </div>
          </motion.div>

          {/* Primary Headline with UX text */}
          <motion.div variants={item} className="space-y-3">
            <h2 className="font-display text-[34px] sm:text-[40px] lg:text-[46px] font-bold leading-[1.08] tracking-[-0.025em] text-white uppercase">
              YOUR MONEY. <br />
              YOUR ENTRIES. <br />
              <span className="text-[#4ADE80] drop-shadow-[0_0_24px_rgba(74,222,128,0.35)]">
                ONLY ON YOUR DEVICE.
              </span>
            </h2>
            <p className="max-w-[460px] text-[14px] sm:text-[14.5px] leading-relaxed text-slate-400 font-sans">
              Private financial intelligence powered by on-device AI. Every rupee, record, and financial habit lives exclusively on your hardware. Zero telemetry.
            </p>
          </motion.div>

          {/* Visual Element: Authentic Local Ledger Feed Preview */}
          <motion.div variants={item} className="w-full">
            <LocalLedgerCard />
          </motion.div>

          {/* Hardware Security Trust Badge */}
          <motion.div variants={item} className="w-full">
            <HardwareSecurityBadge />
          </motion.div>
        </div>

        {/* Minimalist Copyright Footer */}
        <motion.footer
          variants={item}
          className="pt-2 text-[12px] font-medium text-slate-500"
        >
          <span>© 2026 Batua • Built for your financial freedom</span>
        </motion.footer>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Forgot Password Dialog                                             */
/* ------------------------------------------------------------------ */

function ForgotPasswordDialog({
  open,
  defaultUsername,
  onClose,
  onSuccess,
}: {
  open: boolean;
  defaultUsername: string;
  onClose: () => void;
  onSuccess: (username: string) => void;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername(defaultUsername);
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setSuccess(null);
    }
  }, [open, defaultUsername]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim()) return;
    if (newPassword.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/forgot-password", {
        username: username.trim(),
        new_password: newPassword,
      });
      setSuccess(data?.message || "Password reset successfully!");
      setTimeout(() => {
        onSuccess(username.trim());
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not reset password. Please check your username."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-white/10 bg-[#0e1612] text-white">
        <DialogHeader>
          <DialogTitle className="text-white font-display uppercase tracking-wide">
            Reset Password
          </DialogTitle>
          <DialogDescription className="text-slate-300 text-[13px]">
            Enter your username to set a new password for your local vault. Your existing transactions and ledger entries remain completely safe.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <p className="text-[14px] font-semibold text-emerald-400">{success}</p>
            <p className="text-[12px] text-slate-400">Ready to sign in with your new password…</p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-3.5 pt-1">
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthInput
              id="reset-username"
              label="Username"
              placeholder="Enter your username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={
                username.trim() && username.trim().length < USERNAME_MIN
                  ? `At least ${USERNAME_MIN} characters`
                  : null
              }
            />
            <AuthInput
              id="reset-new-password"
              label="New password"
              type="password"
              placeholder="Enter new password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <AuthInput
              id="reset-confirm-password"
              label="Confirm new password"
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="pt-2">
              <AuthButton
                type="submit"
                variant="gradient"
                loading={busy}
                loadingLabel="Updating password…"
                disabled={!username.trim() || !newPassword || !confirmPassword}
              >
                Reset Password
              </AuthButton>
            </div>
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
  const [forgotOpen, setForgotOpen] = useState(false);
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
      className="relative grid min-h-dvh grid-cols-1 overflow-x-hidden bg-[#0A0A0A] [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] lg:h-dvh lg:grid-cols-2 lg:overflow-hidden text-white"
      style={{
        color: "var(--auth-ink, #EDF3EF)",
        "--auth-surface": "rgba(255, 255, 255, 0.05)",
        "--auth-ink": "#EDF3EF",
        "--auth-ink-2": "#cbd5e1",
        "--auth-ink-3": "#94a3b8",
        "--auth-accent": "#4ADE80",
        "--auth-accent-soft": "rgba(74, 222, 128, 0.16)",
      } as React.CSSProperties}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg font-medium"
      >
        Skip to main content
      </a>

      <BrandPanel />

      {/* 1px panel seam divider */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-1/2 hidden w-px bg-white/[0.08] lg:block z-20"
        aria-hidden="true"
      />

      <main
        id="main-content"
        className="relative z-10 order-1 flex min-h-0 items-center justify-center px-4 py-6 sm:px-8 lg:order-2 lg:h-full lg:px-10 xl:px-14 lg:py-6 overflow-y-auto overflow-x-hidden bg-[#12161A]"
      >
        {/* Shooting stars & twinkling stars across the upper sky of right side only */}
        <StarFieldAnimation />

        {/* Ambient fluid wave animation in the lower canvas of right side only */}
        <WaveBackground className="opacity-30" />

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
          {/* Glassmorphic card */}
          <motion.div
            variants={item}
            className={cn(
              "relative w-full rounded-[28px] p-6 sm:p-7 backdrop-blur-2xl transition-all duration-200",
              "bg-[#0e1411]/85 border border-white/[0.09]",
              "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.14),0_24px_50px_-12px_rgba(0,0,0,0.8)]",
              "focus-within:border-emerald-500/40 focus-within:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.18),0_24px_50px_-12px_rgba(0,0,0,0.8),0_0_30px_-5px_rgba(74,222,128,0.22)]"
            )}
          >
            {/* Gradient hairline on top edge */}
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#4ADE80]/50 to-transparent"
              aria-hidden="true"
            />

            {/* Logo header: Batua logo icon + BATUA wordmark + UNLOCK LOCAL VAULT */}
            <motion.div variants={item} className="flex flex-col items-center text-center mb-4">
              <Logo className="h-10 w-10 shrink-0 text-white" />
              <span className="mt-1.5 font-brand text-[20px] uppercase leading-none tracking-[0.16em] text-white">
                BATUA
              </span>
              <h1 className="mt-2.5 font-display text-[19px] sm:text-[21px] font-bold tracking-wider text-white uppercase">
                {mode === "login" ? "UNLOCK LOCAL VAULT" : "CREATE LOCAL VAULT"}
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
                icon={
                  <ShieldCheck
                    className={cn(
                      "h-[18px] w-[18px] transition-all duration-200",
                      form.password.length >= PASSWORD_MIN
                        ? "text-[#4ADE80] drop-shadow-[0_0_8px_rgba(74,222,128,0.85)] scale-105"
                        : "text-slate-400"
                    )}
                    strokeWidth={1.75}
                  />
                }
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
                  icon={
                    <ShieldCheck
                      className={cn(
                        "h-[18px] w-[18px] transition-all duration-200",
                        form.confirm.length >= PASSWORD_MIN && form.password === form.confirm
                          ? "text-[#4ADE80] drop-shadow-[0_0_8px_rgba(74,222,128,0.85)] scale-105"
                          : "text-slate-400"
                      )}
                      strokeWidth={1.75}
                    />
                  }
                  value={form.confirm}
                  onChange={set("confirm")}
                  onBlur={() => setConfirmTouched(true)}
                  error={confirmError}
                />
              )}

              {mode === "login" && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {/* Custom checkbox with emerald checkmark */}
                  <label className="flex cursor-pointer items-center gap-2.5 text-[12px] sm:text-[12.5px] font-medium text-slate-300 transition-colors hover:text-white select-none">
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
                    <span>Trust this device for this session</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="cursor-pointer shrink-0 text-[12px] sm:text-[12.5px] font-medium text-emerald-400 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Primary Action Button: ACCESS LOCAL LEDGER */}
              <motion.button
                type="submit"
                disabled={busy || succeeded}
                whileHover={succeeded || busy ? undefined : { scale: 1.015 }}
                whileTap={succeeded || busy ? undefined : { scale: 0.985 }}
                aria-label={mode === "login" ? "ACCESS LOCAL LEDGER" : "CREATE LOCAL VAULT"}
                className={cn(
                  "auth-sheen group relative flex h-12 w-full items-center justify-center gap-2 rounded-full font-bold text-[14px] sm:text-[14.5px] tracking-wide transition-all duration-200 cursor-pointer mt-2 overflow-hidden",
                  "bg-gradient-to-r from-[#34D399] via-[#10B981] to-[#059669] text-slate-950",
                  "shadow-[0_0_24px_rgba(74,222,128,0.4),0_2px_8px_rgba(16,185,129,0.3)]",
                  "hover:brightness-105 hover:shadow-[0_0_32px_rgba(74,222,128,0.6)] active:translate-y-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09110d]",
                  "disabled:pointer-events-none disabled:opacity-60"
                )}
              >
                {busy ? (
                  <span className="flex items-center gap-2 font-mono uppercase tracking-wider text-[13px]">
                    <span className="auth-spinner border-slate-950 border-r-transparent" aria-hidden="true" />
                    <span>{mode === "login" ? "Unlocking vault…" : "Creating vault…"}</span>
                  </span>
                ) : succeeded ? (
                  <motion.span
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="flex items-center gap-2 font-mono uppercase tracking-wider text-[13px]"
                  >
                    <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" />
                    <span>Vault Unlocked</span>
                  </motion.span>
                ) : (
                  <span className="flex items-center justify-center gap-2 font-mono uppercase tracking-wider text-[13px]">
                    <span>{mode === "login" ? "ACCESS LOCAL LEDGER" : "CREATE LOCAL VAULT"}</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1.5" aria-hidden="true" />
                  </span>
                )}
              </motion.button>
            </motion.form>

            {/* Mode switch toggle */}
            <p className="mt-4 text-center text-[13px] text-slate-400">
              {mode === "login" ? "Don't have a vault? " : "Already have a vault? "}
              <button
                type="button"
                onClick={switchMode}
                aria-label={mode === "login" ? "Create local account" : "Unlock local vault"}
                className="cursor-pointer font-semibold text-[#4ADE80] transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded underline-offset-2 hover:underline"
              >
                {mode === "login" ? "Create local account" : "Unlock local vault"}
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

          {/* Bottom trust badge */}
          <motion.p
            variants={item}
            className="mt-4 flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-400"
          >
            <ShieldCheck className="h-4 w-4 text-[#4ADE80]" aria-hidden="true" />
            <span>Your data never leaves this device.</span>
          </motion.p>

          <ForgotPasswordDialog
            open={forgotOpen}
            defaultUsername={form.username}
            onClose={() => setForgotOpen(false)}
            onSuccess={(uname) => {
              setForm((f) => ({ ...f, username: uname, password: "" }));
              setBanner({ kind: "warning", text: "Password reset successfully. Sign in with your new password." });
            }}
          />
        </motion.div>
      </main>
    </div>
  );
}

