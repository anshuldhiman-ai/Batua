import React from "react";
import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

/* ── Tone maps ─────────────────────────────────────────────────── */

export const PILL_TONES = {
  emerald:
    "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  blue: "bg-blue-500/10 text-blue-600 ring-blue-500/20 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  rose: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  neutral: "bg-muted text-muted-foreground ring-border/70",
};

export const DOT_TONES = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  neutral: "bg-muted-foreground/50",
};

export const METHOD_TONES = {
  GET: "blue",
  POST: "emerald",
  PUT: "amber",
  DELETE: "rose",
};

/* ── Small primitives ──────────────────────────────────────────── */

/** A live/pulsing status dot. `pulse` pings so it reads as "live". */
export function StatusDot({ tone = "emerald", pulse = false, className }: any) {
  const color = DOT_TONES[tone];
  if (!pulse) return <span className={cn("h-1.5 w-1.5 rounded-full", color, className)} />;
  return (
    <span className={cn("relative flex h-1.5 w-1.5", className)} aria-hidden="true">
      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color)} />
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", color)} />
    </span>
  );
}

/** Soft status pill — the "Connected / Healthy / Encrypted" badges. */
export function Pill({ tone = "neutral", dot, pulse, label, className, title, ...rest }: any) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        PILL_TONES[tone],
        className
      )}
      {...rest}
    >
      {dot && <StatusDot tone={tone} pulse={pulse} />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** HTTP method chip — coloured per verb. */
export function MethodBadge({ method }: any) {
  const tone = METHOD_TONES[method] || "neutral";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ring-1 ring-inset",
        PILL_TONES[tone]
      )}
    >
      {method}
    </span>
  );
}

/**
 * Elevated card surface — the signature depth of this page.
 * Layered background, hairline top highlight, soft shadow, 16px radius.
 */
