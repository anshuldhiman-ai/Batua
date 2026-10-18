import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Fingerprint,
  Lock,
  LogIn,
  Mail,
  Shield,
  ShieldCheck,
  User,
  Zap,
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
import { fadeUp, noMotion, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sign-in / registration gate — Privacy-first, Local-first Personal Finance Vault.
 *
 * Left: near-black brand panel — logo lockup, the promise headline (white →
 * mint), the three trust pillars divided by hairlines, and the ambient ocean
 * swell along the bottom. A hairline seam with a single glowing node splits
 * the screen.
 * Right: deep charcoal canvas, starfield above, a frosted-glass card holding
 * the batua crest, "Sign in", the two fields, the primary "Unlock Batua"
 * action, and the quieter "Use Device Unlock" path below an "or" rule.
 *
 * The whole surface is intentionally dark regardless of the app theme (the
 * brand lockup reads on charcoal only), so every colour it needs is pinned on
 * the page root instead of borrowed from the app's light/dark scale.
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

const MINT = "#4ADE80";
const INK_2 = "#C9D6CE";
const INK_3 = "#8FA396";

/** The three trust pillars under the headline. */
const PILLARS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Lock, title: "100% Offline", desc: "Your data, local only" },
  { icon: Zap, title: "Instant Access", desc: "No cloud sync needed" },
  { icon: ShieldCheck, title: "Bank-Grade Security", desc: "AES-256 Encryption" },
];

/* ------------------------------------------------------------------ */
/* Ambient layers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Ambient fluid wave background animation.
 * Smooth, continuous multi-frequency undulating oceanic waves.
 * Zero stroke borders or harsh overlay lines.
 *
 * The swell is faded in with a top-only mask, so the crest stays crisp and
 * fully saturated all the way down to the panel edge — no opaque colour band
 * screening it off, and no dependency on the surface colour behind it.
 */
