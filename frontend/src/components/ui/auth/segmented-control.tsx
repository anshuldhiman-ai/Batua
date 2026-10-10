import React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control ("Sign in" / "Register").
 *
 * A neutral track with an elevated surface for the selected
 * segment — no gradient. The thumb slides with a 200ms
 * ease-out transform. Arrow keys move between segments,
 * per the tablist pattern.
 */

interface SegmentedControlProps<T extends string> {
  id: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}

export function SegmentedControl<T extends string>({
  id,
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (index + dir + options.length) % options.length;
    onChange(options[next].value);
    // Keep focus on the segment that just became selected.
    requestAnimationFrame(() => {
      document.getElementById(`${id}-${options[next].value}`)?.focus();
    });
  };

  return (
    <div
      id={id}
      role="tablist"
      aria-label="Choose action"
      onKeyDown={onKeyDown}
      className={cn(
        "relative grid grid-cols-2 rounded-lg border border-[color:var(--auth-line)] bg-[color:var(--auth-surface)] p-1",
        className
      )}
    >
      {/* Sliding thumb — one element, moved by transform only. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 w-[calc(50%-4px)] rounded-md border border-[color:var(--auth-line-strong)] bg-[color:var(--auth-panel)] shadow-[var(--auth-shadow-sm)] transition-transform duration-200 ease-out"
        style={{
          left: 4,
          transform: `translateX(calc(${index} * 100%))`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 flex h-10 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--auth-accent)]",
              selected
                ? "text-[color:var(--auth-ink)]"
                : "text-[color:var(--auth-ink-3)] hover:text-[color:var(--auth-ink-2)]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
