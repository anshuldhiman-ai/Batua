import React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  X,
  Send,
  Mic,
  Cpu,
  RotateCcw,
  ChevronRight,
  Sparkles,
  ArrowDown,
  TrendingDown,
  PiggyBank,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api, formatINR } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/useLocalStorage";

/**
 * Floating conversational assistant — a round launcher button (bottom-right)
 * that opens a chat panel. Rendered only on the AI Insights page.
 *
 * Answers are computed by the backend's pattern-matching Q&A engine and,
 * when an Ollama server is reachable, reworded by the configured local LLM
 * (shown in the panel header).
 */

// Icons cycled through the welcome starter-prompt cards, so each suggestion
// reads as a distinct, tappable action rather than a wall of text.
const STARTER_ICONS = [TrendingDown, PiggyBank, Receipt, AlertTriangle];

// Shown before the backend suggestions load (or if it returns none), so the
// empty state never looks broken.
const FALLBACK_STARTERS = [
  "What is my biggest expense?",
  "How much did I save this month?",
  "Show my recent transactions",
  "Any unusual spending lately?",
];

function timeLabel(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ─── Assistant avatar — gradient sparkle badge ───────────────────── */
function AssistantAvatar({ className }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-400 text-white shadow-sm",
        className
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
    </div>
  );
}

