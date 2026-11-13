import React from "react";
import {
  AlertTriangle,
  Trash2,
  Database,
  Download,
  UploadCloud,
  Sparkles,
  Bot,
  Plus,
  Edit,
  X,
  Check,
  RotateCcw,
  Cpu,
  MemoryStick,
  Gauge,
  Timer,
  Activity,
  Zap,
  FileCode2,
  Github,
  BookOpen,
  Globe,
  Landmark,
  HardDrive,
  Tags,
  Settings2,
  Server,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ThemeContext } from "@/App";
import MicTest from "@/components/MicTest";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { CUSTOM_ACCENT } from "@/lib/themes";
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
import { useAuth } from "@/components/Auth";
import {
  api,
  getActiveCurrency,
  setActiveCurrency,
  type CurrencyCode,
  type CurrencyConfig,
} from "@/lib/utils-finance";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import UserGuide from "@/components/UserGuide";
import { parseBackupFile } from "@/lib/backupValidation";
import { Pill, Panel, PanelHeader, PanelContent, PanelFooter, MetricRow, metricValue, metricPct, formatUptime, MetricBar, useFade, ActionRow, EndpointRow } from "./settings/primitives";
import { QA_MODES, TABS, ENDPOINTS, REPO_URL, SECURITY_FEATURES } from "./settings/constants";
import ShortcutsTab from "./settings/ShortcutsTab";
import AppearanceTab from "./settings/AppearanceTab";
import GeminiCard from "./settings/GeminiCard";

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

/* ── Main page ─────────────────────────────────────────────────── */

