import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
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
/* Hero visual primitives: Layered Trading Terminal & Allocation Card  */
/* ------------------------------------------------------------------ */

interface CandleData {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
  isBull: boolean;
}

const TRADING_CANDLES: CandleData[] = [
  { x: 20, open: 76, close: 68, high: 64, low: 82, vol: 16, isBull: true },
  { x: 46, open: 68, close: 62, high: 58, low: 72, vol: 24, isBull: true },
  { x: 72, open: 62, close: 66, high: 60, low: 70, vol: 14, isBull: false },
  { x: 98, open: 66, close: 56, high: 52, low: 68, vol: 28, isBull: true },
  { x: 124, open: 56, close: 50, high: 46, low: 60, vol: 32, isBull: true },
  { x: 150, open: 50, close: 54, high: 48, low: 58, vol: 15, isBull: false },
  { x: 176, open: 54, close: 52, high: 47, low: 57, vol: 18, isBull: true },
  { x: 202, open: 52, close: 44, high: 40, low: 54, vol: 26, isBull: true },
  { x: 228, open: 44, close: 48, high: 42, low: 52, vol: 16, isBull: false },
  { x: 254, open: 48, close: 40, high: 36, low: 50, vol: 30, isBull: true },
  { x: 280, open: 40, close: 34, high: 30, low: 43, vol: 34, isBull: true },
  { x: 306, open: 34, close: 38, high: 32, low: 41, vol: 15, isBull: false },
  { x: 332, open: 38, close: 30, high: 26, low: 40, vol: 36, isBull: true },
  { x: 358, open: 30, close: 24, high: 20, low: 33, vol: 40, isBull: true },
  { x: 384, open: 24, close: 28, high: 22, low: 31, vol: 18, isBull: false },
  { x: 410, open: 28, close: 20, high: 16, low: 30, vol: 44, isBull: true },
  { x: 436, open: 20, close: 15, high: 11, low: 23, vol: 50, isBull: true },
];

/**
 * High-end trading chart card displaying authentic candlestick price action,
 * moving-average trendline, volume histogram, and time horizon selectors.
 */
