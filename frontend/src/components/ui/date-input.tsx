import React from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" -> "DD/MM/YYYY" */
function isoToDisplay(iso) {
  const m = DATE_RE.exec((iso || "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "DD/MM/YYYY" -> "YYYY-MM-DD" (from the 8 typed digits) or null if incomplete. */
function displayToISO(display) {
  const digits = (display || "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]; // Mon-first

function monthCells(year, month) {
  // month is 0-based; returns array of day numbers with nulls for the leading gap.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

const POPUP_W = 264; // matches w-[264px]

/**
 * Premium date field: types DD/MM/YYYY with the slashes inserted automatically
 * and opens a themed calendar popup. Transactions can never be future-dated —
 * days after today are disabled and typed future dates are rejected (max = today
 * unless an explicit max is passed). Keeps the same controlled API as before:
 * value = "YYYY-MM-DD", onChange("YYYY-MM-DD").
 */
export const DateInput = React.forwardRef(function DateInput(
  { className, value, onChange, max, min, placeholder, onBlur, ...props },
  ref
) {
  const [open, setOpen] = React.useState(false);
  const [display, setDisplay] = React.useState(() => isoToDisplay(value));
  const [alignRight, setAlignRight] = React.useState(false);
  const wrapRef = React.useRef(null);

  const maxISO = max || todayISO();
  const minISO = min || "1900-01-01";

  // The month the popup shows; follows the current value, else the current month.
  const [viewYm, setViewYm] = React.useState(() => {
    const m = DATE_RE.exec(value || maxISO);
    if (m) return `${m[1]}-${m[2]}`;
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });

  // Keep the typed text in sync when the value changes externally (parse/clear).
  React.useEffect(() => {
    setDisplay(isoToDisplay(value));
  }, [value]);

  // Close on outside click / Escape; flip popup left when it would overflow.
  React.useEffect(() => {
    if (!open) return undefined;
    const rect = wrapRef.current?.getBoundingClientRect();
    setAlignRight(Boolean(rect && rect.right + POPUP_W > window.innerWidth));
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (iso) => {
    if (iso && iso <= maxISO && iso >= minISO) {
      onChange?.(iso);
      setViewYm(iso.slice(0, 7));
    }
  };

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setDisplay(out);
    setOpen(true);
    if (digits.length === 8) {
      const iso = displayToISO(out);
      if (iso && isValidDateString(iso)) commit(iso);
    }
  };

  const selectDay = (iso) => {
    commit(iso);
    if (iso) setDisplay(isoToDisplay(iso));
    setOpen(false);
  };

  const shiftMonth = (delta) => {
    const [y, m] = viewYm.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setViewYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const [viewY, viewM] = viewYm.split("-").map(Number);
  const cells = monthCells(viewY, viewM - 1);
  const canNext = viewYm < maxISO.slice(0, 7);
  const today = todayISO();
  const selISO = DATE_RE.exec(value || "") ? value : null;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder || "DD/MM/YYYY"}
          value={display}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          className="pr-9"
          {...props}
        />
        <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute z-50 mt-1.5 w-[264px] rounded-xl border border-border bg-card p-3 shadow-xl backdrop-blur-xl",
              alignRight ? "right-0" : "left-0"
            )}
          >
            {/* Month header */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold tabular-nums">
                {new Date(viewY, viewM - 1, 1).toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={!canNext}
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday header (Mon-first) */}
            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="pb-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) => {
                if (day == null) return <div key={i} />;
                const iso = `${viewYm}-${String(day).padStart(2, "0")}`;
                const disabled = iso < minISO || iso > maxISO;
                const isSel = iso === selISO;
                const isToday = iso === today;
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={disabled}
                    onClick={() => selectDay(iso)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs tabular-nums transition-colors",
                      disabled && "cursor-not-allowed text-muted-foreground/25",
                      !disabled && !isSel && "text-foreground hover:bg-accent",
                      isSel && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                      isToday && !isSel && "font-semibold ring-1 ring-inset ring-primary/50"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