export default function Settings() {
  const { theme, toggle, accent, setAccent, customColor, setCustomColor } =
    React.useContext(ThemeContext);
  const { changePassword, logout } = useAuth();
  const queryClient = useQueryClient();
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
  
  // User guide state
  const [userGuideOpen, setUserGuideOpen] = React.useState(false);

  // Change password form state
  const [pwCurrent, setPwCurrent] = React.useState("");
  const [pwNew, setPwNew] = React.useState("");
  const [pwConfirm, setPwConfirm] = React.useState("");
  const [pwSaving, setPwSaving] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Gemini API key management
  const [geminiKey, setGeminiKey] = React.useState("");
  const [savingKey, setSavingKey] = React.useState(false);
  const [testingKey, setTestingKey] = React.useState(false);
  const [keyMsg, setKeyMsg] = React.useState(null);
  const [showKey, setShowKey] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Currency selection state
  const [currentCurrency, setCurrentCurrency] = React.useState<CurrencyConfig>(() => getActiveCurrency());

  const handleCurrencyChange = (code: CurrencyCode) => {
    setActiveCurrency(code);
    const updated = getActiveCurrency();
    setCurrentCurrency(updated);
    toast.success(`Currency changed to ${updated.label} (${updated.symbol})`);
  };

  // Database storage maintenance & demo data seeder
  const [dbHealth, setDbHealth] = React.useState<any>(null);
  const [vacuuming, setVacuuming] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);

  const fetchDbHealth = React.useCallback(async () => {
    try {
      const { data } = await api.get("/settings/db-health");
      setDbHealth(data);
    } catch {
      // ignore
    }
  }, []);

  const handleVacuum = async () => {
    setVacuuming(true);
    try {
      const { data } = await api.post("/settings/db-vacuum");
      toast.success(data?.message || "Database defragmented and vacuumed successfully!");
      await fetchDbHealth();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to optimize database");
    } finally {
      setVacuuming(false);
    }
  };

  const handleSeedDemoData = async () => {
    setSeeding(true);
    try {
      const { data } = await api.post("/settings/seed-demo-data");
      queryClient.invalidateQueries();
      toast.success(data?.message || "Sample portfolio data loaded with 35+ transactions!");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to seed demo data");
    } finally {
      setSeeding(false);
    }
  };

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

  React.useEffect(() => {
    if (activeTab === "system") {
      fetchDbHealth();
    }
  }, [activeTab, fetchDbHealth]);

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
        name: categoryToDelete,
        reassign_to: reassignTo,
      });
      toast.success(`Category "${categoryToDelete}" deleted and reassigned`);
      setDeleteCategoryOpen(false);
      setCategoryToDelete(null);
      loadCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete category");
    }
  };

  /* ── Data / backup ── */

  const clearAll = async () => {
    try {
      await api.delete("/transactions/", { params: { confirm: "CONFIRM_DELETE_ALL" } });
      setConfirmOpen(false);
      setConfirmText("");
      // Drop every cached dataset derived from transactions — otherwise the
      // Dashboard/Transactions keep showing the rows we just deleted (there is
      // no default staleTime and refetchOnWindowFocus is off).
      queryClient.invalidateQueries();
      toast.success("All transactions cleared");
    } catch (e) {
      // Surface the failure instead of leaving an unhandled promise rejection
      // with no user feedback.
      toast.error(e.response?.data?.detail || "Failed to clear transactions");
    }
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
      const result = await parseBackupFile(file);
      if (!result.valid) {
        throw new Error(result.error || "Invalid backup file");
      }
      if (result.warnings?.length) {
        result.warnings.forEach((w) => toast.warning(w));
      }
      // Stage the validated backup and ask for typed confirmation — same guardrail
      // as the destructive delete flow, never a browser-native confirm().
      setRestorePending(result.data);
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

  const [chatClearOpen, setChatClearOpen] = React.useState(false);
  const [chatClearing, setChatClearing] = React.useState(false);

  const performClearChatMemory = async () => {
    setChatClearing(true);
    try {
      if (chatSessionId) {
        await api.delete(`/ml/chat/${chatSessionId}`);
        toast.success("Conversation memory cleared");
      } else {
        // No session known — clear every stored session so the action is a
        // real operation, not a silent no-op that pretends to succeed.
        const { data } = await api.delete("/ml/chat");
        const n = Number(data?.deleted) || 0;
        toast.success(n > 0 ? `Cleared ${n} conversation${n === 1 ? "" : "s"}` : "No conversation memory to clear");
      }
      setChatClearOpen(false);
    } catch {
      toast.error("Could not clear conversation memory — backend unreachable.");
    } finally {
      setChatClearing(false);
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
    <div className="page-enter space-y-6">
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
              currentCurrency={currentCurrency}
              onCurrencyChange={handleCurrencyChange}
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

          {activeTab === "shortcuts" && <ShortcutsTab />}

          {activeTab === "system" && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-12">
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
                    <div className="mt-5 rounded-xl bg-muted/40 px-3 py-3 ring-1 ring-inset ring-border/40">
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                      <div className="space-y-2.5">
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

              {/* ── Database Storage & Maintenance ── */}
              <Panel>
                <PanelHeader
                  icon={HardDrive}
                  title="Database Storage & Engine"
                  desc="SQLite WAL journaling status, page defragmentation, and integrity verification."
                  right={
                    dbHealth ? (
                      <Pill
                        tone={dbHealth.integrity === "ok" ? "emerald" : "rose"}
                        dot
                        label={dbHealth.integrity === "ok" ? "Integrity OK" : "Needs Repair"}
                      />
                    ) : null
                  }
                />
                <PanelContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
                      <div className="text-xs text-muted-foreground">Storage Engine</div>
                      <div className="mt-1 text-sm font-semibold uppercase">{dbHealth?.storage || storageLabel}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
                      <div className="text-xs text-muted-foreground">Journal Mode</div>
                      <div className="mt-1 text-sm font-semibold">{dbHealth?.journal_mode || "WAL (Write-Ahead)"}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
                      <div className="text-xs text-muted-foreground">Database Disk Size</div>
                      <div className="mt-1 text-sm font-semibold">{dbHealth?.file_size_formatted || "—"}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
                      <div className="text-xs text-muted-foreground">Page Count</div>
                      <div className="mt-1 text-sm font-semibold">{dbHealth?.page_count ?? "—"} pages</div>
                    </div>
                  </div>

                  <ActionRow
                    icon={Zap}
                    title="Optimize Database (VACUUM)"
                    desc="Rebuilds database file, reclaims unallocated pages, defragments tables, and updates internal query planner statistics."
                    buttonLabel={vacuuming ? "Optimizing…" : "Optimize DB"}
                    buttonTestid="vacuum-db-btn"
                    onAction={handleVacuum}
                    buttonDisabled={vacuuming}
                  />
                </PanelContent>
              </Panel>

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
                  <MetricRow
                    icon={Landmark}
                    label="Active Currency"
                    value={`${currentCurrency.label} (${currentCurrency.symbol}) — ${currentCurrency.code}`}
                    pill="blue"
                    pillDot
                  />
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

              {/* Sample Portfolio Dataset */}
              <Panel>
                <PanelHeader
                  icon={Sparkles}
                  title="Sample Portfolio Dataset"
                  desc="Preload curated transactions, budgets, and goals to demonstrate full app capabilities."
                />
                <PanelContent className="space-y-1">
                  <ActionRow
                    icon={Sparkles}
                    title="Seed Sample Portfolio Data"
                    desc="Populate account with 35+ realistic transactions across income, dining, groceries, tech, goals, and budgets. Ideal for demonstrations and recruiter walkthroughs."
                    buttonLabel={seeding ? "Seeding…" : "Seed Sample Data"}
                    buttonTestid="seed-demo-data-btn"
                    onAction={handleSeedDemoData}
                    buttonDisabled={seeding}
                  />
                </PanelContent>
              </Panel>

              {/* Help & Support */}
              <Panel>
                <PanelHeader
                  icon={HelpCircle}
                  title="Help & Support"
                  desc="Learn how to use Batua effectively."
                />
                <PanelContent className="space-y-1">
                  <ActionRow
                    icon={BookOpen}
                    title="User Guide"
                    desc="Comprehensive guide to all features and keyboard shortcuts."
                    buttonLabel="Open Guide"
                    onAction={() => setUserGuideOpen(true)}
                  />
                  <ActionRow
                    icon={Github}
                    title="GitHub Repository"
                    desc="Report issues, view source code, or contribute to the project."
                    buttonLabel="Visit"
                    onAction={() => window.open("https://github.com/anshuldhiman-ai/Batua", "_blank")}
                  />
                </PanelContent>
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
                    onAction={() => setChatClearOpen(true)}
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

      <ConfirmDialog
        open={chatClearOpen}
        onOpenChange={setChatClearOpen}
        title="Clear conversation memory?"
        description="This resets the finance assistant's chat history and follow-up context. Your transactions are not affected."
        confirmLabel="Clear chat"
        busy={chatClearing}
        onConfirm={performClearChatMemory}
        testId="clear-chat-dialog"
      />

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
            <DialogTitle>Delete category "{categoryToDelete}"?</DialogTitle>
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
              {categories.filter((c) => c !== categoryToDelete).map((cat) => (
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

      <UserGuide open={userGuideOpen} onClose={() => setUserGuideOpen(false)} />
    </div>
  );
}
