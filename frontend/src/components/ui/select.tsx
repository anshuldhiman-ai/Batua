import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Homegrown `<Select>` that mirrors the shadcn/Radix API used elsewhere in
 * the UI. Controlled via `value` + `onValueChange`; renders a button trigger
 * plus a dropdown portalled to <body> — cards use overflow-hidden (for the
 * cursor glow), which clipped an absolutely-positioned menu and made options
 * below the card edge unclickable. The portal is position: fixed against the
 * trigger's rect and flips upward when there's no room below.
 */

const SelectContext = React.createContext({
  value: undefined,
  onValueChange: () => {},
  setOpen: () => {},
  open: false,
  triggerRef: { current: null },
  registerItem: () => {},
});

function Select({ value, onValueChange, defaultValue, children, ...props }) {
  const [open, setOpen] = React.useState(false);
  const [internal, setInternal] = React.useState(defaultValue);
  const triggerRef = React.useRef(null);
  const itemsRef = React.useRef(new Map());
  const labelsRef = React.useRef(new Map());

  const isControlled = value !== undefined;
  const current = isControlled ? value : internal;

  const updateValue = React.useCallback(
    (next) => {
      if (!isControlled) setInternal(next);
      onValueChange?.(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [isControlled, onValueChange]
  );

  const registerItem = React.useCallback((itemValue, node) => {
    if (node) {
      itemsRef.current.set(itemValue, node);
      const label = node.dataset?.label;
      if (label) labelsRef.current.set(itemValue, label);
    } else {
      itemsRef.current.delete(itemValue);
    }
  }, []);

  const ctx = React.useMemo(
    () => ({
      value: current,
      onValueChange: updateValue,
      setOpen,
      open,
      triggerRef,
      registerItem,
      items: itemsRef,
      labels: labelsRef,
    }),
    [current, updateValue, open, registerItem]
  );

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const t = e.target;
      if (triggerRef.current?.contains(t)) return;
      if (itemsRef.current.values()) {
        for (const node of itemsRef.current.values()) {
          if (node?.contains(t)) return;
        }
      }
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <SelectContext.Provider value={ctx}>
      <div className="relative inline-block" {...props}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

const SelectTrigger = React.forwardRef(function SelectTrigger(
  { className, children, ...props },
  ref
) {
  const ctx = React.useContext(SelectContext);
  return (
    <button
      type="button"
      ref={(node) => {
        ctx.triggerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onClick={() => ctx.setOpen((o) => !o)}
      aria-haspopup="listbox"
      aria-expanded={ctx.open}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  );
});

function SelectValue({ placeholder }) {
  const ctx = React.useContext(SelectContext);
  const current = ctx.value;
  // The currently-selected item exposes its label via a label registry — but
  // we don't ship one. Instead, look up the label by reading the children of
  // the rendered SelectItems via the items map (each item stores its label).
  let label = placeholder;
  if (current !== undefined) {
    label = ctx.labels?.current?.get(current) ?? label;
  }
  return (
    <span className={cn("truncate", !current && "text-muted-foreground")}>
      {label ?? placeholder}
    </span>
  );
}

const SelectContent = React.forwardRef(function SelectContent(
  { className, children, ...props },
  ref
) {
  const ctx = React.useContext(SelectContext);
  const [pos, setPos] = React.useState(null);

  // Track the trigger's viewport rect while open so the fixed-position menu
  // follows it through scrolls/resizes; flip above when the bottom is tight.
  React.useLayoutEffect(() => {
    if (!ctx.open) return;
    const update = () => {
      const r = ctx.triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuMax = 240; // matches max-h-60
      const openUp = r.bottom + menuMax > window.innerHeight && r.top > menuMax;
      setPos({
        left: r.left,
        width: r.width,
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
  }, [ctx.open, ctx.triggerRef]);

  if (!ctx.open || !pos) {
    // Keep items mounted (display:none) so they register their labels —
    // SelectValue resolves the trigger text from that registry even before
    // the menu has ever been opened.
    return createPortal(
      <div role="listbox" tabIndex={-1} style={{ display: "none" }} {...props}>
        {children}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={ref}
      role="listbox"
      tabIndex={-1}
      style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
      className={cn(
        "z-50 max-h-60 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-fade-up",
        className
      )}
      {...props}
    >
      {children}
    </div>,
    document.body
  );
});

const SelectItem = React.forwardRef(function SelectItem(
  { className, value, children, ...props },
  ref
) {
  const ctx = React.useContext(SelectContext);
  const isSelected = ctx.value === value;
  return (
    <div
      ref={(node) => {
        ctx.registerItem(value, node);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      role="option"
      aria-selected={isSelected}
      data-label={typeof children === "string" ? children : undefined}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        isSelected && "bg-accent/50",
        className
      )}
      {...props}
    >
      {isSelected && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Check className="h-4 w-4" />
        </span>
      )}
      <span className="truncate">{children}</span>
    </div>
  );
});

export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};