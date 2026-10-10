import React from "react";
import { cn } from "@/lib/utils";

/**
 * Password strength meter.
 *
 * Four segments + a text label. The label is the accessible
 * name (`aria-label` on the group) so the score is never
 * conveyed by color alone. `score` 0 means "empty" and
 * renders nothing — the slot keeps its height so the form
 * doesn't jump.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;

const SEGMENT_CLASS = [
  "bg-[color:var(--auth-ink-3)]",
  "bg-[color:var(--auth-error)]",
  "bg-[color:var(--auth-warning)]",
  "bg-[color:var(--auth-accent-hover)]",
  "bg-[color:var(--auth-accent)]",
] as const;

interface StrengthMeterProps {
  score: StrengthScore;
}

export function StrengthMeter({ score }: StrengthMeterProps) {
  if (score <= 0) return null;
  const label = STRENGTH_LABELS[score];
  return (
    <div
      role="group"
      aria-label={`Password strength: ${label}`}
      className="flex items-center gap-2"
    >
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1 w-4 rounded-full transition-colors duration-200",
              segment <= score ? SEGMENT_CLASS[score] : "bg-[color:var(--auth-line-strong)]"
            )}
          />
        ))}
      </div>
      <span className="text-[13px] text-[color:var(--auth-ink-3)]">{label}</span>
    </div>
  );
}

/**
 * Pure scorer — kept separate so it's testable and so the
 * meter is a hint, not a gate. The server enforces the real
 * minimum (4 characters); this only reports shape.
 */
export function passwordStrength(pw: string): {
  score: StrengthScore;
  label: string;
  checks: { label: string; met: boolean }[];
} {
  const checks = [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "Upper and lower case letters", met: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number or symbol", met: /\d/.test(pw) || /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = (pw ? 1 : 0) + checks.filter((c) => c.met).length as StrengthScore;
  return { score: Math.min(4, score) as StrengthScore, label: STRENGTH_LABELS[score], checks };
}