function TradingChartCard() {
  const reduce = useReducedMotion();

  // Smooth spline curve for the exponential moving average across candles
  const emaPath =
    "M 20 74 C 60 68, 100 60, 176 53 C 240 47, 310 37, 370 27 C 400 21, 420 17, 436 15";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.12 }}
      className="relative z-10 w-full rounded-2xl border border-emerald-500/25 bg-[#08130e]/95 p-4 sm:p-5 backdrop-blur-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)]"
      aria-hidden="true"
    >
      {/* Top Bar: Asset Symbol, Live Ticker & Timeframe Tabs */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        {/* Left: Ticker identity & Live Rate */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold tracking-tight text-white">
                VAULT / INR
              </span>
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/25">
                <ArrowUpRight className="h-3 w-3" />
                +12.4%
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10.5px] text-slate-300 mt-0.5">
              <span>24h Vol: ₹4.8M</span>
              <span className="text-white/20">•</span>
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
          </div>
        </div>

        {/* Right: Clean Timeframe Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {["1D", "1W", "1M", "1Y"].map((tf) => (
            <span
              key={tf}
              className={cn(
                "px-2.5 py-0.5 text-[10.5px] font-semibold rounded-lg transition-colors",
                tf === "1W"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-300 hover:text-white"
              )}
            >
              {tf}
            </span>
          ))}
        </div>
      </div>

      {/* Main Trading Chart Canvas (Candlesticks + EMA + Volume) */}
      <div className="mt-3 relative">
        <svg
          viewBox="0 0 460 148"
          className="h-[125px] sm:h-[135px] w-full overflow-visible"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="trading-ema-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="60%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <filter id="trading-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#10B981" floodOpacity="0.65" />
            </filter>
          </defs>

          {/* Horizontal Grid & Price Reference Levels */}
          {[
            { y: 24, label: "₹1,54k" },
            { y: 56, label: "₹1,44k" },
            { y: 88, label: "₹1,34k" },
          ].map((level) => (
            <g key={level.y}>
              <line
                x1="8"
                y1={level.y}
                x2="415"
                y2={level.y}
                stroke="#ffffff"
                strokeOpacity="0.06"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x="455"
                y={level.y + 3}
                textAnchor="end"
                fill="#94a3b8"
                opacity="0.55"
                fontSize="9"
                fontWeight="500"
                fontFamily="inherit"
              >
                {level.label}
              </text>
            </g>
          ))}

          {/* Volume Baseline Grid Line */}
          <line
            x1="8"
            y1="114"
            x2="455"
            y2="114"
            stroke="#ffffff"
            strokeOpacity="0.08"
            strokeWidth="1"
          />

          {/* Volume Histogram Bars (Base at y=144) */}
          {TRADING_CANDLES.map((c) => {
            const barH = c.vol * 0.58;
            return (
              <rect
                key={`vol-${c.x}`}
                x={c.x - 4}
                y={144 - barH}
                width="8"
                height={barH}
                rx="1.5"
                fill={c.isBull ? "#10B981" : "#F43F5E"}
                fillOpacity={c.isBull ? "0.38" : "0.28"}
              />
            );
          })}

          {/* Candlestick Wicks & Bodies */}
          {TRADING_CANDLES.map((c) => {
            const bodyY = Math.min(c.open, c.close);
            const bodyH = Math.max(Math.abs(c.open - c.close), 2.5);
            return (
              <g key={`candle-${c.x}`}>
                {/* Candle Wick Line */}
                <line
                  x1={c.x}
                  y1={c.high}
                  x2={c.x}
                  y2={c.low}
                  stroke={c.isBull ? "#10B981" : "#F43F5E"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                {/* Candle Body Rect */}
                <rect
                  x={c.x - 4.5}
                  y={bodyY}
                  width="9"
                  height={bodyH}
                  rx="1.5"
                  fill={c.isBull ? "#10B981" : "#E11D48"}
                  stroke={c.isBull ? "#34D399" : "#FB7185"}
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* Moving Average Line (EMA Overlay) */}
          <path
            d={emaPath}
            fill="none"
            stroke="url(#trading-ema-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="auth-spark-line"
            pathLength={1}
          />

          {/* Vertical Crosshair Guide at Current Trading Beacon */}
          <line
            x1="436"
            y1="8"
            x2="436"
            y2="144"
            stroke="#10B981"
            strokeOpacity="0.45"
            strokeDasharray="2.5 2.5"
            strokeWidth="1.5"
          />

          {/* Active Price Beacon on Latest Candle */}
          <circle cx="436" cy="15" r="7.5" fill="#10B981" fillOpacity="0.28" filter="url(#trading-glow)" />
          <circle cx="436" cy="15" r="4" fill="#34D399" stroke="#060b08" strokeWidth="2" />

          {/* Pinned Real-Time Price Callout */}
          <g transform="translate(362, 0)">
            <rect
              width="70"
              height="18"
              rx="9"
              fill="#061c12"
              stroke="#10B981"
              strokeOpacity="0.65"
              strokeWidth="1"
            />
            <text
              x="35"
              y="12.5"
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#34D399"
              fontFamily="inherit"
            >
              ₹1,48,920
            </text>
          </g>
        </svg>
      </div>
    </motion.div>
  );
}

/**
 * Secondary layered card representing asset allocation & vault liquidity,
 * overlapping the lower section of the trading chart for genuine physical depth.
 */
function AssetAllocationCard() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...ease, delay: 0.22 }}
      className="rounded-2xl border border-emerald-500/25 bg-[#0a1812]/95 p-3.5 backdrop-blur-2xl shadow-[0_22px_48px_-10px_rgba(0,0,0,0.85)]"
      aria-hidden="true"
    >
      {/* Card Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-white">
            Vault Allocation
          </span>
        </div>
        <span className="text-[11px] font-bold text-emerald-400 tabular-nums">
          98.2% Liquid
        </span>
      </div>

      {/* Segmented Gradient Bar */}
      <div className="mt-2.5 flex h-2 gap-1 overflow-hidden rounded-full bg-white/5 p-0.5">
        <div className="w-[62%] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
        <div className="w-[26%] rounded-full bg-gradient-to-r from-teal-400 to-teal-500" />
        <div className="w-[12%] rounded-full bg-gradient-to-r from-slate-400 to-slate-500" />
      </div>

      {/* Legend & Allocation Breakdown */}
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[10.5px]">
        <div>
          <p className="text-slate-400 text-[9.5px] uppercase tracking-wide">Liquid</p>
          <p className="font-semibold text-white tabular-nums">62% (₹92.3k)</p>
        </div>
        <div>
          <p className="text-slate-400 text-[9.5px] uppercase tracking-wide">Growth</p>
          <p className="font-semibold text-emerald-300 tabular-nums">26% (₹38.7k)</p>
        </div>
        <div>
          <p className="text-slate-400 text-[9.5px] uppercase tracking-wide">Buffer</p>
          <p className="font-semibold text-teal-300 tabular-nums">12% (₹17.9k)</p>
        </div>
      </div>

      {/* Bottom Telemetry Verification Row */}
      <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10.5px]">
        <span className="text-slate-300 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Hardware-bound local key
        </span>
        <span className="font-semibold text-emerald-400">Validated</span>
      </div>
    </motion.div>
  );
}

/**
 * Floating micro-telemetry pill positioned outside the card bounds.
 */
function SecurityFloatingPill() {
  return (
    <div
      className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-[#07130e]/95 px-3.5 py-1.5 shadow-xl shadow-black/60 backdrop-blur-xl"
      aria-hidden="true"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[11px] font-semibold tracking-wide text-emerald-300">
        AES-256 Local Ledger
      </span>
      <span className="text-white/20">•</span>
      <span className="text-[11px] font-medium text-slate-300">Zero Cloud Sync</span>
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

          {/* Layered hero stage: Stack underlay + Trading chart + Overlapping allocation card + Floating security pill */}
          <motion.div variants={item} className="relative w-full max-w-[560px] pt-4 pb-2">
            {/* Top stack underlay card creating authentic physical depth ("one on top of other") */}
            <div
              className="absolute -top-1.5 left-5 right-5 h-6 rounded-2xl bg-[#0a1812]/50 border border-emerald-500/15 -z-10 shadow-lg shadow-black/40"
              aria-hidden="true"
            />

            {/* Floating micro-security pill hovering over top-left */}
            <div className="absolute -top-2 left-4 z-30">
              <SecurityFloatingPill />
            </div>

            {/* Base layer: High-end Trading Candlestick & Volume Chart Card */}
            <TradingChartCard />

            {/* Overlapping secondary layer: Asset Allocation & Liquidity Card stacked over bottom-right */}
            <div className="relative -mt-9 sm:-mt-11 ml-auto w-[88%] sm:w-[315px] z-20">
              <AssetAllocationCard />
            </div>
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
