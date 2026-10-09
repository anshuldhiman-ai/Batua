import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  IndianRupee,
  Key,
  Loader2,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkle,
  User,
  UserPlus,
  Wallet,
} from "lucide-react";

import { useAuth } from "@/components/Auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ease, fadeUp, noMotion, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Split-screen sign-in gate.
 *
 * Left: an atmospheric brand showcase — candlestick backdrop, ascending
 * trend graph, glass wallet emblem and floating neon bars. Right: the
 * glassmorphic auth panel. The auth logic, labels and button copy are
 * unchanged from the previous single-card version (they're the contract
 * the tests and the boot-probe flow rely on), only the presentation
 * moved to the split layout.
 */

/* ------------------------------------------------------------------ */
/* Left panel — brand showcase (pure CSS/SVG, no images)               */
/* ------------------------------------------------------------------ */

/** Faint candlesticks behind the brand. `top` is the wick-start y. */
const CANDLES = [
  { x: 52, top: 660, body: 96, up: false },
  { x: 100, top: 612, body: 118, up: true },
  { x: 152, top: 566, body: 84, up: true },
  { x: 202, top: 628, body: 104, up: false },
  { x: 254, top: 548, body: 122, up: true },
  { x: 306, top: 508, body: 92, up: true },
  { x: 356, top: 540, body: 112, up: false },
  { x: 408, top: 476, body: 100, up: true },
  { x: 460, top: 438, body: 82, up: true },
  { x: 512, top: 462, body: 96, up: false },
  { x: 566, top: 392, body: 108, up: true },
  { x: 618, top: 352, body: 92, up: true },
] as const;

/** Scattered particle nodes for the "glowing nodes" layer. */
const PARTICLES = [
  { cx: 90, cy: 320, r: 1.8 },
  { cx: 170, cy: 210, r: 1.4 },
  { cx: 250, cy: 420, r: 2.2 },
  { cx: 330, cy: 150, r: 1.5 },
  { cx: 420, cy: 300, r: 1.8 },
  { cx: 500, cy: 120, r: 1.3 },
  { cx: 590, cy: 260, r: 2 },
  { cx: 660, cy: 170, r: 1.5 },
  { cx: 140, cy: 520, r: 1.4 },
  { cx: 640, cy: 540, r: 1.7 },
  { cx: 480, cy: 580, r: 1.5 },
  { cx: 280, cy: 700, r: 1.9 },
] as const;

/** Volume bars beneath the chart. */
const VOLUMES = [
  { x: 52, h: 34 },
  { x: 100, h: 58 },
  { x: 152, h: 42 },
  { x: 202, h: 66 },
  { x: 254, h: 50 },
  { x: 306, h: 74 },
  { x: 356, h: 46 },
  { x: 408, h: 62 },
  { x: 460, h: 80 },
  { x: 512, h: 56 },
  { x: 566, h: 88 },
  { x: 618, h: 70 },
] as const;

/**
 * Full-panel backdrop: hairline grid, faint candlesticks, a dual
 * trend graph with glowing nodes, and soft volumetric glows.
 */
