import React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight homegrown tooltip that mirrors the shadcn/Radix API used in the
 * rest of the UI (`TooltipProvider`, `Tooltip`, `TooltipTrigger asChild`,
 * `TooltipContent`). No external dependency, no portal — positioned with
 * `position: fixed` from `getBoundingClientRect()`.
 */

const TooltipContext = React.createContext({
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
  contentRef: { current: null },
});

function TooltipProvider({ children }) {
  // The provider only forwards the context. Each Tooltip below it manages
  // its own open state, so multiple tooltips on the same page can coexist.
  return <>{children}</>;
}

function Tooltip({ children }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const value = React.useMemo(
    () => ({ open, setOpen, triggerRef, contentRef }),
    [open]
  );
  return (
    <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>
  );
}

function setRef(ref, node) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

const TooltipTrigger = React.forwardRef(function TooltipTrigger(
  { asChild = false, children, ...props },
  ref
) {
  const ctx = React.useContext(TooltipContext);

  const show = () => ctx.setOpen(true);
  const hide = (e) => {
    // Don't close when the pointer is moving into the tooltip body.
    const next = e?.relatedTarget;
    if (next && ctx.contentRef.current && ctx.contentRef.current.contains(next))
      return;
    ctx.setOpen(false);
  };

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props || {};
    return React.cloneElement(children, {
      ref: (node) => {
        ctx.triggerRef.current = node;
        setRef(ref, node);
        const existing = childProps.ref;
        if (typeof existing === "function") existing(node);
        else if (existing && "current" in existing) existing.current = node;
      },
      onMouseEnter: (e) => {
        show();
        childProps.onMouseEnter?.(e);
      },
      onMouseLeave: (e) => {
        hide(e);
        childProps.onMouseLeave?.(e);
      },
      onFocus: (e) => {
        show();
        childProps.onFocus?.(e);
      },
      onBlur: (e) => {
        hide();
        childProps.onBlur?.(e);
      },
      ...props,
    });
  }

  return (
    <span
      ref={(node) => {
        ctx.triggerRef.current = node;
        setRef(ref, node);
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      {...props}
    >
      {children}
    </span>
  );
});

const TooltipContent = React.forwardRef(function TooltipContent(
  { className, sideOffset = 6, side = "top", children, ...props },
  ref
) {
  const ctx = React.useContext(TooltipContext);
  const [pos, setPos] = React.useState(null);

  React.useLayoutEffect(() => {
    if (!ctx.open || !ctx.triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = ctx.triggerRef.current.getBoundingClientRect();
    const node = ctx.contentRef.current;
    const w = node?.offsetWidth ?? 0;
    const h = node?.offsetHeight ?? 0;
    let top = 0;
    let left = rect.left + rect.width / 2 - w / 2;
    if (side === "top") top = rect.top - h - sideOffset;
    else if (side === "bottom") top = rect.bottom + sideOffset;
    else if (side === "left") {
      top = rect.top + rect.height / 2 - h / 2;
      left = rect.left - w - sideOffset;
    } else if (side === "right") {
      top = rect.top + rect.height / 2 - h / 2;
      left = rect.right + sideOffset;
    }
    // Clamp inside viewport.
    const margin = 4;
    left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
    setPos({ top, left });
  }, [ctx.open, side, sideOffset]);

  if (!ctx.open) return null;

  const show = () => ctx.setOpen(true);
  const hide = (e) => {
    const next = e?.relatedTarget;
    if (next && ctx.triggerRef.current && ctx.triggerRef.current.contains(next))
      return;
    ctx.setOpen(false);
  };

  return (
    <div
      ref={(node) => {
        ctx.contentRef.current = node;
        setRef(ref, node);
      }}
      role="tooltip"
      onMouseEnter={show}
      onMouseLeave={hide}
      className={cn(
        "fixed z-50 whitespace-nowrap rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-fade-up",
        className
      )}
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: 0, left: 0, visibility: "hidden" }
      }
      {...props}
    >
      {children}
    </div>
  );
});

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };