import React from "react";
import {
  Moon,
  Sun,
  IndianRupee,
  AlertTriangle,
  Trash2,
  Database,
  Download,
  UploadCloud,
  Sparkles,
  Bot,
  Palette,
  Plus,
  Edit,
  X,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  RotateCcw,
  Lock,
  Wifi,
  Cpu,
  MemoryStick,
  Gauge,
  Timer,
  Activity,
  Zap,
  FileCode2,
  Github,
  BookOpen,
  ChevronRight,
  Loader2,
  KeyRound,
  Globe,
  Landmark,
  HardDrive,
  Blend,
  Tags,
  Settings2,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import { ThemeContext } from "@/App";
import MicTest from "@/components/MicTest";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ACCENTS, CUSTOM_ACCENT } from "@/lib/themes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────
   Settings — premium, enterprise-grade preferences page.

   Information architecture
   ────────────────────────
   Header  →  segmented tabs  →  tab content  →  (System tab adds a
   full-width security panel + help footer below the three system cards).

   The whole page reuses the app's semantic colour tokens (bg-card,
   border, primary, …) so it stays theme-aware (light/dark + accent),
   while the layered surfaces give it the "elevated card" depth of a
   modern SaaS settings screen.
   ──────────────────────────────────────────────────────────────── */

// How the AI Insights chat answers questions. Read by QAChatWidget.
const QA_MODES = [
  {
    id: "hybrid",
    label: "Mixed (recommended)",
    icon: Blend,
    desc: "Pattern rules compute the exact numbers, the local model rewords the reply so it sounds natural.",
  },
  {
    id: "llama",
    label: "Llama — local AI",
    icon: Bot,
    desc: "The local model answers directly from a digest of your data. Needs Ollama running; falls back to rules when it isn't.",
  },
  {
    id: "rules",
    label: "Quick rules",
    icon: Zap,
    desc: "Instant template answers from pattern matching only. No AI involved.",
  },
];

const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette, testid: "settings-tab-appearance" },
  { id: "ai", label: "AI & Voice", icon: Bot, testid: "settings-tab-ai" },
  { id: "system", label: "System", icon: Wifi, testid: "settings-tab-system" },
  { id: "data", label: "Data", icon: Database, testid: "settings-tab-data" },
];

// The routes pinged on the System tab. `data` is the POST body when the
// endpoint only accepts a body (NL parsing).
const ENDPOINTS = [
  { label: "Transactions API", path: "/transactions/", method: "GET" },
  { label: "Analytics API", path: "/analytics/category-breakdown", method: "GET" },
  { label: "Dashboard API", path: "/dashboard/metrics", method: "GET" },
  { label: "Categories API", path: "/categories/", method: "GET" },
  { label: "NL Parser", path: "/parse-nl", method: "POST", data: { text: "test" } },
  // /ml/spending-patterns warms up its analyzer on first hit and can exceed the
  // default 5s — give it room so a slow-but-healthy endpoint isn't flagged down.
  { label: "ML Insights", path: "/ml/spending-patterns", method: "GET", timeout: 20000 },
];

const REPO_URL = "https://github.com/anshuldhiman-ai/Batua";

/* ── Tone maps ─────────────────────────────────────────────────── */

const PILL_TONES = {
  emerald:
    "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  blue: "bg-blue-500/10 text-blue-600 ring-blue-500/20 dark:text-blue-400",
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  rose: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  neutral: "bg-muted text-muted-foreground ring-border/70",
};

const DOT_TONES = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  neutral: "bg-muted-foreground/50",
};

const METHOD_TONES = {
  GET: "blue",
  POST: "emerald",
  PUT: "amber",
  DELETE: "rose",
};

/* ── Small primitives ──────────────────────────────────────────── */

