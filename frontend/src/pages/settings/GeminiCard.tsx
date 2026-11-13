import {
  AlertTriangle,
  Sparkles,
  Bot,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  RotateCcw,
  Zap,
  Loader2,
  KeyRound,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Pill, Panel } from "./primitives";

/* ── Gemini AI card ────────────────────────────────────────────── */

export default function GeminiCard({
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

      <div className="relative space-y-4 p-6">
        {/* Header — cleaner, more focused */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-400 ring-1 ring-inset ring-violet-500/25 shadow-sm">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="text-base font-semibold leading-tight tracking-tight">Gemini AI</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                AI-powered parsing & categorization
              </div>
            </div>
          </div>
          <Pill
            tone={aiEnabled ? "emerald" : "neutral"}
            dot={aiEnabled}
            pulse={aiEnabled}
            label={aiEnabled ? "Active" : "Not configured"}
            title={aiEnabled ? "Gemini key verified & in use" : "No Gemini key set — local rules handle parsing"}
          />
        </div>

        {/* Key input section - cleaner layout */}
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-background to-muted/30/50 p-4 ring-1 ring-inset ring-border/40">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="gemini-key-input"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              placeholder={aiEnabled ? "•".repeat(24) + "  (key is set — paste a new one to replace)" : "Paste your Gemini API key"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              data-testid="gemini-key-input"
              className="h-11 rounded-xl pl-10 pr-24 bg-background/50"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onCopy}
                disabled={!geminiKey.trim()}
                aria-label="Copy API key"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Action buttons - better visual hierarchy */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={onSave} disabled={savingKey} data-testid="gemini-key-save" className="rounded-xl gap-2 shadow-sm">
              {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {savingKey ? "Saving…" : "Save key"}
            </Button>
            <Button variant="secondary" onClick={onTest} disabled={testingKey} className="rounded-xl gap-2">
              <Zap className={cn("h-4 w-4", testingKey && "animate-pulse")} />
              {testingKey ? "Testing…" : "Test connection"}
            </Button>
            {aiEnabled && (
              <Button variant="ghost" onClick={onReplace} className="rounded-xl gap-2 text-muted-foreground hover:text-foreground">
                <RotateCcw className="h-4 w-4" /> Replace
              </Button>
            )}
          </div>

          {/* Status message */}
          {keyMsg && (
            <div
              className={cn(
                "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
                keyMsg.type === "ok" 
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-inset ring-rose-500/20"
              )}
            >
              {keyMsg.type === "ok" ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {keyMsg.text}
            </div>
          )}
        </div>

        {/* Info cards grid - better layout */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/20 to-muted/10 p-4 ring-1 ring-inset ring-border/40">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
              <Bot className="h-3.5 w-3.5" />
              Model
            </div>
            <div className="text-sm font-semibold">{health?.ai_model || "—"}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/20 to-muted/10 p-4 ring-1 ring-inset ring-border/40">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              Security
            </div>
            <div className="text-sm font-semibold">Server-side only</div>
          </div>
        </div>

        {/* Security note - cleaner design */}
        <div className="flex items-start gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-4 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
          <p>
            Your API key is stored securely on the server and never exposed to the browser or analytics. 
            Without Gemini, parsing falls back to local rules — everything keeps working.
          </p>
        </div>
      </div>
    </Panel>
  );
}