function ChartBackdrop() {
  return (
    <svg
      viewBox="0 0 720 1180"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="batua-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.05" />
          <stop offset="55%" stopColor="#2DD4BF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#00FFC2" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="batua-line-2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.05" />
          <stop offset="60%" stopColor="#22D3EE" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="batua-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
        </linearGradient>
        <filter
          id="batua-glow"
          x="-120%"
          y="-120%"
          width="340%"
          height="340%"
        >
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* hairline grid */}
      {Array.from({ length: 7 }, (_, i) => i * 120).map((x) => (
        <line
          key={`v${x}`}
          x1={x}
          y1="0"
          x2={x}
          y2="1180"
          stroke="#2DD4BF"
          strokeOpacity="0.035"
        />
      ))}
      {Array.from({ length: 10 }, (_, i) => i * 118).map((y) => (
        <line
          key={`h${y}`}
          x1="0"
          y1={y}
          x2="720"
          y2={y}
          stroke="#2DD4BF"
          strokeOpacity="0.045"
        />
      ))}

      {/* candlesticks */}
      {CANDLES.map((c, i) => (
        <g key={i} opacity={c.up ? 0.16 : 0.1}>
          <line
            x1={c.x}
            y1={c.top - 26}
            x2={c.x}
            y2={c.top + c.body + 26}
            stroke={c.up ? "#14F195" : "#2DD4BF"}
            strokeWidth="2"
          />
          <rect
            x={c.x - 9}
            y={c.top}
            width="18"
            height={c.body}
            rx="5"
            fill={c.up ? "#14F195" : "#0B1317"}
            stroke={c.up ? "#14F195" : "#2DD4BF"}
            strokeOpacity="0.5"
          />
        </g>
      ))}

      {/* volume bars */}
      {VOLUMES.map((v, i) => (
        <rect
          key={i}
          x={v.x - 7}
          y={1086 - v.h}
          width="14"
          height={v.h}
          rx="4"
          fill="#2DD4BF"
          fillOpacity="0.05"
          stroke="#2DD4BF"
          strokeOpacity="0.08"
        />
      ))}

      {/* ascending graphs + area (emerald primary, cyan secondary) */}
      <path
        d="M-20 1040 C 110 1000 210 920 300 872 S 470 730 552 648 S 690 470 740 428 L740 1180 L-20 1180 Z"
        fill="url(#batua-area)"
      />
      <path
        d="M-20 1040 C 110 1000 210 920 300 872 S 470 730 552 648 S 690 470 740 428"
        fill="none"
        stroke="url(#batua-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M-20 1120 C 140 1090 260 1010 360 960 S 560 820 740 700"
        fill="none"
        stroke="url(#batua-line-2)"
        strokeWidth="1.5"
        strokeDasharray="1 7"
        strokeLinecap="round"
      />

      {/* glowing nodes on the trend line — core + expanding pulse ring */}
      <g filter="url(#batua-glow)">
        <circle cx="300" cy="872" r="4.5" fill="#00FFC2" />
        <circle cx="552" cy="648" r="5.5" fill="#14F195" />
        <circle cx="700" cy="452" r="4" fill="#2DD4BF" />
      </g>
      <circle
        className="batua-pulse-ring"
        cx="552"
        cy="648"
        r="10"
        fill="none"
        stroke="#14F195"
        strokeWidth="1.5"
      />
      <circle
        className="batua-pulse-ring"
        cx="700"
        cy="452"
        r="10"
        fill="none"
        stroke="#2DD4BF"
        strokeWidth="1.5"
        style={{ animationDelay: "1.6s" }}
      />

      {/* ambient particles */}
      <g fill="#2DD4BF" fillOpacity="0.35">
        {PARTICLES.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
        ))}
      </g>

      {/* crosshair ticks on the axes */}
      <g stroke="#2DD4BF" strokeOpacity="0.18">
        <path d="M300 866 v12 M294 872 h12" fill="none" />
        <path d="M552 642 v12 M546 648 h12" fill="none" />
      </g>
    </svg>
  );
}

