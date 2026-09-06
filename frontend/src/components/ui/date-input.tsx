import React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
  value?: string;
  onChange?: (value: string) => void;
  max?: string;
  min?: string;
  placeholder?: string;
  onBlur?: () => void;
}

interface DayInputProps extends React.ComponentPropsWithoutRef<typeof Input> {
  value?: number;
  onChange?: (value: number) => void;
}

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

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/**
 * Native date field — renders the browser's own year → month → day picker, so
 * it floats above the app (never clipped by a dialog/card) and supports direct
 * year/month/day selection out of the box. `max` defaults to today so
 * transactions can't be future-dated. Same controlled API as before:
 * value = "YYYY-MM-DD", onChange("YYYY-MM-DD").
 *
 * Dark mode is handled globally in index.css (`input[type="date"]`).
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ className, value, onChange, max, min, placeholder, onBlur, id, ...props }, ref) {
    return (
      <Input
        ref={ref}
        id={id}
        type="date"
        value={value || ""}
        min={min || "1900-01-01"}
        max={max || todayISO()}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        className={cn("appearance-none", className)}
        {...props}
      />
    );
  }
);

/** Day-of-month 1–31 only. */
export const DayInput = React.forwardRef<HTMLInputElement, DayInputProps>(
  function DayInput({ className, value, onChange, ...props }, ref) {
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
  }
);
