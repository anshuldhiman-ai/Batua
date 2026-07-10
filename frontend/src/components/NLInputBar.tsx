import React from "react";
import { Sparkles, Wand2, Check, X, Loader2, Repeat, List, Mic } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MonthPicker from "@/components/MonthPicker";
import { DateInput, DayInput } from "@/components/ui/date-input";
import { api, formatINR, upcomingMonths, currentYearMonth } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const SINGLE_EXAMPLES = [
  "zomato 450 yesterday upi",
  "salary +85000 5th may",
  "petrol 1200 10/05/2026 hdfc",
];

const RECURRING_EXAMPLES = [
  "salary +5k on 1st every month",
  "sip 1k monthly from jan to jun 2026",
  "rent -15000 monthly for 2026",
  "netflix 649 monthly on 5th",
];

const BULK_PLACEHOLDER = `salary +5k on 1st every month
sip 1k monthly
zomato 450 yesterday upi
rent -15000 monthly for 2026`;

export default function NLInputBar({ onSaved }) {
  const [mode, setMode] = React.useState("single");
  const [text, setText] = React.useState("");
  const [bulkText, setBulkText] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [bulkDrafts, setBulkDrafts] = React.useState(null);

  const parseSingle = async (inputText = text) => {
    // `inputText` may arrive as a click event (the Parse button) or undefined
    // (Enter key). Only trust an explicit string; otherwise use `text` state.
    const source = typeof inputText === "string" ? inputText : text;
    const textToParse = source.trim();
    if (!textToParse) return;
    setParsing(true);
    try {
      const { data } = await api.post("/parse-nl", {
        text: textToParse,
        force_recurring: mode === "recurring",
      });
      const draftData =
        mode === "recurring" && data.kind !== "recurring"
          ? toRecurringDraft(data)
          : data;
      setDraft(draftData);
      setBulkDrafts(null);
    } catch {
      toast.error("Could not parse that. Try rephrasing.");
    } finally {
      setParsing(false);
    }
  };

  /** Fallback when backend returns a single txn on the Repeat monthly tab. */
  function toRecurringDraft(single) {
    const months = upcomingMonths(12, currentYearMonth());
    return {
      kind: "recurring",
      description: single.description,
      amount: single.amount,
      category: single.category,
      payment_method: single.payment_method || "",
      notes: "",
      day: single.date ? parseInt(single.date.slice(8, 10), 10) || 1 : 1,
      months,
      count: months.length,
      total: round2(single.amount * months.length),
    };
  }

  const parseBulk = async () => {
    if (!bulkText.trim()) return;
    setParsing(true);
    try {
      const { data } = await api.post("/parse-nl/bulk", { text: bulkText });
      setBulkDrafts(data.items);
      setDraft(null);
    } catch {
      toast.error("Could not parse lines. Check the format.");
    } finally {
      setParsing(false);
    }
  };

  const parseVoiceTranscript = async (transcript) => {
    const spoken = transcript.trim();
    if (!spoken) return;
    setText(spoken);
    setBulkText(spoken);
    setParsing(true);
    try {
      const { data } = await api.post("/parse-nl/voice", { text: spoken });
      const items = data.items || [];
      if (items.length > 1) {
        setMode("bulk");
        setBulkDrafts(items);
        setDraft(null);
      } else if (items.length === 1) {
        setDraft(items[0]);
        setBulkDrafts(null);
      } else {
        toast.error("Could not find transactions in that voice note.");
      }
    } catch {
      toast.error("Could not parse that voice note. Try speaking a little slower.");
    } finally {
      setParsing(false);
    }
  };

  const saveSingle = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      if (draft.kind === "recurring") {
        await saveRecurring(draft);
      } else {
        const { kind, count, total, ...txn } = draft;
        await api.post("/transactions", txn);
        toast.success("Transaction saved");
      }
      resetAll();
      onSaved?.();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveRecurring = async (rec) => {
    const months = rec.months || [];
    if (!months.length) {
      toast.error("Select at least one month");
      return;
    }
    const { data } = await api.post("/transactions/recurring", {
      description: rec.description,
      amount: rec.amount,
      category: rec.category,
      payment_method: rec.payment_method || "",
      notes: rec.notes || "",
      day: rec.day || 1,
      months,
    });
    toast.success(`Added ${data.inserted} entries across ${data.months} months`);
  };

  const saveBulk = async () => {
    if (!bulkDrafts?.length) return;
    setSaving(true);
    try {
      let singles = 0;
      let recurring = 0;
      for (const item of bulkDrafts) {
        if (item.kind === "recurring") {
          const { data } = await api.post("/transactions/recurring", {
            description: item.description,
            amount: item.amount,
            category: item.category,
            payment_method: item.payment_method || "",
            notes: item.notes || "",
            day: item.day || 1,
            months: item.months || [],
          });
          recurring += data.inserted;
        } else {
          const { kind, count, total, ...txn } = item;
          await api.post("/transactions", txn);
          singles += 1;
        }
      }
      toast.success(`Saved ${singles} one-off + ${recurring} recurring entries`);
      resetAll();
      onSaved?.();
    } catch {
      toast.error("Failed to save some entries");
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setText("");
    setBulkText("");
    setDraft(null);
    setBulkDrafts(null);
  };

  const updateDraft = (key, val) => setDraft((d) => ({ ...d, [key]: val }));

  const setDraftMonths = (months) => {
    setDraft((d) => ({
      ...d,
      months,
      count: months.length,
      total: round2(d.amount * months.length),
    }));
  };

  return (
    <Card
      className={cn(
        "bg-card/60 backdrop-blur-sm transition-shadow",
        focused && "animate-glow-pulse ring-2 ring-primary/40"
      )}
    >
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" />
          Add transactions in plain English
        </div>

        <Tabs value={mode} onValueChange={(v) => { setMode(v); resetAll(); }}>
          <TabsList className="mb-1 w-full justify-start">
            <TabsTrigger value="single" data-testid="nl-tab-single">One-off</TabsTrigger>
            <TabsTrigger value="recurring" data-testid="nl-tab-recurring">
              <Repeat className="mr-1 h-3.5 w-3.5" /> Repeat monthly
            </TabsTrigger>
            <TabsTrigger value="bulk" data-testid="nl-tab-bulk">
              <List className="mr-1 h-3.5 w-3.5" /> Paste many
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <InputRow
              value={text}
              onChange={setText}
              onParse={parseSingle}
              onVoiceResult={parseVoiceTranscript}
              parsing={parsing}
              placeholder='e.g. "zomato 450 yesterday upi"'
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <ExampleChips examples={SINGLE_EXAMPLES} onPick={setText} />
          </TabsContent>

          <TabsContent value="recurring">
            <InputRow
              value={text}
              onChange={setText}
              onParse={parseSingle}
              onVoiceResult={parseVoiceTranscript}
              parsing={parsing}
              placeholder='e.g. "salary +5k on 1st every month"'
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <ExampleChips examples={RECURRING_EXAMPLES} onPick={setText} />
            <p className="mt-2 text-xs text-muted-foreground">
              Tip: use <strong>every month</strong>, <strong>monthly</strong>, <strong>from jan to jun 2026</strong>, or <strong>for 2026</strong>
            </p>
          </TabsContent>

          <TabsContent value="bulk">
            <textarea
              data-testid="nl-bulk-input"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={BULK_PLACEHOLDER}
              rows={5}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex justify-end">
              <Button onClick={parseBulk} disabled={parsing || !bulkText.trim()} data-testid="nl-bulk-parse-btn">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Parse all lines
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {draft && (
          <PreviewPanel
            draft={draft}
            updateDraft={updateDraft}
            setDraftMonths={setDraftMonths}
            onDiscard={() => setDraft(null)}
            onSave={saveSingle}
            saving={saving}
          />
        )}

        {bulkDrafts && (
          <BulkPreview
            items={bulkDrafts}
            onDiscard={() => setBulkDrafts(null)}
            onSave={saveBulk}
            saving={saving}
          />
        )}
      </div>
    </Card>
  );
}

function InputRow({ value, onChange, onParse, onVoiceResult, parsing, placeholder, onFocus, onBlur }) {
  const [recording, setRecording] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const [interim, setInterim] = React.useState("");
  const recognitionRef = React.useRef(null);
  const retryRef = React.useRef(0);
  const finalTranscriptRef = React.useRef("");
  const skipParseOnEndRef = React.useRef(false);

  React.useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
    }
    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  const MAX_VOICE_RETRIES = 2;

  const beginRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    // Continuous mode lets users speak a full voice note with multiple
    // transactions. Parse only when recognition ends, so partial chunks do
    // not create premature drafts.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "hi-IN";
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setRecording(true);
      setInterim("");
      finalTranscriptRef.current = "";
      skipParseOnEndRef.current = false;
      toast.info("Listening… speak your transactions", { duration: 2000 });
    };

    recognition.onresult = (event) => {
      retryRef.current = 0; // audio got through — clear the retry budget
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (finalText) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalText}`.trim();
        onChange(finalTranscriptRef.current);
      }
      const liveTranscript = `${finalTranscriptRef.current} ${interimText}`.trim();
      if (liveTranscript) setInterim(liveTranscript);
    };

    recognition.onerror = (e) => {
      const code = e.error || "unknown";
      // The Web Speech API streams audio to a cloud service, so "network"
      // errors are frequently transient. Auto-retry a couple of times before
      // surfacing the failure to the user.
      if (code === "network" && retryRef.current < MAX_VOICE_RETRIES) {
        retryRef.current += 1;
        skipParseOnEndRef.current = true;
        recognitionRef.current = null;
        toast.info(
          `Reconnecting to speech service… (${retryRef.current}/${MAX_VOICE_RETRIES})`,
          { duration: 1500 }
        );
        window.setTimeout(() => {
          try {
            beginRecognition();
          } catch {
            setRecording(false);
            setInterim("");
          }
        }, 600);
        return;
      }
      const messages = {
        "not-allowed": "Microphone permission denied. Allow it in your browser settings.",
        "service-not-allowed": "Speech service blocked. Try Chrome/Edge on https:// or localhost.",
        "no-speech": "Didn't catch anything — try again a little louder.",
        "audio-capture": "No microphone found.",
        "network":
          "Voice input couldn't reach the speech service after retrying. The browser's mic feature needs an internet connection (Chrome/Edge stream audio to Google) — type your entry instead.",
        "aborted": "",
      };
      const msg = messages[code] || `Voice input error (${code})`;
      if (msg) toast.error(msg, { duration: 5000 });
      skipParseOnEndRef.current = true;
      retryRef.current = 0;
      setRecording(false);
      setInterim("");
    };

    recognition.onend = () => {
      const transcript = finalTranscriptRef.current.trim();
      if (!skipParseOnEndRef.current && transcript) {
        onChange(transcript);
        toast.success(`Heard: "${transcript}"`, { duration: 1800 });
        if (onVoiceResult) onVoiceResult(transcript);
        else onParse(transcript);
      }
      setRecording(false);
      setInterim("");
      recognitionRef.current = null;
      finalTranscriptRef.current = "";
      skipParseOnEndRef.current = false;
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

  const toggleRecording = () => {
    if (!supported) {
      toast.error(
        "Speech recognition not supported here. Use Chrome/Edge on https:// or localhost."
      );
      return;
    }

    if (recording) {
      recognitionRef.current?.stop?.();
      setRecording(false);
      setInterim("");
      return;
    }

    retryRef.current = 0;
    beginRecognition();
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Input
          data-testid="nl-input"
          value={recording && interim ? interim : value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e) => e.key === "Enter" && onParse()}
          placeholder={recording ? "Listening…" : placeholder}
          className={cn(
            "h-12 text-base pr-12",
            recording && interim && "border-red-500/50 ring-1 ring-red-500/30"
          )}
        />
        {supported && (
          <button
            type="button"
            onClick={toggleRecording}
            aria-pressed={recording}
            aria-label={recording ? "Stop voice input" : "Start voice input"}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300",
              recording
                ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title={recording ? "Tap to stop" : "Tap to speak"}
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
      </div>
      <Button
        data-testid="nl-parse-btn"
        onClick={() => onParse()}
        disabled={parsing || !value.trim()}
        size="lg"
        className="shrink-0"
      >
        {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        Parse
      </Button>
    </div>
  );
}


function ExampleChips({ examples, onPick }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {examples.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {ex}
        </button>
      ))}
    </div>
  );
}

function PreviewPanel({ draft, updateDraft, setDraftMonths, onDiscard, onSave, saving }) {
  const isRecurring = draft.kind === "recurring";

  return (
    <div className="mt-4 rounded-lg border border-border bg-background/60 p-4 animate-fade-up" data-testid="nl-preview">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {isRecurring ? `Repeat monthly · pick which months to apply` : "Preview — edit before saving"}
        </span>
        <Badge variant={draft.amount >= 0 ? "success" : "destructive"}>
          {draft.amount >= 0 ? "Credit" : "Debit"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Description">
          <Input value={draft.description} onChange={(e) => updateDraft("description", e.target.value)} data-testid="preview-description" />
        </Field>
        <Field label="Amount (₹)">
          <Input
            type="number"
            value={draft.amount}
            onChange={(e) => {
              const amount = parseFloat(e.target.value) || 0;
              updateDraft("amount", amount);
              if (isRecurring) updateDraft("total", round2(amount * (draft.months?.length || 0)));
            }}
            data-testid="preview-amount"
          />
        </Field>
        {!isRecurring && (
          <Field label="Date">
            <DateInput value={draft.date} onChange={(v) => updateDraft("date", v)} data-testid="preview-date" />
          </Field>
        )}
        {isRecurring && (
          <Field label="Day of month (1–31)">
            <DayInput
              value={draft.day || 1}
              onChange={(v) => updateDraft("day", v)}
              data-testid="preview-day"
            />
          </Field>
        )}
        <Field label="Category">
          <Input value={draft.category} onChange={(e) => updateDraft("category", e.target.value)} data-testid="preview-category" />
        </Field>
        <Field label="Payment">
          <Input value={draft.payment_method || ""} onChange={(e) => updateDraft("payment_method", e.target.value)} data-testid="preview-payment" />
        </Field>
      </div>

      {isRecurring && (
        <MonthPicker
          className="mt-4"
          months={draft.months || []}
          amount={draft.amount}
          onChange={setDraftMonths}
        />
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="kpi-number text-lg">{formatINR(isRecurring ? (draft.total || draft.amount) : draft.amount)}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDiscard} data-testid="nl-discard-btn">
            <X className="h-4 w-4" /> Discard
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || (isRecurring && !(draft.months?.length))}
            data-testid="nl-save-btn"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isRecurring ? `Apply to ${draft.count || 0} months` : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BulkPreview({ items, onDiscard, onSave, saving }) {
  const singles = items.filter((i) => i.kind !== "recurring").length;
  const recurring = items.filter((i) => i.kind === "recurring");
  const recurringCount = recurring.reduce((n, r) => n + (r.count || r.months?.length || 0), 0);

  return (
    <div className="mt-4 rounded-lg border border-border bg-background/60 p-4 animate-fade-up" data-testid="nl-bulk-preview">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {items.length} lines parsed · {singles} one-off · {recurringCount} recurring entries
      </div>
      <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span className="font-medium">{item.description}</span>
            <span className="flex items-center gap-2">
              {item.kind === "recurring" && (
                <Badge variant="outline">{item.count || item.months?.length}×</Badge>
              )}
              <span className={cn("tabular-nums", item.amount >= 0 ? "text-emerald-600" : "text-rose-500")}>
                {formatINR(item.amount)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDiscard}>Discard</Button>
        <Button size="sm" onClick={onSave} disabled={saving} data-testid="nl-bulk-save-btn">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save all
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