/** A small floating tile of neon bars — the "3D translucent bar charts". */
function NeonBars({
  className,
  heights,
  delay = 0,
}: {
  className?: string;
  heights: number[];
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "rounded-2xl border border-teal-300/15 bg-[#0B1317]/60 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md",
        className
      )}
      animate={reduce ? undefined : { y: [0, -9, 0] }}
      transition={
        reduce ? undefined : { duration: 5.5, repeat: Infinity, ease: "easeInOut", delay }
      }
      aria-hidden="true"
    >
      <div className="flex items-end gap-1.5">
        {heights.map((h, i) => (
          <span
            key={i}
            className="w-2 rounded-full bg-gradient-to-t from-cyan-400/25 to-emerald-300/75"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Brand centerpiece: a glassmorphic wallet with a live trend chart,
 * growth-arrow badge and ₹ coin node, over a soft volumetric glow.
 */
function WalletEmblem() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={ease}
      className="relative"
      aria-hidden="true"
    >
      {/* volumetric glows behind the glass */}
      <div className="absolute -inset-10 rounded-[40px] bg-[radial-gradient(closest-side,rgba(20,241,149,0.22),transparent)] blur-2xl" />
      <div className="absolute -inset-16 rounded-full bg-cyan-400/10 blur-3xl" />

      {/* the glass wallet */}
      <div className="relative flex h-44 w-64 flex-col rounded-[26px] border border-teal-200/20 bg-white/[0.06] p-4 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-teal-300" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Batua Vault
            </span>
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
        </div>
        <div className="mt-2.5">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
            Total balance
          </div>
          <div className="mt-0.5 font-display text-[22px] font-semibold tracking-tight text-white">
            ₹ 2,84,930
          </div>
        </div>
        <svg viewBox="0 0 220 64" className="mt-1 h-16 w-full" aria-hidden="true">
          <defs>
            <linearGradient id="wallet-line" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#14F195" />
            </linearGradient>
            <linearGradient id="wallet-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M4 56 C 40 50 60 38 92 34 S 160 22 216 10 L216 64 L4 64 Z"
            fill="url(#wallet-area)"
          />
          <path
            d="M4 56 C 40 50 60 38 92 34 S 160 22 216 10"
            fill="none"
            stroke="url(#wallet-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="216" cy="10" r="3.5" fill="#14F195" />
        </svg>
      </div>

      {/* growth trend arrow */}
      <motion.div
        className="absolute -right-5 -top-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-cyan-400/25 to-emerald-400/25 shadow-[0_10px_30px_rgba(20,241,149,0.35)] backdrop-blur-xl"
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={
          reduce ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <ArrowUpRight className="h-5 w-5 text-emerald-300" />
      </motion.div>

      {/* ₹ coin node */}
      <motion.div
        className="absolute -bottom-5 left-8 flex h-12 w-12 items-center justify-center rounded-full border border-teal-300/25 bg-[#0B1317]/80 shadow-[0_0_30px_rgba(0,255,194,0.35)] backdrop-blur-xl"
        animate={reduce ? undefined : { y: [0, 6, 0] }}
        transition={
          reduce ? undefined : { duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }
        }
      >
        <IndianRupee className="h-5 w-5 text-teal-300" />
      </motion.div>

      {/* node graph trailing off the coin */}
      <motion.svg
        viewBox="0 0 64 40"
        className="absolute -bottom-3 right-2 h-10 w-16"
        animate={reduce ? undefined : { y: [0, -5, 0] }}
        transition={
          reduce ? undefined : { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.1 }
        }
        aria-hidden="true"
      >
        <path
          d="M4 34 L22 20 L40 26 L60 8"
          stroke="#2DD4BF"
          strokeOpacity="0.5"
          fill="none"
          strokeWidth="1.5"
        />
        <circle cx="4" cy="34" r="2.5" fill="#2DD4BF" fillOpacity="0.7" />
        <circle cx="22" cy="20" r="2.5" fill="#2DD4BF" fillOpacity="0.7" />
        <circle cx="40" cy="26" r="2.5" fill="#2DD4BF" fillOpacity="0.7" />
        <circle cx="60" cy="8" r="3" fill="#14F195" />
      </motion.svg>
    </motion.div>
  );
}

/** Left half of the split — the brand stage. */
function BrandPanel() {
  const reduce = useReducedMotion();
  const variants = reduce ? noMotion : staggerContainer;
  const item = reduce ? noMotion : fadeUp;

  return (
    <section className="relative flex min-h-[62vh] flex-col overflow-hidden p-10 lg:min-h-screen">
      <ChartBackdrop />

      {/* soft cyan volumetric glows */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-16 -right-16 h-[28rem] w-[28rem] rounded-full bg-emerald-400/10 blur-3xl" aria-hidden="true" />

      {/* aurora beams sweeping across */}
      <div
        className="pointer-events-none absolute -top-24 left-0 h-[120%] w-40 rotate-[18deg] bg-gradient-to-b from-transparent via-teal-300/[0.07] to-transparent batua-sweep"
        aria-hidden="true"
      />

      {/* reflective digital floor — perspective grid fading up */}
      <div
        className="absolute inset-x-[-10%] bottom-[10%] h-[42%] opacity-70 [background-image:linear-gradient(rgba(45,212,191,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(45,212,191,0.13)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_top,black_30%,transparent)] [transform:perspective(720px)_rotateX(58deg)] [transform-origin:bottom]"
        aria-hidden="true"
      />
      <div className="absolute bottom-[16%] left-1/2 h-24 w-72 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />

      <motion.div
        variants={variants}
        initial="hidden"
        animate="show"
        className="relative z-10 my-auto flex flex-col items-center gap-10 px-4 text-center"
      >
        <motion.div variants={item} className="relative">
          <WalletEmblem />
        </motion.div>

        {/* chrome wordmark */}
        <motion.div variants={item}>
          <p className="bg-gradient-to-b from-white via-slate-100 to-slate-500 bg-clip-text font-brand text-5xl uppercase tracking-[0.2em] text-transparent drop-shadow-[0_0_28px_rgba(45,212,191,0.35)] sm:text-6xl">
            BATUA
          </p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.34em] text-slate-500">
            Personal finance, secured on-device
          </p>
        </motion.div>
      </motion.div>

      {/* floating translucent neon bar charts */}
      <NeonBars
        className="absolute left-[9%] top-[15%] hidden md:block"
        heights={[14, 26, 18, 34, 22]}
        delay={0.4}
      />
      <NeonBars
        className="absolute right-[8%] top-[26%] hidden md:block"
        heights={[22, 16, 30, 14, 26]}
        delay={1.2}
      />
      <NeonBars
        className="absolute bottom-[22%] left-[15%] hidden md:block"
        heights={[18, 30, 22, 38, 16]}
        delay={2}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Right panel — glassmorphic auth card                                 */
/* ------------------------------------------------------------------ */

const inputCls =
  "h-12 rounded-xl border border-slate-800 bg-[#081014] px-4 text-sm text-slate-300 placeholder:text-slate-500 transition-all focus-visible:border-teal-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/25";

function Field({
  icon: Icon,
  label,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ElementType;
  label: string;
  id: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-slate-400">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-500/60" />
        <Input id={id} {...props} className={cn(inputCls, "pl-10")} />
      </div>
    </div>
  );
}

/**
 * Recovery flow — placeholder until the token mint/exchange
 * endpoint lands. The dialog explains where the flow will live
 * (Settings → Account) without wiring a network call yet.
 */
function RecoveryDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [requested, setRequested] = useState(false);

  const request = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: POST /auth/forgot once the server mints recovery tokens.
    setRequested(true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-teal-500/20 bg-[#0d171c] text-slate-200 shadow-[0_0_50px_-10px_rgba(20,241,149,0.25)]">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-white">
            Recover your account
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Mint a recovery token from the server and exchange it for a new
            password.
          </DialogDescription>
        </DialogHeader>

        {requested ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p className="text-sm leading-relaxed text-slate-300">
              Recovery is issued from <b>Settings → Account</b> on a device
              that's already signed in. The token is single-use and expires
              after 15 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={request} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="recovery-username"
                className="text-[13px] font-medium text-slate-400"
              >
                Username
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-500/60" />
                <Input
                  id="recovery-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="anshuldhiman-ai"
                  autoComplete="username"
                  className={cn(inputCls, "pl-10")}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-[#22d3ee] via-[#2dd4bf] to-[#14f195] py-3 font-semibold text-[#051a15] shadow-[0_10px_30px_rgba(20,241,149,0.35)] transition-all hover:brightness-110 hover:shadow-[0_12px_35px_rgba(20,241,149,0.5)]"
            >
              Mint recovery token
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">
              Nothing is sent yet — the token endpoint is still being wired up.
              Until then, use Settings → Account.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function LoginPage() {
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (form.username.trim().length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (form.password.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    if (mode === "register" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.username.trim(), form.password);
        toast.success(`Welcome back, @${form.username.trim()}`);
      } else {
        await register(form.username.trim(), form.email.trim(), form.password);
        await login(form.username.trim(), form.password);
        toast.success(`Welcome to Batua, @${form.username.trim()}`);
      }
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      // Server messages (401/409 detail) are user-facing.
      const msg = err?.response?.data?.detail || "Couldn't reach the Batua server";
      toast.error(typeof msg === "string" ? msg : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const item = reduce ? noMotion : fadeUp;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[linear-gradient(135deg,#060B0D_0%,#0B1317_50%,#060B0D_100%)] lg:grid-cols-2">
      <BrandPanel />

      {/* Right pane — the auth panel, floated over a soft glow */}
      <section className="relative flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/10 blur-3xl"
          aria-hidden="true"
        />

        <motion.div
          variants={reduce ? noMotion : staggerContainer}
          initial="hidden"
          animate="show"
          className="relative w-full max-w-md mx-auto"
        >
          <motion.div
            variants={item}
            className="relative overflow-hidden rounded-3xl border border-teal-500/20 bg-[#0d171c]/70 p-8 shadow-[0_0_50px_-10px_rgba(20,241,149,0.15)] backdrop-blur-2xl"
          >
            {/* status beacon + decorative sparkle */}
            <span
              className="absolute right-6 top-6 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981]"
              aria-hidden="true"
            />
            <Sparkle
              className="pointer-events-none absolute bottom-5 right-6 h-4 w-4 text-slate-600/40"
              aria-hidden="true"
            />

            <motion.div variants={item} className="mb-7 space-y-2">
              <h1 className="font-display text-xl font-extrabold uppercase tracking-tight text-white sm:text-2xl">
                {mode === "login"
                  ? "Sign in to your account"
                  : "Create your account"}
              </h1>
              <p className="text-sm text-slate-400">
                {mode === "login"
                  ? "Enter your credentials to access your data"
                  : "One account per install — your data stays on-device"}
              </p>
            </motion.div>

            <form onSubmit={submit} className="space-y-5">
              <motion.div variants={item}>
                <Field
                  icon={User}
                  label="Username"
                  id="login-username"
                  autoComplete="username"
                  placeholder="anshuldhiman-ai"
                  value={form.username}
                  onChange={set("username")}
                  minLength={3}
                  required
                />
              </motion.div>

              {mode === "register" && (
                <motion.div variants={item}>
                  <Field
                    icon={Mail}
                    label="Email"
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={set("email")}
                    required
                  />
                </motion.div>
              )}

              <motion.div variants={item} className="space-y-1.5">
                <label
                  htmlFor="login-password"
                  className="text-[13px] font-medium text-slate-400"
                >
                  Password
                </label>
                <div className="relative">
                  <Key className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-500/60" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={set("password")}
                    minLength={4}
                    required
                    className={cn(inputCls, "pl-10 pr-10")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-teal-300"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </motion.div>

              <motion.div variants={item} className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRecoveryOpen(true)}
                  className="cursor-pointer text-xs font-medium text-teal-400/90 transition hover:text-teal-300 hover:underline"
                >
                  Forgot password?
                </button>
                <span className="text-[11px] text-slate-600">
                  Secured on-device
                </span>
              </motion.div>

              <motion.div variants={item}>
                <Button
                  type="submit"
                  disabled={busy}
                  className="h-auto w-full rounded-2xl bg-gradient-to-r from-[#22d3ee] via-[#2dd4bf] to-[#14f195] py-3.5 text-base font-semibold text-[#051a15] shadow-[0_10px_30px_rgba(20,241,149,0.35)] transition-all hover:brightness-110 hover:shadow-[0_12px_35px_rgba(20,241,149,0.5)]"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Please wait…
                    </>
                  ) : mode === "login" ? (
                    <>
                      <LogIn className="h-4 w-4" /> Sign in
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Create account
                    </>
                  )}
                </Button>
              </motion.div>
            </form>

            <motion.div variants={item} className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setMode((m) => (m === "login" ? "register" : "login"))}
                className="cursor-pointer text-sm text-teal-400 transition hover:text-teal-300 hover:underline"
              >
                {mode === "login"
                  ? "First time here? Create your account"
                  : "Already have an account? Sign in"}
              </button>
            </motion.div>

            <motion.p
              variants={item}
              className="mx-auto mt-6 flex max-w-sm items-start gap-3 text-xs leading-relaxed text-slate-400/80"
            >
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span>
                Batua stores everything locally. If you ever forget your
                password, a recovery token can be minted from the server and
                exchanged for a new one — see Settings → Account.
              </span>
            </motion.p>
          </motion.div>

          <RecoveryDialog
            open={recoveryOpen}
            onClose={() => setRecoveryOpen(false)}
          />
        </motion.div>
      </section>
    </div>
  );
}
