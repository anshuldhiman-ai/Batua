import React from "react";
import { cn } from "@/lib/utils";

/**
 * Inline checkbox: the check glyph is a sibling of the hidden
 * native input, revealed by `peer-checked` — no absolute
 * positioning, so the label stays correctly aligned.
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
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-[color:var(--auth-line-strong)] bg-[color:var(--auth-surface)] transition-colors checked:border-[color:var(--auth-accent)] checked:bg-[color:var(--auth-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--auth-panel)]"
        />
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none h-3 w-3 text-[color:var(--auth-accent-ink)] opacity-0 transition-opacity peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 6.2 4.8 9 10 3.2" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}
