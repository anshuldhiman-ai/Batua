import React from "react";
import { cn } from "@/lib/utils";

/**
 * Inline checkbox: an 18px custom box (5px radius, 1px
 * border) with an SVG checkmark that draws itself when
 * checked (stroke-dashoffset, 180ms). The native input
 * is invisible but still the real input — keyboard,
 * form state and screen readers all work unchanged.
 */

interface AuthCheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function AuthCheckbox({
  id,
  label,
  checked,
  onChange,
  className,
}: AuthCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-[color:var(--auth-ink-2)]",
        className
      )}
    >
      <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-[18px] w-[18px] cursor-pointer appearance-none rounded-[5px] border border-[color:var(--auth-line-strong)] bg-[color:var(--auth-surface)] transition-colors checked:border-[color:var(--auth-accent)] checked:bg-[color:var(--auth-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--auth-panel)]"
        />
        {/* The check glyph sits between the input and its label in
            the DOM so `input:checked + .auth-check-glyph` selects it
            from CSS and the path can draw itself. */}
        <svg
          viewBox="0 0 12 12"
          className="auth-check-glyph pointer-events-none h-3 w-3 text-[color:var(--auth-accent-ink)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path className="auth-check-path" d="M2 6.2 4.8 9 10 3.2" />
        </svg>
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </label>
  );
}
