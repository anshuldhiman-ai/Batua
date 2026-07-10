import React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validate YYYY-MM-DD with real calendar bounds (1900–2100). */
export function isValidDateString(value) {
  if (!value || !DATE_RE.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Date field capped at YYYY-MM-DD — rejects invalid years/days/months on change.
 */
export const DateInput = React.forwardRef(function DateInput(
  { className, value, onChange, ...props },
  ref
) {
  const handleChange = (e) => {
    const v = e.target.value;
    if (!v) {
      onChange?.("");
      return;
    }
    if (isValidDateString(v)) {
      onChange?.(v);
    }
  };

  return (
    <Input
      ref={ref}
      type="date"
      value={value || ""}
      onChange={handleChange}
      min="1900-01-01"
      max="2100-12-31"
      className={cn(className)}
      {...props}
    />
  );
});

/** Day-of-month 1–31 only. */
export const DayInput = React.forwardRef(function DayInput(
  { className, value, onChange, ...props },
  ref
) {
  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (raw === "") {
      onChange?.(1);
      return;
    }
    const n = Math.min(31, Math.max(1, parseInt(raw, 10) || 1));
    onChange?.(n);
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={value ?? 1}
      onChange={handleChange}
      className={cn(className)}
      {...props}
    />
  );
});
