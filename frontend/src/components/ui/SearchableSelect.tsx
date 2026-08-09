import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Searchable combobox: an editable input that filters a list of options.
 *
 * - `search` shows a filter input up front (for categories, which can be many).
 * - `allowCustom` lets the user keep a typed value that isn't in `options`
 *   (for payment methods like "HDFC" or a brand-new method).
 * - Portalled to <body> with fixed positioning, mirroring the homegrown Select
 *   so it is never clipped by an overflow-hidden card.
 */
export default function SearchableSelect({
  value = "",
  options = [],
  onChange,
  placeholder = "",
  search = false,
  allowCustom = false,
  className,
  "data-testid": dataTestid,
}: any) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value); // text inside the input while open
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<any>(null);

  const lower = draft.toLowerCase();
  const filtered = options.filter((o) => String(o).toLowerCase().includes(lower));
  const exact = filtered.find((o) => String(o).toLowerCase() === lower);

  // Reset the draft to the committed value each time the menu re-opens.
  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Track the trigger's viewport rect while open so the fixed-position menu
  // follows it through scrolls/resizes; flip above when the bottom is tight.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuMax = 260; // matches max-h-60 + search header
      const openUp = r.bottom + menuMax > window.innerHeight && r.top > menuMax;
      setPos({
        left: r.left,
        width: Math.max(r.width, 240),
        top: openUp ? undefined : r.bottom + 4,
        bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const commit = (next: string) => {
    onChange(next);
    setDraft(next);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (exact) commit(exact);
      else if (allowCustom && draft.trim()) commit(draft.trim());
      else close();
    }
  };

  // Outside click closes; a typed custom value is committed first (if allowed).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      if (allowCustom && draft.trim()) onChange(draft.trim());
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, draft, allowCustom]);

  const canCustomCommit = allowCustom && draft.trim() && !exact;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={dataTestid}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            tabIndex={-1}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
            }}
            className="z-50 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md animate-fade-up"
            onKeyDown={onKeyDown}
          >
            {(search || allowCustom) && (
              <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={search ? "Search…" : "Type or choose…"}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  data-testid={dataTestid ? `${dataTestid}-search` : undefined}
                />
              </div>
            )}
            <ul className="max-h-60 overflow-auto p-1">
              {filtered.length === 0 && !canCustomCommit && (
                <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>
              )}
              {filtered.map((o) => (
                <li
                  key={o}
                  role="option"
                  aria-selected={o === value}
                  onClick={() => commit(o)}
                  className={cn(
                    "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                    o === value && "bg-accent/50"
                  )}
                >
                  <span className="truncate">{o}</span>
                  {o === value && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </li>
              ))}
              {canCustomCommit && (
                <li
                  role="option"
                  onClick={() => commit(draft.trim())}
                  className="flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-primary hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="truncate">Use “{draft.trim()}”</span>
                </li>
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
