import React from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
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

  const footer =
    (capsLock && !error) || children ? (
      <>
        {capsLock && !error && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--auth-warning)]"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M8 1.5 1.9 13.5h12.2L8 1.5Z" />
              <path d="M8 6v3.5" />
              <circle cx="8" cy="11.6" r="0.5" fill="currentColor" stroke="none" />
            </svg>
            Caps Lock is on
          </p>
        )}
        {children}
      </>
    ) : undefined;

  return (
    <AuthInput
      ref={ref}
      id={id}
      label={label}
      error={error}
      hint={hint}
      footer={footer}
      icon={icon}
      type={visible ? "text" : "password"}
      autoComplete={props.autoComplete ?? "current-password"}
      className={cn("pr-11", className)}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl text-[color:var(--auth-ink-3)] transition-colors duration-150 hover:text-[color:var(--auth-ink)] hover:bg-[color:var(--auth-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]"
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
      }
      {...props}
    />
  );
});
PasswordInput.displayName = "PasswordInput";