/** A live/pulsing status dot. `pulse` pings so it reads as "live". */
function StatusDot({ tone = "emerald", pulse = false, className }: any) {
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
function Pill({ tone = "neutral", dot, pulse, label, className, title, ...rest }: any) {
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
function MethodBadge({ method }: any) {
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
function Panel({ className, children, ...props }: any) {
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

function PanelHeader({ icon: Icon, title, desc, right, tone, className }: any) {
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

const PanelContent = ({ className, ...props }: any) => (
  <div className={cn("px-6 pb-6 pt-2", className)} {...props} />
);

const PanelFooter = ({ className, ...props }: any) => (
  <div
    className={cn("flex flex-wrap items-center gap-2 border-t border-border/50 px-6 py-4", className)}
    {...props}
  />
);

/** A single label / value row used across the health and data panels. */
function MetricRow({ icon: Icon, label, value, pill, pillDot, pillPulse, className }: any) {
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
function metricValue(m: any, key: string, unit = "") {
  const v = m?.[key];
  if (v === null || v === undefined || v === false) return "—";
  const num = Number(v);
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num * 10) / 10}${unit}`;
}

/** Clamp a raw 0-? value to a 0-100 bar width (rounds/guards outliers). */
function metricPct(v: any, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, (n / max) * 100));
}

/** Human-readable uptime from seconds, e.g. "3h 12m" — or "—" when unknown. */
function formatUptime(seconds: number | null | undefined) {
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
function MetricBar({ icon: Icon, label, value, pct, tone = "emerald" }: any) {
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
function useFade(delay = 0) {
  const reduce = useReducedMotion();
  return reduce
    ? { initial: false as const, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay },
      };
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function Settings() {
  const { theme, toggle, accent, setAccent, customColor, setCustomColor } =
    React.useContext(ThemeContext);
  const customActive = accent === CUSTOM_ACCENT;
  const [activeTab, setActiveTab] = React.useState("appearance");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [health, setHealth] = React.useState(null);
  const [lastSync, setLastSync] = React.useState(null);
  const [metrics, setMetrics] = React.useState(null);
  const [qaMode, setQaMode] = useLocalStorage("batua-qa-mode", "hybrid");
  const [chatSessionId] = useLocalStorage("batua-chat-session-id", null);

  // Custom categories state
  const [categories, setCategories] = React.useState([]);
  const [customCategories, setCustomCategories] = React.useState([]);
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [editingCategory, setEditingCategory] = React.useState(null);
  const [deleteCategoryOpen, setDeleteCategoryOpen] = React.useState(false);
  const [categoryToDelete, setCategoryToDelete] = React.useState(null);
  const [reassignTo, setReassignTo] = React.useState("");

  // Gemini API key management
  const [geminiKey, setGeminiKey] = React.useState("");
  const [savingKey, setSavingKey] = React.useState(false);
  const [testingKey, setTestingKey] = React.useState(false);
  const [keyMsg, setKeyMsg] = React.useState(null);
  const [showKey, setShowKey] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // API endpoint checks — bump to re-run every check ("Test all APIs").
  const [runNonce, setRunNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    // A single failed poll shouldn't flip the whole page to "not reachable" —
    // only declare the backend down after consecutive failures.
    const failRef = { n: 0 };
    const check = () => {
      api
        .get("/")
        .then((r) => {
          if (!active) return;
          failRef.n = 0;
          setHealth(r.data);
          setLastSync(Date.now());
        })
        .catch(() => {
          if (!active) return;
          failRef.n += 1;
          if (failRef.n >= 2) setHealth({ error: true });
        });
    };
    check();
    loadCategories();
    // Re-ping every few seconds so the Server status always reflects whether
    // the backend is actually reachable — EXCEPT while the System tab is open,
    // where the 3s metrics poll below already covers connectivity. Pausing here
    // avoids two concurrent pollers hitting the backend at once.
    if (activeTab === "system") return () => { active = false; };
    const id = setInterval(check, 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Poll live system metrics while the System tab is open. Uses exponential
  // backoff: on repeated failures the interval doubles (3s → 30s cap) and after
  // 5 consecutive failures it pauses with a visible "reconnecting" state so we
  // don't hammer an unreachable backend. Any success resets the schedule.
  const [metricsState, setMetricsState] = React.useState<"live" | "reconnecting" | "paused">("live");
  const [metricsRetry, setMetricsRetry] = React.useState(0);
  React.useEffect(() => {
    if (activeTab !== "system") return;
    let active = true;
    let timer = null;
    let fails = 0;
    let delay = 3000;

    const schedule = (ms) => {
      if (!active) return;
      timer = setTimeout(load, ms);
    };

    const load = async () => {
      if (!active) return;
      try {
        const { data } = await api.get("/settings/system-metrics");
        if (!active) return;
        setMetrics(data);
        // Keep the header status pill accurate while the root health poller is
        // paused on this tab — a successful metrics read proves the backend is up.
        setHealth((h) => (h && !h.error ? h : { app: "Batua", status: "live" }));
        setLastSync(Date.now());
        fails = 0;
        delay = 3000;
        setMetricsState("live");
        schedule(delay);
      } catch {
        if (!active) return;
        fails += 1;
        if (fails >= 2) setHealth({ error: true });
        if (fails >= 5) {
          setMetricsState("paused");
          return; // stop polling; a retry button resumes it
        }
        delay = Math.min(delay * 2, 30000);
        setMetricsState("reconnecting");
        schedule(delay);
      }
    };

    load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
    // metricsRetry lets a "Retry" button resume a paused poller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, metricsRetry]);

  /* ── Gemini key ── */

  const saveGeminiKey = async () => {
    const key = geminiKey.trim();
    if (!key) {
      setKeyMsg({ type: "error", text: "Enter a Gemini API key first." });
      return false;
    }
    setSavingKey(true);
    setKeyMsg(null);
    try {
      await api.put("/settings/gemini-key", { api_key: key });
      setGeminiKey("");
      setKeyMsg({ type: "ok", text: "Saved — Gemini is now enabled." });
      return true;
    } catch (e) {
      const detail = e?.response?.data?.detail;
      // Backend returns {reason, message} on rejection — surface the real cause.
      const reason = detail?.reason;
      const message = detail?.message || detail || e?.message || "Failed to save key";
      if (reason === "invalid_key") {
        setHealth((h) => (h ? { ...h, ai: false } : h));
      }
      setKeyMsg({ type: "error", text: message });
      toast.error(message);
      return false;
    } finally {
      // Refresh health in the background — a hiccup on that call must never
      // turn a successful key save into a "Failed to save key" error.
      api
        .get("/")
        .then((r) => {
          setHealth(r.data);
          setLastSync(Date.now());
        })
        .catch(() => {});
      setSavingKey(false);
    }
  };

  // Verify the key actually works against the live Gemini API. If the user has
  // typed a pending key, it's saved first so the server tests the new value.
  const testConnection = async () => {
    if (geminiKey.trim()) {
      const ok = await saveGeminiKey();
      if (!ok) return;
    }
    setTestingKey(true);
    setKeyMsg(null);
    try {
      const { data } = await api.post("/settings/gemini-key/test", null, { timeout: 20000 });
      setHealth((h) => ({ ...h, ai: data.valid }));
      if (data.valid) {
        setKeyMsg({ type: "ok", text: data.message || "Gemini connection verified — AI features are live." });
        toast.success("Gemini connection verified — AI features are live.");
      } else {
        setKeyMsg({ type: "error", text: data.message || "Key rejected." });
        toast.error(data.message || "Gemini rejected this key.");
      }
    } catch {
      // A correct key must not be blamed as "backend not reachable" just
      // because Google's side hiccupped — probe the backend once to tell
      // the two apart before showing a message.
      let backendUp = false;
      try {
        await api.get("/", { timeout: 5000 });
        backendUp = true;
      } catch {
        /* backend really is down */
      }
      const msg = backendUp
        ? "Gemini couldn't verify the key — check the key or retry in a moment."
        : "Backend not reachable — can't test the connection.";
      setKeyMsg({ type: "error", text: msg });
      toast.error(msg);
    } finally {
      setTestingKey(false);
    }
  };

  const copyKey = async () => {
    if (!geminiKey.trim()) return;
    try {
      await navigator.clipboard.writeText(geminiKey);
      setCopied(true);
      toast.success("API key copied to clipboard.");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — select the key manually.");
    }
  };

  const replaceKey = () => {
    setGeminiKey("");
    setKeyMsg(null);
    requestAnimationFrame(() => document.getElementById("gemini-key-input")?.focus());
    toast.info("Paste your new Gemini API key above.");
  };

  /* ── Categories ── */

  const loadCategories = async () => {
    try {
      const { data } = await api.get("/categories/");
      setCategories(data.categories || []);
      setCustomCategories(data.custom || []);
    } catch (e) {
      console.error("Failed to load categories", e);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await api.post("/categories/add", { name: newCategoryName.trim() });
      toast.success(`Category "${newCategoryName}" added`);
      setNewCategoryName("");
      loadCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add category");
    }
  };

  const startEditCategory = (cat) => {
    setEditingCategory({ ...cat });
  };

  const saveCategoryRename = async () => {
    if (!editingCategory || !editingCategory.newName?.trim()) return;
    try {
      await api.post("/categories/rename", {
        old_name: editingCategory.name,
        new_name: editingCategory.newName.trim(),
      });
      toast.success(`Category renamed to "${editingCategory.newName}"`);
      setEditingCategory(null);
      loadCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to rename category");
    }
  };

  const startDeleteCategory = (cat) => {
    setCategoryToDelete(cat);
    setReassignTo("Other");
    setDeleteCategoryOpen(true);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete || !reassignTo) return;
    try {
      await api.post("/categories/delete", {
        name: categoryToDelete.name,
        reassign_to: reassignTo,
      });
      toast.success(`Category "${categoryToDelete.name}" deleted and reassigned`);
      setDeleteCategoryOpen(false);
      setCategoryToDelete(null);
      loadCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete category");
    }
  };

  /* ── Data / backup ── */

  const clearAll = async () => {
    await api.delete("/transactions/");
    setConfirmOpen(false);
    setConfirmText("");
    toast.success("All transactions cleared");
  };

  const [restoring, setRestoring] = React.useState(false);
  const restoreInputRef = React.useRef(null);
  // Restore confirmation — staged pending data + typed keyword, mirroring the
  // delete flow so the destructive restore is never a browser-native confirm().
  const [restorePending, setRestorePending] = React.useState(null);
  const [restoreText, setRestoreText] = React.useState("");

  const downloadBackup = async () => {
    try {
      const { data } = await api.get("/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batua-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Backup downloaded — ${data.transactions?.length ?? 0} transactions, ${data.budgets?.length ?? 0} budgets`
      );
    } catch {
      toast.error("Could not create backup");
    }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.app !== "batua" || (!parsed.transactions && !parsed.budgets)) {
        throw new Error("Not a Batua backup file");
      }
      // Stage the parsed backup and ask for typed confirmation — same guardrail
      // as the destructive delete flow, never a browser-native confirm().
      setRestorePending(parsed);
      setRestoreText("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Restore failed");
    } finally {
      setRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  const confirmRestore = async () => {
    if (!restorePending) return;
    try {
      const { data } = await api.post("/restore", restorePending);
      setRestorePending(null);
      setRestoreText("");
      toast.success(
        `Restored ${data.transactions} transactions and ${data.budgets} budgets` +
          (data.skipped ? ` · skipped ${data.skipped} invalid rows` : "")
      );
      // Every page caches derived data — a clean reload is the honest way
      // to make the whole app reflect the restored dataset.
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Restore failed");
    }
  };

  const clearChatMemory = async () => {
    try {
      if (chatSessionId) {
        await api.delete(`/ml/chat/${chatSessionId}`);
      } else {
        // No session known — clear every stored session so the action is a
        // real operation, not a silent no-op that pretends to succeed.
        await api.delete("/ml/chat");
      }
      toast.success("Conversation memory cleared");
    } catch {
      toast.error("Could not clear conversation memory — backend unreachable.");
    }
  };

  /* ── Derived status ── */

  const connected = health && !health.error;
  const storageLabel =
    health?.storage === "json-file"
      ? "Local JSON file"
      : health?.storage === "sqlite"
      ? "SQLite · embedded"
      : health?.storage === "mongodb"
      ? "MongoDB"
      : (health?.storage || "—");

  const storageDetail =
    health?.storage === "json-file"
      ? "Persists between restarts"
      : health?.storage === "sqlite"
      ? "Persists between restarts"
      : health?.storage === "mongodb"
      ? "Remote database"
      : "Checking…";

  const syncLabel = lastSync ? "just now" : connected ? "just now" : "unavailable";

  // Open the in-app, theme-matched API reference (not the stock Swagger UI).
  const navigate = useNavigate();
  const openDocs = () => navigate("/api-docs");

  /* ── Render ── */

  return (
    <div className="page-enter mx-auto max-w-6xl space-y-8">
      {/* ══ Header — title, subtitle + live system cluster ══ */}
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-wide uppercase md:text-2xl">
              Settings
            </h1>
            <p className="mt-0.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Manage application preferences, AI integrations and backend services.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {health === null ? (
            <Pill tone="amber" dot pulse label="Checking…" data-testid="settings-health-checking" />
          ) : connected ? (
            <Pill
              tone="emerald"
              dot
              pulse
              label="All systems operational"
              data-testid="settings-health-ok"
            />
          ) : (
            <Pill tone="rose" dot label="Backend offline" data-testid="settings-health-error" />
          )}
          <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" />
            Environment:
            <span className="font-semibold text-foreground">Local</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            Last synced
            <span className="font-semibold text-foreground">{syncLabel}</span>
          </div>
        </div>
      </header>

      {/* ══ Segmented tabs — shared-element pill slides between sections ══ */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/60 p-1.5 backdrop-blur-sm"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-testid={tab.testid}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="settings-tab-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
                  className="absolute inset-0 rounded-xl bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                />
              )}
              <Icon className="relative h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
              <span className="relative whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ══ Tab content ══ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          {...useFade(0)}
          className="space-y-6"
          role="tabpanel"
          tabIndex={0}
        >
          {activeTab === "appearance" && (
            <AppearanceTab
              theme={theme}
              toggle={toggle}
              accent={accent}
              setAccent={setAccent}
              customColor={customColor}
              setCustomColor={setCustomColor}
              customActive={customActive}
            />
          )}

          {activeTab === "ai" && (
            <div className="space-y-6">
              <Panel>
                <PanelHeader
                  icon={Bot}
                  title="Insights mode"
                  desc="How the AI Insights chat answers your questions."
                />
                <PanelContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {QA_MODES.map((mode) => {
                      const active = qaMode === mode.id;
                      const Icon = mode.icon;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setQaMode(mode.id)}
                          data-testid={`qa-mode-${mode.id}`}
                          className={cn(
                            "group flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all duration-200",
                            active
                              ? "border-primary/40 bg-primary/5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                              : "border-border/60 hover:border-border hover:bg-muted/40"
                          )}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                                active
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            {active && (
                              <Badge variant="default" className="text-[10px]">
                                Active
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm font-medium leading-snug">{mode.label}</div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{mode.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </PanelContent>
              </Panel>

              <MicTest />
            </div>
          )}

          {activeTab === "system" && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-12">
                {/* ── Backend Connection — system health panel ── */}
                <Panel className="lg:col-span-5">
                  <PanelHeader
                    icon={Server}
                    title="Backend Connection"
                    desc="Server status and live connectivity."
                    right={
                      health === null ? (
                        <Pill tone="amber" dot pulse label="Checking…" />
                      ) : connected ? (
                        <Pill tone="emerald" dot pulse label="Live" />
                      ) : (
                        <Pill tone="rose" dot label="Offline" />
                      )
                    }
                  />
                  <PanelContent className="space-y-1">
                    <MetricRow
                      icon={Database}
                      label="Storage engine"
                      value={storageLabel}
                      pill={connected ? "emerald" : "neutral"}
                      pillDot
                      pillPulse={connected}
                    />
                    <MetricRow
                      icon={HardDrive}
                      label="Database"
                      value={storageDetail}
                      pill={connected ? "blue" : "neutral"}
                      pillDot
                    />
                    <MetricRow
                      icon={Sparkles}
                      label="Gemini AI"
                      value={health ? (health.ai ? "Enabled" : "Rule-based") : "…"}
                      pill={health?.ai ? "violet" : connected ? "neutral" : "neutral"}
                      pillDot
                    />
                    <MetricRow icon={Timer} label="Server uptime" value={formatUptime(metrics?.uptime_seconds)} />
                    <MetricRow icon={FileCode2} label="Version" value={`${health?.app || "Batua"} v1.0.0`} />
                    <MetricRow icon={Globe} label="Server IP" value="127.0.0.1:8001" />

                    {/* Live system metrics — real host + backend usage. */}
                    <div className="mt-8 rounded-xl bg-muted/40 px-4 py-5 ring-1 ring-inset ring-border/40">
                      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Activity className="h-3.5 w-3.5" /> System metrics
                        {metricsState !== "paused" && metrics && (
                          <span className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-muted-foreground/70">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                metricsState === "live"
                                  ? "animate-pulse bg-emerald-500"
                                  : "animate-pulse bg-amber-500"
                              )}
                            />{" "}
                            {metricsState === "live" ? "live" : "reconnecting"}
                          </span>
                        )}
                        {metricsState === "paused" && (
                          <button
                            type="button"
                            onClick={() => setMetricsRetry((n) => n + 1)}
                            className="ml-auto inline-flex cursor-pointer items-center gap-1 normal-case tracking-normal text-rose-500 hover:text-rose-400"
                          >
                            <RotateCcw className="h-3 w-3" /> retry
                          </button>
                        )}
                      </div>
                      <div className="space-y-3.5">
                        <MetricBar
                          icon={Cpu}
                          label="CPU"
                          value={metricValue(metrics, "cpu", "%")}
                          pct={metricPct(metrics?.cpu)}
                        />
                        <MetricBar
                          icon={MemoryStick}
                          label="Memory"
                          value={metricValue(metrics, "memory", "%")}
                          pct={metricPct(metrics?.memory)}
                        />
                        <MetricBar
                          icon={Gauge}
                          label="Latency"
                          value={metricValue(metrics, "latency_ms", " ms")}
                          pct={metricPct(metrics?.latency_ms, 50)}
                          tone="blue"
                        />
                      </div>
                    </div>
                  </PanelContent>
                </Panel>

                {/* ── API Endpoints — enterprise API management ── */}
                <Panel className="lg:col-span-7">
                  <PanelHeader
                    icon={FileCode2}
                    title="API Endpoints"
                    desc="Each route is pinged to confirm the backend answers."
                    right={
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {ENDPOINTS.length} routes
                      </span>
                    }
                  />
                  <PanelContent className="pt-0">
                    <div className="divide-y divide-border/50 rounded-xl ring-1 ring-inset ring-border/40">
                      {ENDPOINTS.map((e) => (
                        <EndpointRow key={`${e.path}-${e.method}`} {...e} runNonce={runNonce} />
                      ))}
                    </div>
                  </PanelContent>
                  <PanelFooter className="justify-between">
                    <p className="hidden text-xs text-muted-foreground sm:block">
                      Auto-checks every route against the running backend.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={openDocs}>
                        <BookOpen className="h-4 w-4" /> API docs
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRunNonce((n) => n + 1)}
                        data-testid="settings-test-apis"
                      >
                        <Zap className="h-4 w-4" /> Test all APIs
                      </Button>
                    </div>
                  </PanelFooter>
                </Panel>
              </div>

              {/* ── Gemini AI — the premium card, full-width ── */}
              <GeminiCard
                health={health}
                connected={connected}
                geminiKey={geminiKey}
                setGeminiKey={setGeminiKey}
                showKey={showKey}
                setShowKey={setShowKey}
                savingKey={savingKey}
                testingKey={testingKey}
                keyMsg={keyMsg}
                copied={copied}
                onSave={saveGeminiKey}
                onTest={testConnection}
                onCopy={copyKey}
                onReplace={replaceKey}
              />

              {/* ── Security & System Information ── */}
              <Panel>
                <div className="grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
                  {SECURITY_FEATURES.map((f) => {
                    const Icon = f.icon;
                    return (
                      <div
                        key={f.title}
                        className="group flex flex-col gap-3 bg-card p-6 transition-colors hover:bg-muted/30"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 group-hover:-translate-y-0.5">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="text-sm font-semibold">{f.title}</div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {/* ── Footer / help ── */}
              <Panel>
                <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground ring-1 ring-inset ring-border/40">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">Explore Batua</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Browse the API reference, or file an issue on GitHub.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={REPO_URL}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <Github className="h-4 w-4" /> GitHub
                    </a>
                    <Button variant="outline" size="sm" onClick={openDocs}>
                      <BookOpen className="h-4 w-4" /> API documentation
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadBackup}>
                      <Download className="h-4 w-4" /> Download backup
                    </Button>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {activeTab === "data" && (
            <div className="space-y-6">
              {/* Runtime configuration */}
              <Panel>
                <PanelHeader
                  icon={Landmark}
                  title="Runtime"
                  desc="Your current runtime configuration."
                />
                <PanelContent className="space-y-1">
                  <MetricRow icon={IndianRupee} label="Currency" value="Indian Rupee (₹) — INR" />
                  <MetricRow
                    icon={Database}
                    label="Storage backend"
                    value={storageLabel}
                    pill={connected ? "emerald" : "neutral"}
                    pillDot
                  />
                  <MetricRow
                    icon={Sparkles}
                    label="AI insights (Gemini)"
                    value={health ? (health.ai ? "Connected" : "Rule-based fallback") : "…"}
                    pill={health?.ai ? "violet" : connected ? "neutral" : "neutral"}
                    pillDot
                  />
                </PanelContent>
              </Panel>

              {/* Backup & Restore */}
              <Panel>
                <PanelHeader
                  icon={HardDrive}
                  title="Backup & Restore"
                  desc="Export everything to a file, or load a previous backup."
                />
                <PanelContent className="space-y-1">
                  <ActionRow
                    icon={Download}
                    title="Download full backup"
                    desc="One JSON file with every transaction and budget — keep it anywhere, restore it on any machine."
                    buttonLabel="Backup"
                    buttonTestid="backup-download-btn"
                    onAction={downloadBackup}
                  />
                  <ActionRow
                    icon={UploadCloud}
                    title="Restore from backup"
                    desc="Load a previously downloaded backup file. Replaces all current data."
                    buttonLabel={restoring ? "Restoring…" : "Restore"}
                    buttonTestid="backup-restore-btn"
                    onAction={() => restoreInputRef.current?.click()}
                    buttonDisabled={restoring}
                  />
                </PanelContent>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => restoreBackup(e.target.files?.[0])}
                  data-testid="backup-restore-input"
                />
              </Panel>

              {/* Custom Categories */}
              <Panel>
                <PanelHeader
                  icon={Tags}
                  title="Custom Categories"
                  desc="Add your own tags for grouping transactions."
                />
                <PanelContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="New category name"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCategory()}
                      data-testid="new-category-input"
                      className="h-11 rounded-xl"
                    />
                    <Button onClick={addCategory} data-testid="add-category-btn" className="h-11 rounded-xl px-5">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {customCategories.map((cat) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 transition-colors hover:bg-muted/40"
                      >
                        {editingCategory?.name === cat ? (
                          <div className="flex flex-1 items-center gap-2">
                            <Input
                              defaultValue={cat}
                              autoFocus
                              onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && saveCategoryRename()}
                              data-testid={`edit-category-input-${cat}`}
                              className="h-9 rounded-lg"
                            />
                            <Button size="sm" onClick={saveCategoryRename}>
                              <Check className="h-4 w-4" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <span className="h-2 w-2 rounded-full bg-primary/70" />
                              <span className="text-sm font-medium">{cat}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => startEditCategory(cat)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => startDeleteCategory(cat)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {customCategories.length === 0 && (
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
                        <Tags className="h-4 w-4" /> No custom categories yet. Add one above.
                      </div>
                    )}
                  </div>
                </PanelContent>
              </Panel>

              {/* Danger zone — destructive actions stay red & isolated */}
              <Panel className="border-rose-500/25 bg-gradient-to-b from-rose-500/[0.04] to-transparent">
                <PanelHeader
                  icon={AlertTriangle}
                  title="Danger zone"
                  desc="Destructive actions — read carefully before proceeding."
                  tone="rose"
                />
                <PanelContent className="space-y-1">
                  <ActionRow
                    destructive
                    icon={Trash2}
                    title="Clear all transactions"
                    desc="Permanently deletes every transaction. Cannot be undone."
                    buttonLabel="Clear all"
                    buttonTestid="clear-all-btn"
                    onAction={() => setConfirmOpen(true)}
                    buttonVariant="destructive"
                  />
                  <ActionRow
                    destructive
                    icon={RotateCcw}
                    title="Clear conversation memory"
                    desc="Resets the finance assistant's chat history and follow-up context."
                    buttonLabel="Clear chat"
                    buttonTestid="clear-chat-memory-btn"
                    onAction={clearChatMemory}
                  />
                </PanelContent>
              </Panel>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ══ Dialogs ══ */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setConfirmText(""); }}>
        <DialogContent onClose={() => { setConfirmOpen(false); setConfirmText(""); }}>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete all your transactions. This action cannot be undone.
              Type <strong>DELETE</strong> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            data-testid="confirm-clear-input"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={clearAll}
              disabled={confirmText.trim().toUpperCase() !== "DELETE"}
              data-testid="confirm-clear-btn"
            >
              Yes, delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(restorePending)} onOpenChange={(o) => { if (!o) setRestorePending(null); setRestoreText(""); }}>
        <DialogContent onClose={() => { setRestorePending(null); setRestoreText(""); }}>
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              This will <strong>replace</strong> all current data with{" "}
              {restorePending?.transactions?.length ?? 0} transactions and{" "}
              {restorePending?.budgets?.length ?? 0} budgets. This action cannot be undone.
              Type <strong>RESTORE</strong> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={restoreText}
            onChange={(e) => setRestoreText(e.target.value)}
            placeholder='Type "RESTORE" to confirm'
            data-testid="confirm-restore-input"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRestorePending(null); setRestoreText(""); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRestore}
              disabled={restoreText.trim().toUpperCase() !== "RESTORE"}
              data-testid="confirm-restore-btn"
            >
              Yes, restore backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteCategoryOpen} onOpenChange={setDeleteCategoryOpen}>
        <DialogContent onClose={() => { setDeleteCategoryOpen(false); setCategoryToDelete(null); }}>
          <DialogHeader>
            <DialogTitle>Delete category "{categoryToDelete?.name}"?</DialogTitle>
            <DialogDescription>Choose a category to reassign existing transactions to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reassign to:</label>
            <select
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              data-testid="reassign-category-select"
            >
              {categories.filter((c) => c !== categoryToDelete?.name).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteCategoryOpen(false); setCategoryToDelete(null); }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCategory} data-testid="confirm-delete-category-btn">
              Delete & Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Appearance tab ───────────────────────────────────────────── */

function AppearanceTab({ theme, toggle, accent, setAccent, customColor, setCustomColor, customActive }: any) {
  return (
    <Panel>
      <PanelHeader
        icon={Palette}
        title="Theme"
        desc="Light/dark mode and the accent colour that tints the whole app."
      />
      <PanelContent className="space-y-6">
        {/* Mode — two selectable cards, premium segmented choice */}
        <div>
          <div className="mb-1 text-sm font-medium">Mode</div>
          <div className="mb-3 text-xs text-muted-foreground">Switch between light and dark mode</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { id: "light", icon: Sun, label: "Light", desc: "Bright and airy" },
              { id: "dark", icon: Moon, label: "Dark", desc: "Deep and focused" },
            ].map((m) => {
              const active = theme === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { if (!active) toggle(); }}
                  aria-pressed={active}
                  data-testid={`settings-theme-${m.id}`}
                  data-settings-theme-toggle=""
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-200",
                    active
                      ? "border-primary/40 bg-primary/5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                      : "border-border/60 hover:border-border hover:bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.desc}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset transition-all",
                      active
                        ? "bg-primary text-primary-foreground ring-primary"
                        : "ring-border text-transparent"
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent color */}
        <div className="border-t border-border/50 pt-6">
          <div className="mb-1 text-sm font-medium">Accent color</div>
          <div className="mb-3 text-xs text-muted-foreground">Choose the overall color theme of the app</div>
          <div className="flex flex-wrap items-center gap-3" data-testid="accent-picker">
            {ACCENTS.map((a) => {
              const active = a.id === accent;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccent(a.id)}
                  title={a.label ?? a.id}
                  aria-label={a.label ?? a.id}
                  aria-pressed={active}
                  data-testid={`accent-${a.id}`}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:scale-110",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active && "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  )}
                  style={{ backgroundColor: `hsl(${a.swatch})` }}
                >
                  {active && <Check className="h-4 w-4 text-white drop-shadow" />}
                </button>
              );
            })}

            {/* Custom "any color" picker */}
            <label
              title="Custom color"
              aria-label="Custom color"
              data-testid="accent-custom"
              className={cn(
                "relative h-9 w-9 cursor-pointer overflow-hidden rounded-full transition-transform hover:scale-110 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                customActive && "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
              style={
                customActive
                  ? { backgroundColor: customColor }
                  : { background: "conic-gradient(red, orange, yellow, lime, aqua, blue, magenta, red)" }
              }
            >
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setAccent(CUSTOM_ACCENT);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        {/* Live preview — repaints instantly when an accent is picked,
            so the choice is felt on this page, not just elsewhere. */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">Primary button</Button>
            <Badge>Badge</Badge>
            <svg width="120" height="28" viewBox="0 0 120 28" aria-hidden="true">
              <polyline
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="2,22 22,16 42,19 62,9 82,13 102,4 118,8"
              />
              <circle cx="118" cy="8" r="3" fill="hsl(var(--primary))" />
            </svg>
            <span className="text-sm font-medium text-primary">Accent text</span>
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}

/* ── Gemini AI card ────────────────────────────────────────────── */

function GeminiCard({
  health,
  connected,
  geminiKey,
  setGeminiKey,
  showKey,
  setShowKey,
  savingKey,
  testingKey,
  keyMsg,
  copied,
  onSave,
  onTest,
  onCopy,
  onReplace,
}: any) {
  const aiEnabled = Boolean(health?.ai);

  return (
    <Panel className="relative overflow-hidden">
      {/* Soft purple wash so the AI card reads distinct from the system cards. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.07] blur-3xl"
      />

      <div className="relative space-y-5 p-6">
        {/* Header — title + live status pill. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 ring-1 ring-inset ring-violet-500/25">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold leading-tight tracking-tight">Gemini AI</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                AI parsing · receipt scanning · smarter categorisation
              </div>
            </div>
          </div>
          <Pill
            tone={aiEnabled ? "emerald" : "neutral"}
            dot
            label={aiEnabled ? "Active" : "Not configured"}
            title={aiEnabled ? "Gemini key verified & in use" : "No Gemini key set — local rules handle parsing"}
          />
        </div>

        {/* Body — key form left, compact status right. */}
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          {/* Key form */}
          <div className="space-y-3">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="gemini-key-input"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                placeholder={aiEnabled ? "•".repeat(24) + "  (key is set — paste a new one to replace)" : "Paste your key —e.g. AIzaSy…"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                data-testid="gemini-key-input"
                className="h-11 rounded-xl pl-10 pr-20"
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={onCopy}
                  disabled={!geminiKey.trim()}
                  aria-label="Copy API key"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onSave} disabled={savingKey} data-testid="gemini-key-save" className="rounded-xl">
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {savingKey ? "Saving…" : "Save key"}
              </Button>
              <Button variant="secondary" onClick={onTest} disabled={testingKey} className="rounded-xl">
                <Zap className={cn("h-4 w-4", testingKey && "animate-pulse")} />{" "}
                {testingKey ? "Testing…" : "Test connection"}
              </Button>
              <Button variant="ghost" onClick={onReplace} className="rounded-xl text-muted-foreground">
                <RotateCcw className="h-4 w-4" /> Replace
              </Button>
            </div>

            {keyMsg && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  keyMsg.type === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}
              >
                {keyMsg.type === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {keyMsg.text}
              </p>
            )}
          </div>

          {/* Compact status card — the meaningful facts, no placeholder tiles. */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 ring-1 ring-inset ring-border/40">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Key status</span>
              <Pill tone={aiEnabled ? "emerald" : "neutral"} label={aiEnabled ? "Active" : "Not configured"} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Model</span>
              <span className="font-medium">{health?.ai_model || "—"}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Where it lives</span>
              <span className="text-right text-xs text-muted-foreground">Server .env — never in the browser</span>
            </div>
            <p className="mt-3 border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
              When Gemini is off, parsing falls back to the local rules engine — everything keeps working.
            </p>
          </div>
        </div>

        {/* Compact security note. */}
        <p className="flex items-start gap-2 rounded-lg bg-violet-500/[0.07] p-3 text-[11px] leading-relaxed text-muted-foreground ring-1 ring-inset ring-violet-500/15">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
          Your key stays on this device — written only to the server&apos;s{" "}
          <code className="rounded bg-black/20 px-1 py-0.5 dark:bg-white/10">.env</code> file, never to the browser,
          localStorage or analytics, and used only for the Gemini requests you trigger.
        </p>
      </div>
    </Panel>
  );
}

/* ── Reusable pieces ───────────────────────────────────────────── */

/** A full-width action row (backup, restore, danger zone). */
function ActionRow({
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
function EndpointRow({ label, path, method = "GET", data, timeout = 5000, runNonce }: any) {
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

/* ── Static security copy ──────────────────────────────────────── */

const SECURITY_FEATURES = [
  {
    icon: Lock,
    title: "Encrypted data",
    desc: "Sensitive values stay on the server — keys live in .env, never in the browser.",
  },
  {
    icon: ShieldCheck,
    title: "Secure requests",
    desc: "Backend responses are hardened with strict security headers and no-cache rules.",
  },
  {
    icon: EyeOff,
    title: "Privacy first",
    desc: "No API keys or transaction data are ever uploaded to a third-party service.",
  },
  {
    icon: RotateCcw,
    title: "Automatic backups",
    desc: "Export a full JSON backup any time and restore it on any machine.",
  },
];
