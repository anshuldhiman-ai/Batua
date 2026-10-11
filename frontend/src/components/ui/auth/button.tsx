import React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Button for the auth surface.
 *
 * Solid accent fill with a 1px top inner highlight and a
 * layered soft shadow — deliberate depth, no glow. On
 * hover it lifts 1px, brightens 6%, and a faint sheen
 * sweeps across (`.auth-sheen`). `variant="secondary"`
 * is the quiet path (outline, transparent fill).
 */

type AuthButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  /** Show the loading micro-state (spinner + disabled + "Signing in…"). */
  loading?: boolean;
  /** Replaces the label while `loading`. */
  loadingLabel?: string;
  /** Show the arrow that slides in on hover (primary CTA). */
  withArrow?: boolean;
};

export function AuthButton({
  variant = "primary",
  loading = false,
  loadingLabel = "Signing in…",
  withArrow = false,
  className,
  children,
  disabled,
  ...props
}: AuthButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "group flex h-12 w-full items-center justify-center gap-1.5 rounded-[10px] text-[15px] font-medium",
        "transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)] focus-visible:ring-offset-2",
        "focus-visible:ring-offset-[color:var(--auth-panel)]",
        variant === "primary"
          ? "auth-sheen bg-[color:var(--auth-accent)] text-[color:var(--auth-accent-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_24px_-8px_rgba(16,185,129,0.45)] hover:-translate-y-px hover:bg-[color:var(--auth-accent-hover)] hover:brightness-[1.06] active:translate-y-0 active:scale-[0.985]"
          : "border border-[color:var(--auth-line-strong)] bg-transparent text-[color:var(--auth-ink-2)] transition-colors hover:border-[color:var(--auth-line-strong)] hover:bg-[color:var(--auth-surface)] hover:text-[color:var(--auth-ink)] active:scale-[0.985]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <span className="auth-spinner" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        <>
          {children}
          {withArrow && (
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 opacity-0 transition-all duration-200 ease-out group-hover:translate-x-0.5 group-hover:opacity-100"
            />
          )}
        </>
      )}
    </button>
  );
}

/** 16px spinner — sized to sit comfortably in a 48px button. */
export function AuthSpinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("auth-spinner", className)}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading</span>
    </span>
  );
}
