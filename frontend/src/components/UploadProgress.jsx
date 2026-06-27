import React from "react";
import {
  UploadCloud,
  FileSearch,
  Tags,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Staged progress indicator for Excel uploads.
 *
 * Renders four stages in order. Each stage shows an icon + label. Active
 * stages pulse; completed stages show a check; failed stages turn red.
 *
 * Props:
 *   stage   - one of: "uploading" | "reading" | "categorizing" | "saving"
 *                    | "complete" | "error"
 *   progress - 0..100 numeric progress for the visible bar
 *   message - optional override for the message under the bar
 */
export default function UploadProgress({ stage, progress = 0, message }) {
  const stages = [
    { id: "uploading", icon: UploadCloud, label: "Uploading your file" },
    { id: "reading", icon: FileSearch, label: "Reading the file" },
    { id: "categorizing", icon: Tags, label: "Smart-categorizing" },
    { id: "saving", icon: Database, label: "Saving transactions" },
  ];

  const order = stages.map((s) => s.id);
  const activeIdx = order.indexOf(stage);
  const isComplete = stage === "complete";
  const isError = stage === "error";

  return (
    <div className="w-full space-y-3">
      {/* Animated bar */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full transition-all duration-500 ease-out",
            isError ? "bg-rose-500" : "bg-primary"
          )}
          style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
        />
        {!isError && !isComplete && (
          <div
            className="absolute inset-y-0 left-0 w-1/3 animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent"
            style={{ left: `${Math.max(0, progress - 15)}%` }}
          />
        )}
      </div>

      {/* Stage chips */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map((s, i) => {
          const Icon = s.icon;
          let state = "pending";
          if (isError) {
            state = i === activeIdx ? "error" : i < activeIdx ? "done" : "pending";
          } else if (isComplete) {
            state = "done";
          } else if (i < activeIdx) {
            state = "done";
          } else if (i === activeIdx) {
            state = "active";
          }
          return (
            <div
              key={s.id}
              data-testid={`upload-stage-${s.id}`}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                state === "done" && "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
                state === "active" && "border-primary/50 bg-primary/10 text-primary shadow-sm",
                state === "pending" && "border-border bg-card/40 text-muted-foreground",
                state === "error" && "border-rose-500/40 bg-rose-500/5 text-rose-600"
              )}
            >
              <StageIcon state={state} Icon={Icon} />
              <span className="truncate">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Status message */}
      <p
        className={cn(
          "text-center text-xs font-medium",
          isError ? "text-rose-600" : isComplete ? "text-emerald-600" : "text-muted-foreground"
        )}
        data-testid="upload-status-message"
      >
        {message || (isComplete ? "All done!" : isError ? "Upload failed" : "Working on it…")}
      </p>
    </div>
  );
}

function StageIcon({ state, Icon }) {
  if (state === "done") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
  if (state === "error") return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  if (state === "active") return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />;
  return <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />;
}