export function Panel({ className, children, ...props }: any) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_-1px_hsl(var(--foreground)/0.06),0_16px_40px_-28px_hsl(var(--foreground)/0.35)]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/[0.07] after:to-transparent",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ icon: Icon, title, desc, right, tone, className }: any) {
  const rose = tone === "rose";
  return (
    <div className={cn("flex items-start justify-between gap-4 p-6 pb-4", className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
              rose
                ? "bg-rose-500/10 text-rose-500 ring-rose-500/20"
                : "bg-muted/60 text-muted-foreground ring-border/40"
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
        <div>
          <h3
            className={cn(
              "text-sm font-semibold leading-tight tracking-tight",
              rose && "text-rose-500"
            )}
          >
            {title}
          </h3>
          {desc && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export const PanelContent = ({ className, ...props }: any) => (
  <div className={cn("px-6 pb-6 pt-2", className)} {...props} />
);

export const PanelFooter = ({ className, ...props }: any) => (
  <div
    className={cn("flex flex-wrap items-center gap-2 border-t border-border/50 px-6 py-4", className)}
    {...props}
  />
);

/** A single label / value row used across the health and data panels. */
export function MetricRow({ icon: Icon, label, value, pill, pillDot, pillPulse, className }: any) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border/50 py-3 last:border-0",
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-3 text-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground ring-1 ring-inset ring-border/40">
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate font-medium">{label}</span>
      </span>
      {pill ? (
        <Pill tone={pill} dot={pillDot} pulse={pillPulse} label={value} className="shrink-0" />
      ) : (
        <span className="shrink-0 text-right text-sm text-muted-foreground">{value}</span>
      )}
    </div>
  );
}

/** Render a live system-metric value with a unit, or "—" when unavailable. */
export function metricValue(m: any, key: string, unit = "") {
  const v = m?.[key];
  if (v === null || v === undefined || v === false) return "—";
  const num = Number(v);
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num * 10) / 10}${unit}`;
}

/** Clamp a raw 0-? value to a 0-100 bar width (rounds/guards outliers). */
export function metricPct(v: any, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, (n / max) * 100));
}

/** Human-readable uptime from seconds, e.g. "3h 12m" — or "—" when unknown. */
export function formatUptime(seconds: number | null | undefined) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** A labelled progress bar used in the System Metrics block. */
export function MetricBar({ icon: Icon, label, value, pct, tone = "emerald" }: any) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // Let the first paint settle, then slide the bar in once. Later updates
    // just flow via a CSS transition instead of re-running framer-motion.
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground ring-1 ring-inset ring-border/40">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">{label}</span>
          <span className="tabular-nums text-muted-foreground">{value}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              DOT_TONES[tone],
              mounted ? "" : "w-0"
            )}
            style={{ width: mounted ? `${pct}%` : 0 }}
          />
        </div>
      </div>
    </div>
  );
}

/** Entrance fade/rise used on panels and rows (respects reduced motion). */
export function useFade(delay = 0) {
  const reduce = useReducedMotion();
  return reduce
    ? { initial: false as const, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay },
      };
}

/* ── Reusable pieces ───────────────────────────────────────────── */

/** A full-width action row (backup, restore, danger zone). */
export function ActionRow({
  icon: Icon,
  title,
  desc,
  buttonLabel,
  buttonTestid,
  buttonVariant = "outline",
  buttonDisabled = false,
  onAction,
  destructive = false,
}: any) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 border-b border-border/50 py-3.5 last:border-0",
        destructive && "border-rose-500/15"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            destructive
              ? "bg-rose-500/10 text-rose-500 ring-rose-500/20"
              : "bg-muted/50 text-muted-foreground ring-border/40"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className={cn("text-sm font-medium", destructive && "text-rose-500")}>{title}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
        </div>
      </div>
      <Button
        variant={buttonVariant}
        disabled={buttonDisabled}
        onClick={onAction}
        data-testid={buttonTestid}
        className="shrink-0"
      >
        <Icon className="h-4 w-4" /> {buttonLabel}
      </Button>
    </div>
  );
}

/**
 * One pinged endpoint — shows verb badge, health dot, latency and an
 * expandable detail (path + response/error). Clicking toggles the detail.
 */
export function EndpointRow({ label, path, method = "GET", data, timeout = 5000, runNonce }: any) {
  const [status, setStatus] = React.useState<"loading" | "ok" | "error">("loading");
  const [latency, setLatency] = React.useState(null);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setLatency(null);
    const t0 = performance.now();
    // Per-endpoint timeout — slow-but-healthy endpoints (e.g. ML warmup) get a
    // longer window instead of a single global 5s that false-flags them down.
    const opts: any = { timeout };
    if (method === "POST") {
      opts.method = "POST";
      opts.headers = { "Content-Type": "application/json" };
      opts.data = data ?? {};
    }
    api({ url: path, ...opts })
      .then(() => {
        if (cancelled) return;
        setLatency(Math.max(1, Math.round(performance.now() - t0)));
        setStatus("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setLatency(null);
        const code = e?.response?.status;
        const detail = e?.response?.data?.detail;
        if (code === 404) setErrorMsg(typeof detail === "string" ? `HTTP 404 · ${detail}` : "HTTP 404 · not found");
        else if (code) setErrorMsg(typeof detail === "string" ? `HTTP ${code} · ${detail}` : `HTTP ${code}`);
        else setErrorMsg("Backend not reachable");
      });
    return () => {
      cancelled = true;
    };
    // runNonce re-fires every check (the "Test all APIs" button).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, method, runNonce]);

  const tone = status === "ok" ? "emerald" : status === "error" ? "rose" : "amber";

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <StatusDot tone={tone} pulse={status === "loading"} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <MethodBadge method={method} />
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {status === "loading" ? "…" : status === "ok" ? `${latency}ms` : "—"}
        </span>
        <Pill
          tone={tone}
          label={status === "loading" ? "Pinging" : status === "ok" ? "Healthy" : "Down"}
          className="w-20 shrink-0 justify-center px-2 text-[11px]"
        />
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-muted-foreground/40"
        >
          <ChevronRight className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
              <code className="break-all font-mono text-[11px] text-muted-foreground">
                {method} {path}
              </code>
              <div className="mt-1 text-[11px]">
                {status === "ok" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> Responded in {latency}ms
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-3 w-3" /> {errorMsg}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