/* ─── Rich detail block rendered inside assistant answers ─────────── */
function AnswerDetails({ msg }) {
  const { type, details } = msg;
  if (!details) return null;
  return (
    <div className="mt-2.5 space-y-2 border-t border-foreground/10 pt-2">
      {type === "category_spending" && (
        <div className="space-y-1 text-xs">
          <div>Category: <strong>{details.category}</strong></div>
          <div>Total Amount: <strong>{formatINR(details.value)}</strong></div>
        </div>
      )}

      {type === "keyword_search" && details.transactions?.length > 0 && (
        <div className="space-y-1.5 text-[11px]">
          <div className="mb-1 font-semibold">Recent Matching Transactions:</div>
          <div className="space-y-1">
            {details.transactions.map((t, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 rounded-md bg-background/50 p-1.5">
                <span className="truncate">{t.description} ({t.date})</span>
                <span className="shrink-0 font-semibold">{formatINR(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {type === "savings_rate" && (
        <div className="w-full space-y-1">
          <Progress value={Math.max(0, Math.min(100, details.value))} className="h-1.5 bg-foreground/10" />
          <div className="text-right text-[10px] font-medium">Savings Rate: {details.value.toFixed(1)}%</div>
        </div>
      )}

      {type === "monthly_summary" && details.data && (
        <div className="mt-1 grid grid-cols-3 gap-2 rounded-lg bg-background/50 p-1.5 text-center text-xs">
          <div>
            <div className="text-[9px] font-semibold uppercase text-muted-foreground">Income</div>
            <div className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">{formatINR(details.data.income)}</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-muted-foreground">Expense</div>
            <div className="mt-0.5 font-bold text-rose-500">{formatINR(details.data.expense)}</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-muted-foreground">Net</div>
            <div className="mt-0.5 font-bold">{formatINR(details.data.net)}</div>
          </div>
        </div>
      )}

      {type === "advice" && (
        <div className="space-y-1.5 text-[11px]">
          {details.recommendations?.map((r, idx) => (
            <div key={idx} className="rounded-md bg-background/50 p-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.title}</span>
                <span className="shrink-0 text-emerald-600 dark:text-emerald-400">
                  Save ~{formatINR(r.potential_savings)}/mo
                </span>
              </div>
            </div>
          ))}
          {details.investment_nudge && (
            <div className="rounded-md bg-background/50 p-1.5 font-medium">
              {details.investment_nudge.title}
            </div>
          )}
        </div>
      )}

      {type === "anomaly_report" && details.anomalies?.length > 0 && (
        <div className="space-y-1.5 text-[11px]">
          {details.anomalies.map((a, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2 rounded-md bg-background/50 p-1.5">
              <span className="truncate">{a.description}</span>
              <Badge variant={a.severity === "high" ? "destructive" : "warning"} className="shrink-0 capitalize">
                {a.severity}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {type === "analysis" && (
        <div className="flex flex-wrap gap-1.5">
          {details.trend && <Badge variant="outline" className="capitalize">Trend: {details.trend}</Badge>}
          {details.top_growing_category && <Badge variant="outline">Growing: {details.top_growing_category}</Badge>}
          {details.peak_month && <Badge variant="outline">Peak: {details.peak_month}</Badge>}
        </div>
      )}

      {type === "comparison" && details.left && details.right && (
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-md bg-background/50 p-1.5">
            <div className="truncate text-[9px] uppercase text-muted-foreground">{details.left.label}</div>
            <div className="mt-0.5 font-bold">{formatINR(details.left.value)}</div>
          </div>
          <div className="rounded-md bg-background/50 p-1.5">
            <div className="truncate text-[9px] uppercase text-muted-foreground">{details.right.label}</div>
            <div className="mt-0.5 font-bold">{formatINR(details.right.value)}</div>
          </div>
        </div>
      )}

      {details.actions?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {details.actions.map((a, idx) => (
            <Link
              key={idx}
              to={a.to}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-6 gap-1 px-2 text-[11px]")}
            >
              {a.label} <ChevronRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QAChatWidget() {
  const [open, setOpen] = React.useState(false);
  const [history, setHistory] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState([]);
  const [llm, setLlm] = React.useState(null); // { enabled, model }
  const [qaMode] = useLocalStorage("batua-qa-mode", "hybrid");
  // Persisted across reloads so the backend can restore this conversation's
  // memory; generated once per browser via crypto.randomUUID().
  const [sessionId, setSessionId] = useLocalStorage("batua-chat-session-id", null);

  // Voice input
  const [recording, setRecording] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const [interim, setInterim] = React.useState("");
  const recognitionRef = React.useRef(null);

  const scrollRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const [atBottom, setAtBottom] = React.useState(true);

  React.useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) setSupported(false);

    api.get("/ml/qa/suggestions")
      .then((r) => setSuggestions(r.data?.suggestions || []))
      .catch(() => setSuggestions([]));
    api.get("/ml/ml-status")
      .then((r) => setLlm({ enabled: Boolean(r.data?.qa_llm_enabled), model: r.data?.qa_llm_model }))
      .catch(() => setLlm(null));

    if (!sessionId) setSessionId(crypto.randomUUID());

    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  // Restore this session's conversation from the backend once we have an id.
  React.useEffect(() => {
    if (!sessionId) return;
    api.get(`/ml/chat/${sessionId}`)
      .then((r) => {
        const turns = r.data?.turns || [];
        if (!turns.length) return;
        setHistory(
          turns.map((t) => ({
            role: t.role === "assistant" ? "system" : "user",
            content: t.content,
            type: t.type,
            details: t.details,
          }))
        );
      })
      .catch(() => {});
  }, [sessionId]);

  // Keep the newest message in view — but only auto-follow when the user is
  // already parked at the bottom, so scrolling up to re-read isn't yanked back.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [history, loading, open]);

  // Focus the composer when the panel opens.
  React.useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Auto-grow the composer up to a cap, then let it scroll.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 116)}px`;
  }, [input, open]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
  };

  const submit = async (questionText = input) => {
    const text = questionText?.trim();
    if (!text || loading) return;
    setLoading(true);
    setAtBottom(true);
    setHistory((prev) => [...prev, { role: "user", content: text, at: Date.now() }]);
    setInput("");
    try {
      const { data } = await api.post("/ml/qa", { question: text, mode: qaMode, session_id: sessionId });
      setHistory((prev) => [
        ...prev,
        { role: "system", content: data.answer || "No response received", type: data.type, details: data, at: Date.now() },
      ]);
    } catch {
      setHistory((prev) => [
        ...prev,
        { role: "system", content: "Sorry, I could not answer that. Please try again.", type: "error", at: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetConversation = async () => {
    if (sessionId) {
      try {
        await api.delete(`/ml/chat/${sessionId}`);
      } catch {
        // Best-effort — clear local history regardless.
      }
    }
    setHistory([]);
    setAtBottom(true);
    toast.success("Conversation cleared");
  };

  const toggleRecording = () => {
    if (!supported) {
      toast.error("Speech recognition not supported here. Use Chrome/Edge on https:// or localhost.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop?.();
      setRecording(false);
      setInterim("");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecording(true);
      setInterim("");
      toast.info("Listening… ask your question", { duration: 2000 });
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        const transcript = finalText.trim();
        setInterim("");
        setInput(transcript);
        toast.success(`Heard: "${transcript}"`, { duration: 1800 });
        submit(transcript);
      }
    };
    recognition.onerror = (e) => {
      const code = e.error || "unknown";
      const messages = {
        "not-allowed": "Microphone permission denied. Allow it in your browser settings.",
        "service-not-allowed": "Speech service blocked. Try Chrome/Edge on https:// or localhost.",
        "no-speech": "Didn't catch anything — try again a little louder.",
        "audio-capture": "No microphone found.",
        "network": "Network error reaching the speech service. Check your connection.",
        "aborted": "",
      };
      const msg = messages[code] || `Voice input error (${code})`;
      if (msg) toast.error(msg, { duration: 3500 });
      setRecording(false);
      setInterim("");
    };
    recognition.onend = () => {
      setRecording(false);
      setInterim("");
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
      toast.error("Could not start voice input. Please try again.");
      setRecording(false);
      setInterim("");
      recognitionRef.current = null;
    }
  };

  const starters = (suggestions.length ? suggestions : FALLBACK_STARTERS).slice(0, 4);
  const composerValue = recording && interim ? interim : input;

  return createPortal(
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-4 z-50 flex max-h-[min(600px,calc(100dvh-8rem))] w-[min(410px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl ring-1 ring-black/5 animate-fade-up sm:right-6"
          data-testid="qa-chat-panel"
          role="dialog"
          aria-label="Finance assistant chat"
        >
          {/* Header */}
          <div className="relative flex items-center justify-between gap-2 overflow-hidden border-b border-border/70 bg-gradient-to-br from-primary/10 via-card to-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative">
                <AssistantAvatar className="h-9 w-9" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" title="Online" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold leading-tight">Batua Assistant</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {llm?.enabled ? `Online · ${llm.model}` : "Online · Smart rules"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge
                variant={llm?.enabled ? "success" : "outline"}
                className="hidden gap-1 sm:inline-flex"
                title={
                  llm?.enabled
                    ? `Answers are phrased by ${llm.model} running locally via Ollama`
                    : "Answers use the built-in rules engine (start Ollama for natural phrasing)"
                }
              >
                <Cpu className="h-3 w-3" />
                {llm?.enabled ? "AI" : "Rules"}
              </Badge>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={resetConversation}
                  aria-label="Reset conversation"
                  title="Clear conversation"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                title="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="relative flex-1 space-y-3 overflow-y-auto scroll-smooth px-3.5 py-4"
          >
            {history.length === 0 ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-2 text-center">
                <AssistantAvatar className="mb-3 h-12 w-12" />
                <p className="font-display text-base font-semibold">Hi, I'm Batua 👋</p>
                <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
                  Ask me anything about your money — I answer from your own transactions.
                </p>
                <div className="mt-4 grid w-full grid-cols-1 gap-2">
                  {starters.map((s, i) => {
                    const Icon = STARTER_ICONS[i % STARTER_ICONS.length];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => submit(s)}
                        disabled={loading}
                        className="group flex items-center gap-2.5 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-left text-xs transition-all hover:border-primary/40 hover:bg-accent/50 hover:shadow-sm disabled:opacity-50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 font-medium">{s}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              history.map((msg, index) => {
                const isUser = msg.role === "user";
                const isLast = index === history.length - 1;
                return (
                  <div
                    key={index}
                    className={cn("flex w-full animate-fade-up gap-2", isUser ? "justify-end" : "justify-start")}
                  >
                    {!isUser && <AssistantAvatar className="mt-0.5" />}
                    <div className={cn("flex max-w-[82%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                          isUser
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : msg.type === "error"
                            ? "rounded-bl-md border border-destructive/30 bg-destructive/10 text-foreground"
                            : "rounded-bl-md border border-border/60 bg-muted text-foreground"
                        )}
                      >
                        <span className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</span>
                        {!isUser && <AnswerDetails msg={msg} />}
                      </div>

                      {msg.at && (
                        <span className="px-1 text-[10px] text-muted-foreground/70">{timeLabel(msg.at)}</span>
                      )}

                      {!isUser && isLast && msg.details?.follow_up_suggestions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {msg.details.follow_up_suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => submit(s)}
                              disabled={loading}
                              className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {loading && (
              <div className="flex items-end gap-2">
                <AssistantAvatar className="mt-0.5" />
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border/60 bg-muted px-3.5 py-3" aria-label="Thinking">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Scroll-to-bottom affordance while reading history */}
          {!atBottom && history.length > 0 && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Scroll to latest"
              className="absolute bottom-[76px] right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-transform hover:scale-105"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}

          {/* Input */}
          <div className="border-t border-border/70 bg-card p-3">
            <div
              className={cn(
                "flex items-end gap-1.5 rounded-2xl border border-input bg-background px-2 py-1.5 transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20",
                recording && interim && "border-red-500/50 ring-2 ring-red-500/20"
              )}
            >
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={recording ? "Listening…" : "Ask about your spending, savings…"}
                value={composerValue}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                disabled={loading}
                data-testid="qa-chat-input"
                aria-label="Message"
                className="max-h-[116px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
              {supported && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={loading}
                  aria-pressed={recording}
                  aria-label={recording ? "Stop voice input" : "Start voice input"}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                    recording
                      ? "animate-pulse bg-red-500 text-white shadow-md shadow-red-500/40"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  title={recording ? "Tap to stop" : "Tap to ask with voice"}
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
              <Button
                onClick={() => submit()}
                disabled={loading || !input.trim()}
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 px-1 text-center text-[10px] text-muted-foreground/70">
              Answers are computed from your own transactions
            </p>
          </div>
        </div>
      )}

      {/* Round launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close finance assistant" : "Open finance assistant"}
        aria-expanded={open}
        data-testid="qa-chat-fab"
        className={cn(
          "group fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all sm:right-6",
          "bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground hover:scale-105 hover:shadow-xl",
          !open && "animate-glow-pulse",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        {/* Hover tooltip label */}
        {!open && (
          <span className="pointer-events-none absolute right-16 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
            Ask Batua AI
          </span>
        )}
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageSquare className="h-6 w-6" />
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-card text-primary shadow">
              <Sparkles className="h-2.5 w-2.5" />
            </span>
          </>
        )}
      </button>
    </>,
    document.body
  );
}
