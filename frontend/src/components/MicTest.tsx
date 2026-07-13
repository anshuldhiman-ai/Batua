import React from "react";
import { Mic, Square, Loader2, Volume2, AudioLines, X } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

// Human-friendly notes for each Whisper size. Bigger = more accurate but
// slower and heavier to download/run.
const MODEL_INFO = {
  tiny: "Fastest, least accurate. ~75 MB.",
  base: "Fast, basic accuracy. ~145 MB.",
  small: "Balanced — good default. ~500 MB.",
  medium: "More accurate, slower. ~1.5 GB, needs ~2.5 GB RAM.",
  "large-v3": "Best accuracy, slowest. ~3 GB, heavy on CPU.",
};

const isCanceled = (err) =>
  err?.code === "ERR_CANCELED" || err?.name === "CanceledError";

/**
 * Settings panel to test the microphone + offline transcription and pick the
 * Whisper model app-wide. Records a short clip, uploads it to /transcribe/test,
 * and shows the transcribed text plus what language/model was used. The model
 * is loaded (downloaded on first use) as a distinct step so a slow first run
 * reads as "Loading model…" rather than a stuck transcription, and any step can
 * be cancelled.
 */
export default function MicTest() {
  const [status, setStatus] = React.useState(null);   // { available, model, models, loaded }
  const [activeModel, setActiveModel] = React.useState("");
  const [switching, setSwitching] = React.useState(false);
  const [phase, setPhase] = React.useState("idle");   // idle | recording | loading | transcribing
  const [level, setLevel] = React.useState(0);        // 0..1 mic volume
  const [result, setResult] = React.useState(null);

  const recorderRef = React.useRef(null);
  const chunksRef = React.useRef([]);
  const streamRef = React.useRef(null);
  const audioCtxRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const abortRef = React.useRef(null);      // aborts in-flight warm/test requests
  const discardRef = React.useRef(false);   // set when a recording should NOT be transcribed
  // Read live values inside long-lived async callbacks without stale closures.
  const statusRef = React.useRef(null);
  const activeModelRef = React.useRef("");
  React.useEffect(() => { statusRef.current = status; }, [status]);
  React.useEffect(() => { activeModelRef.current = activeModel; }, [activeModel]);

  React.useEffect(() => {
    api
      .get("/transcribe/status")
      .then((r) => {
        setStatus(r.data);
        setActiveModel(r.data?.model || "");
      })
      .catch(() => setStatus({ available: false }));
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopEverything = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLevel(0);
  };

  // Live volume meter — the "is my mic actually hearing me" check.
  const startMeter = (stream) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        setLevel(peak);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Meter is best-effort; recording still works without it.
    }
  };

  const startRecording = async () => {
    setResult(null);
    discardRef.current = false;
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
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    startMeter(stream);

    const preferred = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    const mimeType = preferred.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      recorderRef.current = null;
      stopEverything();
      if (discardRef.current) {          // cancelled mid-recording — throw it away
        discardRef.current = false;
        setPhase("idle");
        return;
      }
      if (!chunks.length) {
        setPhase("idle");
        toast.error("Didn't catch any audio — tap the mic and try again.");
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      uploadClip(blob);
    };
    recorder.onerror = () => {
      stopEverything();
      setPhase("idle");
      toast.error("Recording error. Please try again.");
    };

    recorder.start();
    setPhase("recording");
  };

  // Stop recording and transcribe what was captured.
  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setPhase("transcribing");
      recorder.stop();
    }
  };

  const uploadClip = async (blob) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const model = activeModelRef.current;
    try {
      // Load the model first (downloads on first use) as its own step, so a
      // slow first run shows "Loading model…" rather than a stuck transcription.
      const loaded = new Set(statusRef.current?.loaded || []);
      if (model && !loaded.has(model)) {
        setPhase("loading");
        const { data } = await api.post(
          "/transcribe/warm",
          { model },
          { signal: controller.signal }
        );
        setStatus((s) => ({ ...(s || {}), loaded: data.loaded }));
      }

      setPhase("transcribing");
      const form = new FormData();
      const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
      form.append("file", blob, `mic-test.${ext}`);
      if (model) form.append("model", model);
      const { data } = await api.post("/transcribe/test", form, {
        signal: controller.signal,
      });
      setResult(data);
      if (!data.text) toast.message("No speech detected in that clip.");
    } catch (err) {
      if (isCanceled(err)) {
        // User cancelled — stay quiet, just reset below.
      } else {
        const s = err?.response?.status;
        toast.error(
          s === 503
            ? "Offline transcription isn't set up on the server."
            : "Could not transcribe that clip. Please try again."
        );
      }
    } finally {
      abortRef.current = null;
      setPhase("idle");
    }
  };

  // One cancel that does the right thing for whatever is in progress.
  const cancel = () => {
    if (phase === "recording") {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();                 // fires onstop -> discarded
      } else {
        stopEverything();
        setPhase("idle");
      }
      return;
    }
    // loading / transcribing — abort the network request; the UI frees up
    // immediately (the server finishes its current clip and discards the result).
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setPhase("idle");
  };

  const chooseModel = async (name) => {
    if (name === activeModel || switching) return;
    const previous = activeModel;
    setActiveModel(name);           // optimistic
    setSwitching(true);
    try {
      const { data } = await api.post("/transcribe/model", { model: name });
      setStatus((s) => ({ ...(s || {}), model: data.model, loaded: data.loaded }));
      setActiveModel(data.model);
      toast.success(`Model set to “${data.model}”. It loads on the next test.`);
    } catch {
      setActiveModel(previous);     // roll back
      toast.error("Could not switch model.");
    } finally {
      setSwitching(false);
    }
  };

  if (status && status.available === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AudioLines className="h-4 w-4" /> Voice input (offline)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Offline transcription isn&apos;t available on the server. Install{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">faster-whisper</code> to
            enable it, or the app falls back to the browser&apos;s built-in voice input.
          </p>
        </CardContent>
      </Card>
    );
  }

  const models = status?.models || [];
  const loaded = new Set(status?.loaded || []);
  const recording = phase === "recording";
  const loading = phase === "loading";
  const transcribing = phase === "transcribing";
  const busy = loading || transcribing;

  const statusText = recording
    ? "Listening… tap stop when you’re done."
    : loading
    ? "Loading model… (first use downloads it — this can take a while)"
    : transcribing
    ? "Transcribing…"
    : "Idle";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AudioLines className="h-4 w-4" /> Voice input (offline)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Model picker — applies app-wide and is remembered across restarts. */}
        <div>
          <div className="mb-1 text-sm font-medium">Model</div>
          <div className="mb-3 text-xs text-muted-foreground">
            Bigger models are more accurate but slower and larger to download. Applies to all
            voice input and is saved.
          </div>
          <div className="flex flex-wrap gap-2" data-testid="whisper-model-picker">
            {models.map((m) => {
              const active = m === activeModel;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={switching || busy}
                  onClick={() => chooseModel(m)}
                  title={MODEL_INFO[m] || ""}
                  data-testid={`whisper-model-${m}`}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-60",
                    active
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  {m}
                  {loaded.has(m) && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle"
                          title="Loaded — switching here is instant" />
                  )}
                </button>
              );
            })}
          </div>
          {activeModel && (
            <p className="mt-2 text-xs text-muted-foreground">{MODEL_INFO[activeModel]}</p>
          )}
        </div>

        {/* Mic test — record, then see the transcription. */}
        <div className="border-t border-border/60 pt-5">
          <div className="mb-1 text-sm font-medium">Test your microphone</div>
          <div className="mb-3 text-xs text-muted-foreground">
            Tap record and say something like <em>“Zomato 450 rupees and petrol 1200”</em>, then
            tap stop. The text below is what the server heard.
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
              data-testid="mic-test-btn"
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors disabled:opacity-60",
                recording ? "bg-rose-500 hover:bg-rose-600" : "bg-primary hover:bg-primary/90"
              )}
              aria-label={recording ? "Stop recording" : "Start recording"}
            >
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : recording ? (
                <Square className="h-5 w-5" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              {/* Volume meter — confirms the mic is picking up sound. */}
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-75",
                      recording ? "bg-emerald-500" : "bg-muted-foreground/30"
                    )}
                    style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
                  />
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                {statusText}
              </div>
            </div>

            {/* Cancel — stops recording without transcribing, or aborts an
                in-flight load/transcription so the UI never gets stuck. */}
            {(recording || busy) && (
              <Button
                variant="outline"
                size="sm"
                onClick={cancel}
                data-testid="mic-test-cancel"
                className="shrink-0"
              >
                <X className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>

          {/* Transcription output. */}
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            {result ? (
              <>
                <p className="text-sm" data-testid="mic-test-text">
                  {result.text ? `“${result.text}”` : (
                    <span className="text-muted-foreground">No speech detected.</span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">model: {result.model}</Badge>
                  {result.language && (
                    <Badge variant="secondary">
                      lang: {result.language} ({Math.round((result.language_probability || 0) * 100)}%)
                    </Badge>
                  )}
                  {typeof result.duration_ms === "number" && (
                    <Badge variant="secondary">{(result.duration_ms / 1000).toFixed(1)}s</Badge>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {busy ? statusText : "The transcription will appear here."}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
