import React from "react";
import { cn } from "@/lib/utils";

/**
 * Button for the auth surface.
 *
 * Deliberately flat: a solid accent fill with a subtle top
 * inner highlight and a soft layered shadow — no gradients,
 * no colored glow. `variant="secondary"` is the quiet path
 * (outline, transparent fill).
 */

type AuthButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  /** Show the loading micro-state (spinner + disabled + "Signing in…"). */
  loading?: boolean;
  /** Replaces the label while `loading`. */
  loadingLabel?: string;
};

export function AuthButton({
  variant = "primary",
  loading = false,
  loadingLabel = "Signing in…",
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
        "flex h-12 w-full items-center justify-center rounded-lg text-[15px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)] focus-visible:ring-offset-2",
        "focus-visible:ring-offset-[color:var(--auth-panel)]",
        variant === "primary"
          ? "bg-[color:var(--auth-accent)] text-[color:var(--auth-accent-ink)] shadow-[var(--auth-shadow-sm),inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-[color:var(--auth-accent-hover)] active:brightness-95"
          : "border border-[color:var(--auth-line-strong)] bg-transparent text-[color:var(--auth-ink-2)] hover:border-[color:var(--auth-line-strong)] hover:bg-[color:var(--auth-surface)] hover:text-[color:var(--auth-ink)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <span className="auth-spinner mr-2" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        children
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