function WaveBackground({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  // Unique gradient ids per instance — two of these sit side by side, and a
  // duplicate <linearGradient id> would make both panels resolve to one def.
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // The swell rises out of the panel edge. A top-only mask dissolves the crest
  // into the surface without painting an opaque band over the wave itself.
  const waveFade =
    "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,1) 55%)";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden select-none",
        className
      )}
      aria-hidden="true"
    >
      {/* Undulating wave viewport */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 h-[360px] sm:h-[440px] w-full",
          !reduce && "auth-wave-undulate"
        )}
        style={{ maskImage: waveFade, WebkitMaskImage: waveFade }}
      >
        {/* Layer 1: Deep rolling oceanic swell with gradient fill (no stroke line) */}
        <div
          className={cn(
            "absolute inset-0 w-[200%] flex",
            !reduce && "auth-wave-layer-1"
          )}
        >
          <svg
            viewBox="0 -70 1600 450"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`wave-grad-1-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B77A" stopOpacity="0.40" />
                <stop offset="42%" stopColor="#047754" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#022C22" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path
              d="M 0 180 C 200 110, 200 250, 400 180 C 600 110, 600 250, 800 180 C 1000 110, 1000 250, 1200 180 C 1400 110, 1400 250, 1600 180 L 1600 380 L 0 380 Z"
              fill={`url(#wave-grad-1-${uid})`}
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
            viewBox="0 -70 1600 450"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`wave-grad-2-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.28" />
                <stop offset="50%" stopColor="#03543C" stopOpacity="0.13" />
                <stop offset="100%" stopColor="#022C22" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 210 C 100 150, 100 270, 200 210 C 300 150, 300 270, 400 210 C 500 150, 500 270, 600 210 C 700 150, 700 270, 800 210 C 900 150, 900 270, 1000 210 C 1100 150, 1100 270, 1200 210 C 1300 150, 1300 270, 1400 210 C 1500 150, 1500 270, 1600 210 L 1600 380 L 0 380 Z"
              fill={`url(#wave-grad-2-${uid})`}
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

  const starFade =
    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[380px] overflow-hidden select-none z-0"
      aria-hidden="true"
      style={{ maskImage: starFade, WebkitMaskImage: starFade }}
    >
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
      {/* Ambient ocean swell along the bottom edge */}
      <WaveBackground className="opacity-90" />

      {/* Soft emerald bloom in the upper-left corner */}
      <div
        className="pointer-events-none absolute -left-24 -top-28 h-[420px] w-[420px] rounded-full bg-emerald-500/[0.10] blur-[120px]"
        aria-hidden="true"
      />

      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="relative z-10 flex h-full w-full max-w-[680px] flex-col justify-between mx-auto"
      >
        {/* Brand lockup: crest + wordmark | descriptor */}
        <motion.div variants={item} className="flex items-center gap-3.5 sm:gap-5">
          <motion.span
            whileHover={reduce ? undefined : { scale: 1.08, rotate: -5 }}
            transition={{ type: "spring", stiffness: 320, damping: 16 }}
            className="shrink-0"
          >
            <Logo className="h-10 w-10 lg:h-11 lg:w-11" />
          </motion.span>
          <span className="font-brand text-[20px] uppercase leading-none tracking-[0.2em] text-white sm:text-[22px] lg:text-[24px]">
            BATUA
          </span>
          <span aria-hidden="true" className="h-7 w-px bg-white/15 lg:h-8" />
          <span className="text-[13.5px] font-medium text-[#8FA396] sm:text-[15px] lg:text-[16px]">
            Personal, Private Finance
          </span>
        </motion.div>

        {/* Headline, promise and trust pillars */}
        <div className="relative my-auto flex w-full flex-col gap-8 py-10 lg:gap-12 lg:py-14">
          {/* Slow breathing bloom behind the headline */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 top-0 h-[340px] w-[340px] rounded-full bg-emerald-500/[0.07] blur-[110px]"
            animate={reduce ? undefined : { opacity: [0.55, 1, 0.55], scale: [1, 1.08, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative space-y-6">
            <motion.h2
              variants={item}
              className="font-display text-[34px] font-bold leading-[1.06] tracking-[-0.025em] text-white sm:text-[46px] lg:text-[54px] xl:text-[58px]"
            >
              Take control of your money,{" "}
              <span className="block text-[#4ADE80] drop-shadow-[0_0_28px_rgba(74,222,128,0.35)]">
                without giving up your privacy.
              </span>
            </motion.h2>
            <motion.p
              variants={item}
              className="max-w-[560px] text-[14.5px] leading-[1.7] text-[#8FA396] sm:text-[16px] lg:text-[17px]"
            >
              A personal finance app that keeps your data on your device.
              <br />
              Track, plan and grow – all offline, all yours.
            </motion.p>
          </div>

          <motion.ul
            variants={item}
            className="relative grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-y-0"
          >
            {PILLARS.map((pillar, i) => (
              <li
                key={pillar.title}
                className={cn(
                  "group flex items-start gap-3.5 transition-transform duration-300 ease-out sm:hover:-translate-y-0.5",
                  i > 0 &&
                    "sm:border-l sm:border-white/[0.12] sm:pl-6 sm:transition-colors sm:hover:border-white/[0.22]",
                  i < PILLARS.length - 1 && "sm:pr-6"
                )}
              >
                <pillar.icon
                  className="mt-0.5 h-6 w-6 shrink-0 text-[#4ADE80] transition-all duration-300 ease-out group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_rgba(74,222,128,0.6)] lg:h-[26px] lg:w-[26px]"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-white lg:text-[16px]">
                    {pillar.title}
                  </div>
                  <div className="mt-1 text-[13px] leading-snug text-[#8FA396] transition-colors duration-300 group-hover:text-[#C9D6CE] lg:text-[13.5px]">
                    {pillar.desc}
                  </div>
                </div>
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Minimalist copyright footer */}
        <motion.footer
          variants={item}
          className="text-[12.5px] font-medium text-[#6B7D70] lg:text-[13px]"
        >
          © 2026 Batua
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
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [rememberDevice, setRememberDevice] = useState(false);
  const attemptsRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  const strength = React.useMemo(() => passwordStrength(form.password), [form.password]);
  const item = reduce ? noMotion : fadeUp;

  const isLogin = mode === "login";

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
      setDeviceNotice(null);
      return m === "login" ? "register" : "login";
    });

  return (
    <div
      className="relative grid min-h-dvh grid-cols-1 overflow-x-hidden bg-[#0A0A0A] [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] lg:h-dvh lg:grid-cols-2 lg:overflow-hidden text-white"
      style={{
        color: "var(--auth-ink, #EDF3EF)",
        // Auth surface tokens — pinned (dark) rather than inherited, so the
        // branded sign-in reads identically in light and dark app themes.
        "--auth-page": "#0A0F0D",
        "--auth-panel": "rgba(255, 255, 255, 0.04)",
        "--auth-surface": "rgba(255, 255, 255, 0.05)",
        "--auth-ink": "#EDF3EF",
        "--auth-ink-2": INK_2,
        "--auth-ink-3": INK_3,
        "--auth-line-strong": "rgba(255, 255, 255, 0.18)",
        "--auth-accent": MINT,
        "--auth-accent-hover": "#6EE7A8",
        "--auth-accent-soft": "rgba(74, 222, 128, 0.16)",
        "--auth-accent-ink": "#05231A",
        "--auth-error": "#F0826F",
        "--auth-error-soft": "rgba(240, 130, 111, 0.16)",
        "--auth-warning": "#E8B04B",
        // The inline <Logo> paints itself from the app's --foreground/--primary;
        // scope both here so the crest is always light-on-charcoal with mint
        // coin rings, whatever theme the app itself is in.
        "--foreground": "0 0% 100%",
        "--primary": "158 84% 45%",
      } as React.CSSProperties}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-[100] bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg font-medium"
      >
        Skip to main content
      </a>

      <BrandPanel />

      <main
        id="main-content"
        className="relative z-10 order-1 flex min-h-0 items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 lg:order-2 lg:h-full lg:px-10 lg:py-6 xl:px-14"
        style={{
          // Layered premium surface: a cool emerald bloom up top, a teal
          // undertow from the lower left, over a deep vertical charcoal base.
          background:
            "radial-gradient(115% 80% at 82% 4%, rgba(16, 185, 129, 0.14) 0%, transparent 55%)," +
            "radial-gradient(100% 70% at 10% 100%, rgba(5, 150, 105, 0.13) 0%, transparent 60%)," +
            "linear-gradient(168deg, #0C1417 0%, #101B1E 44%, #070C0E 100%)",
        }}
      >
        {/* Shooting stars & twinkling stars across the upper sky */}
        <StarFieldAnimation />

        {/* Soft emerald lift behind the card so it reads as the focal point */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.10] blur-[120px]"
          aria-hidden="true"
        />

        <motion.div
          variants={reduce ? noMotion : staggerContainer}
          initial="hidden"
          animate="show"
          className="m-auto w-full max-w-[430px] py-2"
        >
          {/* Glassmorphic card */}
          <motion.div
            variants={item}
            className={cn(
              "relative w-full rounded-[32px] p-6 sm:p-8 backdrop-blur-2xl transition-all duration-200",
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

            {/* Heading — the card opens straight on the action */}
            <motion.div variants={item} className="flex flex-col items-center text-center">
              <h1 className="font-display text-[26px] font-bold tracking-tight text-white sm:text-[30px]">
                {isLogin ? "Sign in" : "Create your vault"}
              </h1>
              <p className="mt-1.5 text-[13.5px]" style={{ color: INK_3 }}>
                {isLogin ? "Access your local finance vault." : "Set up your local finance vault."}
              </p>
            </motion.div>

            {banner && (
              <motion.div variants={item} className="mt-4" aria-live="polite">
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
              className="mt-5 space-y-4"
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
                  <Lock
                    className={cn(
                      "h-[18px] w-[18px] transition-all duration-200",
                      form.password.length >= PASSWORD_MIN
                        ? "text-[#4ADE80] drop-shadow-[0_0_8px_rgba(74,222,128,0.85)]"
                        : ""
                    )}
                    style={form.password.length >= PASSWORD_MIN ? undefined : { color: INK_3 }}
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
                    <Lock
                      className={cn(
                        "h-[18px] w-[18px] transition-all duration-200",
                        form.confirm.length >= PASSWORD_MIN && form.password === form.confirm
                          ? "text-[#4ADE80] drop-shadow-[0_0_8px_rgba(74,222,128,0.85)]"
                          : ""
                      )}
                      style={
                        form.confirm.length >= PASSWORD_MIN && form.password === form.confirm
                          ? undefined
                          : { color: INK_3 }
                      }
                      strokeWidth={1.75}
                    />
                  }
                  value={form.confirm}
                  onChange={set("confirm")}
                  onBlur={() => setConfirmTouched(true)}
                  error={confirmError}
                />
              )}

              {isLogin && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {/* Custom checkbox with emerald checkmark */}
                  <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium transition-colors hover:text-white select-none" style={{ color: INK_2 }}>
                    <span className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                        className="peer sr-only"
                      />
                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border border-white/20 bg-white/[0.04] transition-all peer-checked:border-emerald-500 peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[#09110d] shadow-inner">
                        <Check
                          className={cn(
                            "h-3 w-3 stroke-[2.75] text-[#05231A] transition-transform duration-150",
                            rememberDevice ? "scale-100 opacity-100" : "scale-0 opacity-0"
                          )}
                        />
                      </span>
                    </span>
                    <span>Remember this device</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="cursor-pointer shrink-0 text-[12.5px] font-medium text-[#4ADE80] transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Primary action */}
              <motion.button
                type="submit"
                disabled={busy || succeeded}
                whileHover={succeeded || busy ? undefined : { scale: 1.01 }}
                whileTap={succeeded || busy ? undefined : { scale: 0.99 }}
                aria-label={isLogin ? "Unlock Batua" : "Create Batua"}
                className={cn(
                  "auth-sheen group relative mt-1 flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-full",
                  "text-[15px] font-bold tracking-tight transition-all duration-200 cursor-pointer",
                  "bg-gradient-to-r from-[#34D399] via-[#10B981] to-[#059669] text-[#05231A]",
                  "shadow-[0_0_24px_rgba(74,222,128,0.4),0_2px_8px_rgba(16,185,129,0.3)]",
                  "hover:brightness-105 hover:shadow-[0_0_34px_rgba(74,222,128,0.6)] active:translate-y-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09110d]",
                  "disabled:pointer-events-none disabled:opacity-60"
                )}
              >
                {busy ? (
                  <span className="flex items-center gap-2 text-[14px] font-bold">
                    <span className="auth-spinner border-slate-950 border-r-transparent" aria-hidden="true" />
                    <span>{isLogin ? "Unlocking vault…" : "Creating vault…"}</span>
                  </span>
                ) : succeeded ? (
                  <motion.span
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="flex items-center gap-2 text-[14px] font-bold"
                  >
                    <Check className="h-4 w-4 stroke-[3]" aria-hidden="true" />
                    <span>Vault unlocked</span>
                  </motion.span>
                ) : (
                  <>
                    <LogIn className="h-[19px] w-[19px]" strokeWidth={2.2} aria-hidden="true" />
                    <span>{isLogin ? "Unlock Batua" : "Create Batua"}</span>
                  </>
                )}
              </motion.button>
            </motion.form>

            {isLogin && (
              <>
                {/* "or" rule */}
                <div className="my-4 flex items-center gap-3">
                  <span aria-hidden="true" className="h-px flex-1 bg-white/[0.10]" />
                  <span className="text-[12px] font-medium" style={{ color: INK_3 }}>
                    or
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-white/[0.10]" />
                </div>

                {/* Secondary path — platform authenticator */}
                <button
                  type="button"
                  onClick={() =>
                    setDeviceNotice(
                      "Device unlock isn't set up yet — sign in with your password to continue."
                    )
                  }
                  className={cn(
                    "flex h-14 w-full items-center justify-center gap-2.5 rounded-full",
                    "border border-white/[0.14] bg-white/[0.02] text-[15px] font-semibold text-white",
                    "transition-all duration-200 cursor-pointer hover:border-white/25 hover:bg-white/[0.05]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09110d]"
                  )}
                >
                  <Fingerprint className="h-[19px] w-[19px]" strokeWidth={1.9} style={{ color: MINT }} aria-hidden="true" />
                  Use Device Unlock
                </button>

                {deviceNotice && (
                  <p role="status" className="mt-2.5 text-center text-[12px] leading-snug text-[#E8B04B]">
                    {deviceNotice}
                  </p>
                )}
              </>
            )}

            {/* Vault switch */}
            <div className="mt-5 flex items-center justify-center gap-1.5 text-[12.5px]">
              <Shield className="h-4 w-4 shrink-0" strokeWidth={1.9} style={{ color: MINT }} aria-hidden="true" />
              <span style={{ color: INK_3 }}>
                {isLogin ? "Don't have a vault?" : "Already have a vault?"}
              </span>
              <button
                type="button"
                onClick={switchMode}
                aria-label={isLogin ? "Create local account" : "Sign in"}
                className="cursor-pointer font-semibold text-[#4ADE80] transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded underline-offset-2 hover:underline"
              >
                {isLogin ? "Create local account" : "Sign in"}
              </button>
            </div>

            {/* Popup celebration on succeeding */}
            <AnimatePresence>
              {succeeded && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="absolute inset-0 z-50 flex items-center justify-center rounded-[32px] bg-[#070e0b]/92 p-6 backdrop-blur-md"
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
                    <h3 className="font-display mt-3.5 text-lg font-bold tracking-wide text-white">
                      Vault unlocked
                    </h3>
                    <p className="mt-1 text-xs text-slate-300">
                      Redirecting to your dashboard…
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

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
