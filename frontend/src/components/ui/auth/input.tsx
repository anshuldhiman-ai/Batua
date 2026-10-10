import React from "react";
import { cn } from "@/lib/utils";

/**
 * Labelled text field for the auth surface.
 *
 * The label is always above the input (never placeholder-only) —
 * placeholders are hints at most. Errors set `error`, which
 * adds the red border, the icon and the `aria-describedby`
 * message below the field.
 */

interface AuthInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  id: string;
  label: string;
  /** Hint rendered under the label; not a substitute for it. */
  hint?: string;
  error?: string | null;
  /** Extra content rendered to the right of the label (e.g. a link). */
  labelAction?: React.ReactNode;
  /** Trailing element inside the input box (e.g. show/hide eye). */
  trailing?: React.ReactNode;
}

export const AuthInput = React.forwardRef<HTMLInputElement, AuthInputProps>(
  (
    {
      id,
      label,
      hint,
      error,
      labelAction,
      trailing,
      className,
      ...props
    },
    ref
  ) => {
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const describedBy = [
      error ? errorId : null,
      !error && hint ? hintId : null,
      props["aria-describedby"],
    ]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor={id}
            className="text-[13px] font-medium text-[color:var(--auth-ink-2)]"
          >
            {label}
          </label>
          {labelAction}
        </div>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "h-12 w-full rounded-lg border bg-[color:var(--auth-surface)] px-3.5 py-2",
              // 16px below sm so iOS doesn't zoom on focus; the
              // spec's 15px body size applies once there's room.
              "text-base leading-[24px] text-[color:var(--auth-ink)] sm:text-[15px]",
              "placeholder:text-[color:var(--auth-ink-3)]",
              "transition-colors",
              "hover:border-[color:var(--auth-line-strong)]",
              "focus:outline-none focus-visible:border-[color:var(--auth-accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error
                ? "border-[color:var(--auth-error)] focus-visible:border-[color:var(--auth-error)]"
                : "border-[color:var(--auth-line)]",
              className
            )}
            {...props}
          />
          {trailing && (
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              {trailing}
            </div>
          )}
        </div>
        {/* Fixed-height slot so the form never jumps when an
            error appears or the strength meter mounts. */}
        <div className="min-h-[18px] text-[13px] leading-[18px]">
          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-1.5 text-[color:var(--auth-error)]"
            >
              <ErrorGlyph aria-hidden="true" />
              {error}
            </p>
          )}
          {!error && hint && (
            <p id={hintId} className="text-[color:var(--auth-ink-3)]">
              {hint}
            </p>
          )}
        </div>
      </div>
    );
  }
);
AuthInput.displayName = "AuthInput";

function ErrorGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.75v3.5" />
      <circle cx="8" cy="11" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
