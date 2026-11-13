import {
  Database,
  Bot,
  Palette,
  ShieldCheck,
  EyeOff,
  RotateCcw,
  Lock,
  Wifi,
  Zap,
  Blend,
  Keyboard,
} from "lucide-react";

// How the AI Insights chat answers questions. Read by QAChatWidget.
export const QA_MODES = [
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

export const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette, testid: "settings-tab-appearance" },
  { id: "ai", label: "AI & Voice", icon: Bot, testid: "settings-tab-ai" },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard, testid: "settings-tab-shortcuts" },
  { id: "system", label: "System", icon: Wifi, testid: "settings-tab-system" },
  { id: "data", label: "Data", icon: Database, testid: "settings-tab-data" },
];

// The routes pinged on the System tab. `data` is the POST body when the
// endpoint only accepts a body (NL parsing).
export const ENDPOINTS = [
  { label: "Transactions API", path: "/transactions/", method: "GET" },
  { label: "Analytics API", path: "/analytics/category-breakdown", method: "GET" },
  { label: "Dashboard API", path: "/dashboard/metrics", method: "GET" },
  { label: "Categories API", path: "/categories/", method: "GET" },
  { label: "NL Parser", path: "/parse-nl", method: "POST", data: { text: "test" } },
  // /ml/spending-patterns warms up its analyzer on first hit and can exceed the
  // default 5s — give it room so a slow-but-healthy endpoint isn't flagged down.
  { label: "ML Insights", path: "/ml/spending-patterns", method: "GET", timeout: 20000 },
];

export const REPO_URL = "https://github.com/anshuldhiman-ai/Batua";

/* ── Static security copy ──────────────────────────────────────── */

export const SECURITY_FEATURES = [
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
