import React from "react";
import { Sparkles, Wand2, Check, X, Loader2, Repeat, List, Mic } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import AnimatedGlowBorder from "@/components/AnimatedGlowBorder";
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

  /** Route parsed voice items into the single/bulk preview. */
  const applyVoiceItems = (items) => {
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
  };

  // Browser Web Speech path: we get a transcript string, parse it on the server.
  const parseVoiceTranscript = async (transcript) => {
    const spoken = transcript.trim();
    if (!spoken) return;
    setText(spoken);
    setBulkText(spoken);
    setParsing(true);
    try {
      const { data } = await api.post("/parse-nl/voice", { text: spoken });
      applyVoiceItems(data.items || []);
    } catch {
      toast.error("Could not parse that voice note. Try speaking a little slower.");
    } finally {
      setParsing(false);
    }
  };

  // Offline path: upload recorded audio; the server transcribes AND parses it.
  const transcribeAudio = async (blob) => {
    if (!blob || !blob.size) return;
    setParsing(true);
    try {
      const form = new FormData();
      const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
      form.append("file", blob, `voice.${ext}`);
      const { data } = await api.post("/transcribe", form);
      const spoken = (data.text || "").trim();
      if (spoken) {
        setText(spoken);
        setBulkText(spoken);
        toast.success(`Heard: "${spoken}"`, { duration: 2200 });
      }
      applyVoiceItems(data.items || []);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 503) {
        toast.error("Offline voice isn't set up on the server yet.");
      } else {
        toast.error("Could not transcribe that. Please try again.");
      }
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
      glow={false}
      className="relative overflow-hidden bg-card/60 backdrop-blur-sm"
    >
      {/* Animated luminous border that continuously orbits the prompt bar. */}
      <AnimatedGlowBorder radius={12} speed={focused ? 8 : 5} />

      <div className="relative z-10 p-5">
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
              onAudioResult={transcribeAudio}
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
              onAudioResult={transcribeAudio}
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

function InputRow({ value, onChange, onParse, onVoiceResult, onAudioResult, parsing, placeholder, onFocus, onBlur }) {
  const [recording, setRecording] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const [interim, setInterim] = React.useState("");
  // "backend" = record audio + transcribe offline on the server (works without
  // Google). "browser" = Web Speech API. Decided from /transcribe/status.
  const [sttMode, setSttMode] = React.useState("browser");
  const recognitionRef = React.useRef(null);
  const retryRef = React.useRef(0);
  const finalTranscriptRef = React.useRef("");
  const restartingRef = React.useRef(false); // true while auto-restarting (retry / silent drop)
  const manualStopRef = React.useRef(false);  // true when the user tapped stop
  const restartTimerRef = React.useRef(null);
  // MediaRecorder state for the offline backend path.
  const mediaRecorderRef = React.useRef(null);
  const mediaStreamRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);

  // Audio visualizer state
  const [micVolume, setMicVolume] = React.useState(0);
  const audioContextRef = React.useRef(null);
  const analyserRef = React.useRef(null);
  const visualAnimationFrameRef = React.useRef(null);
  const visualStreamRef = React.useRef(null);

  const startAudioAnalysis = (stream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        let count = 0;
        // Focus on speech frequencies
        for (let i = 2; i < bufferLength - 10; i++) {
          sum += dataArray[i];
          count++;
        }
        const average = count > 0 ? sum / count : 0;
        const volume = Math.min(100, Math.round((average / 140) * 100));
        setMicVolume(volume);
        visualAnimationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn("Audio analysis failed", e);
    }
  };

  const stopAudioAnalysis = () => {
    if (visualAnimationFrameRef.current) {
      cancelAnimationFrame(visualAnimationFrameRef.current);
      visualAnimationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicVolume(0);
    if (visualStreamRef.current) {
      visualStreamRef.current.getTracks().forEach((t) => t.stop());
      visualStreamRef.current = null;
    }
  };

  const [whisperAvailable, setWhisperAvailable] = React.useState(false);

  React.useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const hasRecorder =
      typeof window.MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    // Prefer browser speech recognition first for real-time live typing.
    // If browser lacks speech support but backend Whisper is ready, use backend.
    let cancelled = false;
    (async () => {
      let backendReady = false;
      if (hasRecorder && onAudioResult) {
        try {
          const { data } = await api.get("/transcribe/status");
          backendReady = !!data?.available;
        } catch {
          backendReady = false;
        }
      }
      if (cancelled) return;
      
      setWhisperAvailable(backendReady);
      
      if (SpeechRecognition) {
        setSttMode("browser");
        setSupported(true);
      } else if (backendReady) {
        setSttMode("backend");
        setSupported(true);
      } else {
        setSttMode("browser");
        setSupported(false);
      }
    })();

    return () => {
      cancelled = true;
      manualStopRef.current = true;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      stopMediaTracks();
      stopAudioAnalysis();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMediaTracks = () => {
    try {
      mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    mediaStreamRef.current = null;
  };

  // Chrome/Edge stream mic audio to Google, so transient "network" drops are
  // common. Retry generously and, crucially, keep whatever was already heard.
  const MAX_VOICE_RETRIES = 5;

  /** Send whatever was captured downstream. Returns true if anything was parsed. */
  const flushTranscript = () => {
    const transcript = finalTranscriptRef.current.trim();
    if (!transcript) return false;
    onChange(transcript);
    toast.success(`Heard: "${transcript}"`, { duration: 1800 });
    if (onVoiceResult) onVoiceResult(transcript);
    else onParse(transcript);
    return true;
  };

  const stopEverything = () => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    restartingRef.current = false;
    retryRef.current = 0;
    setRecording(false);
    setInterim("");
    stopAudioAnalysis();
  };

  const scheduleRestart = (delay) => {
    restartingRef.current = true;
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (manualStopRef.current) {
        stopEverything();
        return;
      }
      try {
        beginRecognition();
      } catch {
        // Couldn't relaunch — salvage anything we already heard.
        if (!flushTranscript()) {
          toast.error("Voice input stopped unexpectedly. Please try again.");
        }
        stopEverything();
      }
    }, delay);
  };

  const beginRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    // Continuous mode lets users speak a full voice note with multiple
    // transactions. maxAlternatives=1 keeps the audio round-trips minimal,
    // which reduces spurious "network" errors from the cloud recognizer.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN"; // English/Indian accent default
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecording(true);
      setInterim(finalTranscriptRef.current); // keep prior words visible on restart
      // Only announce + reset on a genuine fresh start, not on an auto-restart,
      // so a mid-note reconnect never wipes what was already captured.
      if (!restartingRef.current) {
        finalTranscriptRef.current = "";
        toast.info("Listening (Cloud)… speak your transactions", { duration: 2000 });
      }
      restartingRef.current = false;
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
      // "aborted" fires on our own stop()/abort() — ignore, onend handles it.
      if (code === "aborted") return;

      // Auto-fallback to local Whisper recording if cloud fails due to connection/network
      if (code === "network" && whisperAvailable) {
        stopAudioAnalysis();
        toast.info("Cloud voice engine offline. Switching to local transcription...");
        setSttMode("backend");
        startBackendRecording();
        return;
      }

      // Transient cloud drops: retry with a short backoff, preserving the
      // transcript. Only give up after several attempts.
      const transient = code === "network" || code === "no-speech";
      if (transient && !manualStopRef.current && retryRef.current < MAX_VOICE_RETRIES) {
        retryRef.current += 1;
        if (code === "network") {
          toast.info(
            `Reconnecting to speech service… (${retryRef.current}/${MAX_VOICE_RETRIES})`,
            { duration: 1500 }
          );
        }
        recognitionRef.current = null;
        scheduleRestart(500 + retryRef.current * 400); // 0.9s, 1.3s, 1.7s, …
        return;
      }

      // Out of retries or a hard error. Salvage anything we heard before failing.
      const salvaged = code === "network" && flushTranscript();

      const messages = {
        "not-allowed": "Microphone permission denied. Allow it in your browser settings.",
        "service-not-allowed": "Speech service blocked. Try Chrome/Edge on https:// or localhost.",
        "no-speech": "Didn't catch anything — tap the mic and try again a little louder.",
        "audio-capture": "No microphone found.",
        "network": salvaged
          ? "" // we recovered a partial transcript — don't alarm the user
          : "Voice input keeps losing the speech service. This browser streams mic audio to Google and needs a stable internet connection — check your network/VPN, or type your entry instead.",
        "language-not-supported": "Hindi voice isn't available here — type your entry instead.",
      };
      const msg = code in messages ? messages[code] : `Voice input error (${code})`;
      if (msg) toast.error(msg, { duration: 5000 });
      recognitionRef.current = null;
      stopEverything();
    };

    recognition.onend = () => {
      // A pending network-retry restart owns the lifecycle — let it relaunch.
      if (restartingRef.current) return;

      // Otherwise the session is over (user tapped stop, or Chrome ended it
      // after a silence gap): parse whatever we captured. We deliberately do
      // NOT auto-restart here — that made the mic feel impossible to stop.
      flushTranscript();
      recognitionRef.current = null;
      finalTranscriptRef.current = "";
      stopEverything();
    };

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
      // start() throws if a prior instance is still winding down; retry once.
      if (!manualStopRef.current && retryRef.current < MAX_VOICE_RETRIES) {
        retryRef.current += 1;
        scheduleRestart(400);
        return;
      }
      toast.error("Could not start voice input. Please try again.");
      recognitionRef.current = null;
      stopEverything();
    }
  };

  const toggleBrowserRecording = async () => {
    if (!supported) {
      toast.error(
        "Speech recognition not supported here. Use Chrome/Edge on https:// or localhost."
      );
      return;
    }

    if (recording) {
      // User taps stop: parse what we have and don't auto-restart.
      manualStopRef.current = true;
      restartingRef.current = false;
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      recognitionRef.current?.stop?.();
      stopAudioAnalysis();
      // If recognition already died, stop() won't fire onend — flush directly.
      if (!recognitionRef.current) {
        flushTranscript();
        stopEverything();
      }
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error(
        "You appear to be offline. Browser voice input needs an internet connection — type your entry instead."
      );
      return;
    }

    // Try requesting mic stream pure for real-time visual feedback
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      visualStreamRef.current = stream;
      startAudioAnalysis(stream);
    } catch (e) {
      console.warn("Could not start visual feedback stream", e);
    }

    manualStopRef.current = false;
    restartingRef.current = false;
    retryRef.current = 0;
    finalTranscriptRef.current = "";
    beginRecognition();
  };

  // --- Offline backend path: record audio, upload, transcribe on the server ---

  const startBackendRecording = async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      toast.error(
        denied
          ? "Microphone permission denied. Allow it in your browser settings."
          : "No microphone found."
      );
      stopAudioAnalysis();
      return;
    }
    mediaStreamRef.current = stream;
    audioChunksRef.current = [];

    // Start volume visualizer
    startAudioAnalysis(stream);

    // Pick a mime type the browser actually supports (Safari lacks webm).
    const preferred = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    const mimeType = preferred.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || "";
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stopAudioAnalysis();
      stopMediaTracks();
      setRecording(false);
      setInterim("");
      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];
      mediaRecorderRef.current = null;
      if (!chunks.length) {
        toast.error("Didn't catch any audio — tap the mic and try again.");
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      onAudioResult?.(blob);
    };

    recorder.onerror = () => {
      toast.error("Recording error. Please try again.");
      stopAudioAnalysis();
      stopMediaTracks();
      setRecording(false);
      setInterim("");
      mediaRecorderRef.current = null;
    };

    recorder.start();
    setRecording(true);
    setInterim("Local mode active...");
    toast.info("Recording (Local Whisper)… tap the mic again when you're done", { duration: 2500 });
  };

  const toggleBackendRecording = () => {
    if (recording) {
      try {
        mediaRecorderRef.current?.stop?.();
      } catch {
        stopAudioAnalysis();
        stopMediaTracks();
        setRecording(false);
      }
      return;
    }
    startBackendRecording();
  };

  const toggleRecording = () => {
    if (recording) {
      if (mediaRecorderRef.current?.state === "recording") {
        toggleBackendRecording();
      } else {
        toggleBrowserRecording();
      }
      return;
    }
    sttMode === "backend" ? toggleBackendRecording() : toggleBrowserRecording();
  };

  const isBackend = sttMode === "backend";
  const recordingPlaceholder = isBackend ? "Recording… tap mic to stop" : "Listening…";

  return (
   <>
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Input
          data-testid="nl-input"
          value={recording && interim ? interim : value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e) => e.key === "Enter" && onParse()}
          placeholder={recording ? recordingPlaceholder : placeholder}
          className={cn(
            "h-12 text-base pr-12",
            recording && "border-destructive/50 ring-1 ring-destructive/30"
          )}
        />
        {supported && (
          <button
            type="button"
            onClick={toggleRecording}
            aria-pressed={recording}
            aria-label={recording ? "Stop voice input" : "Start voice input"}
            className={cn(
              "absolute right-3 top-1/2 flex h-8 w-8 items-center justify-center rounded-full transition-all duration-75",
              recording
                ? "bg-destructive text-destructive-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            style={{
              transform: `translateY(-50%) scale(${recording ? 1 + (micVolume / 280) : 1})`,
              boxShadow: recording ? `0 0 ${8 + (micVolume / 3)}px hsl(var(--destructive) / ${0.5 + (micVolume / 100)})` : undefined
            }}
            title={
              recording
                ? "Tap to stop"
                : isBackend
                ? "Tap to speak (offline voice)"
                : "Tap to speak"
            }
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
    {supported && (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {recording ? (
          <span className="font-medium text-destructive">
            ● {isBackend ? "Recording — tap the mic again to stop" : "Listening — tap the mic to stop"}
          </span>
        ) : (
          <>
            <Mic className="h-3 w-3" />
            {isBackend
              ? "Offline voice ready — speak Hindi or English, then tap the mic to stop"
              : "Browser voice (needs internet) — speak, then tap the mic to stop"}
          </>
        )}
      </p>
    )}
   </>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
              else updateDraft("price", round2(Math.abs(amount) / (draft.quantity > 0 ? draft.quantity : 1)));
            }}
            data-testid="preview-amount"
          />
        </Field>
        {!isRecurring && (
          <Field label="Date">
            <DateInput value={draft.date} onChange={(v) => updateDraft("date", v)} data-testid="preview-date" />
          </Field>
        )}
        {!isRecurring && (
          <Field label="Qty">
            <Input
              type="number"
              min={1}
              value={draft.quantity ?? 1}
              onChange={(e) => {
                const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                updateDraft("quantity", qty);
                updateDraft("price", round2(Math.abs(draft.amount || 0) / qty));
              }}
              data-testid="preview-quantity"
            />
          </Field>
        )}
        {!isRecurring && (
          <Field label="Price / item (₹)">
            <Input
              type="number"
              min={0}
              value={draft.price ?? round2(Math.abs(draft.amount || 0) / (draft.quantity > 0 ? draft.quantity : 1))}
              onChange={(e) => {
                const price = Math.abs(parseFloat(e.target.value) || 0);
                const qty = draft.quantity > 0 ? draft.quantity : 1;
                updateDraft("price", price);
                updateDraft("amount", draft.amount < 0 ? -round2(price * qty) : round2(price * qty));
              }}
              data-testid="preview-price"
            />
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
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {item.description}
                {item.quantity > 1 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    × {item.quantity}
                    {item.price > 0 && <> @ {formatINR(item.price)}</>}
                  </span>
                )}
              </span>
              {item.notes && (
                <span className="truncate text-[11px] text-muted-foreground">{item.notes}</span>
              )}
            </span>
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
