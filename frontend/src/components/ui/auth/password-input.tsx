import React from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Keyboard } from "lucide-react";
import { AuthInput } from "./input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle.
 *
 * The toggle is a real button with `aria-label` and
 * `aria-pressed`, so it works with keyboard and screen
 * readers. Pasting is always allowed (autocomplete and
 * password managers need it).
 */

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  /** Caps Lock indicator, driven by the parent's key handlers. */
  capsLock?: boolean;
  /** Leading icon inside the input (e.g. Lock). */
  icon?: React.ReactNode;
  /** Extra content under the input (strength meter, etc.). */
  children?: React.ReactNode;
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(({ id, label, error, hint, capsLock, icon, className, children, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  const footer = children ? <>{children}</> : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-[color:var(--auth-ink-2)]">
          {label}
        </label>
      </div>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--auth-ink-3)]" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          className={cn(
            "h-[54px] w-full rounded-2xl border bg-[color:var(--auth-surface)] py-2",
            "transition-all duration-200 ease-out",
            "text-base leading-[24px] text-[color:var(--auth-ink)] sm:text-[15px]",
            "placeholder:text-[color:var(--auth-ink-3)]",
            "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),inset_0_2px_4px_rgba(20,60,40,0.05)]",
            "hover:border-[color:var(--auth-line-strong)]",
            "focus:outline-none focus-visible:border-[color:var(--auth-accent)] focus-visible:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),inset_0_2px_4px_rgba(20,60,40,0.05),0_0_0_2px_var(--auth-accent-soft)] focus-visible:-translate-y-px",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-[color:var(--auth-error)] focus-visible:border-[color:var(--auth-error)] focus-visible:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),inset_0_2px_4px_rgba(20,60,40,0.05),0_0_0_2px_var(--auth-error-soft)] focus-visible:ring-0"
              : "border-[color:rgba(255,255,255,0.10)]",
            icon ? "pl-11" : "px-3.5",
            capsLock ? "pr-20" : "pr-12",
            className
          )}
          autoComplete={props.autoComplete ?? "current-password"}
          {...props}
        />
        {capsLock && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2 mr-2 pointer-events-none" aria-hidden="true">
            <Keyboard className="h-4 w-4 text-[color:var(--auth-warning)]" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-3 flex items-center text-[color:var(--auth-ink-3)] transition-colors hover:text-[color:var(--auth-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]"
        >
          <span className="relative flex h-[18px] w-[18px] items-center justify-center">
            <motion.span
              initial={false}
              animate={{ scale: visible ? [1, 0.75, 1] : 1, opacity: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex"
            >
              {visible ? (
                <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.5} />
              ) : (
                <Eye className="h-[18px] w-[18px]" strokeWidth={1.5} />
              )}
            </motion.span>
          </span>
        </button>
      </div>
      {(error || hint || (!error && footer)) && (
        <div className="text-[13px] leading-[18px]">
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-[color:var(--auth-error)]">
              <ErrorGlyph aria-hidden="true" />
              {error}
            </p>
          )}
          {!error && hint && (
            <p className="text-[color:var(--auth-ink-3)]">
              {hint}
            </p>
          )}
          {!error && !hint && footer}
        </div>
      )}
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

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
