import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Dialog({ open, onOpenChange, children }: any) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onOpenChange?.(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;
  // Portal to <body>: ancestors with CSS transforms (e.g. the page-enter
  // animation on every page root) hijack position:fixed and make the dialog
  // center against the page container instead of the viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-6 sm:items-center [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))]">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-up"
        onClick={() => onOpenChange?.(false)}
        data-testid="dialog-overlay"
      />
      {children}
    </div>,
    document.body
  );
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DialogContent = React.forwardRef<any, any>(
  ({ className, children, onClose, ...props }, forwardedRef) => {
    const localRef = React.useRef<any>(null);

    // Merge our internal ref with any ref the caller forwards.
    const setRefs = React.useCallback(
      (node) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );

    // Focus management: move focus into the dialog on open, keep Tab inside it
    // (it is a modal), and restore focus to the element that opened it on
    // close. DialogContent only mounts while the dialog is open.
    React.useEffect(() => {
      const node = localRef.current;
      if (!node) return;
      const previouslyFocused: any = document.activeElement;

      const focusable = () =>
        Array.from(node.querySelectorAll<any>(FOCUSABLE_SELECTOR)).filter(
          (el) => el.offsetParent !== null
        );

      // Prefer the first form field; otherwise focus the panel itself so screen
      // readers announce the dialog without stealing focus onto the X button.
      // Respect an explicit autoFocus already inside the dialog.
      if (!node.contains(document.activeElement)) {
        const firstField = node.querySelector<any>(
          "input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
        );
        (firstField || node).focus?.();
      }

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;
        const items = focusable();
        if (items.length === 0) {
          e.preventDefault();
          node.focus?.();
          return;
        }
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === firstEl || active === node)) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      };
      node.addEventListener("keydown", onKeyDown);
      return () => {
        node.removeEventListener("keydown", onKeyDown);
        previouslyFocused?.focus?.();
      };
    }, []);

    return (
      <div
        ref={setRefs}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "relative z-10 my-auto max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl animate-fade-up outline-none sm:p-6",
          className
        )}
        {...props}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            data-testid="dialog-close"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {children}
      </div>
    );
  }
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: any) => (
  <div className={cn("mb-4 flex flex-col space-y-1.5", className)} {...props} />
);

const DialogTitle = ({ className, ...props }: any) => (
  <h2
    className={cn("font-display text-base font-semibold tracking-tight", className)}
    {...props}
  />
);

const DialogDescription = ({ className, ...props }: any) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

const DialogFooter = ({ className, ...props }: any) => (
  <div
    className={cn("mt-6 flex justify-end gap-2", className)}
    {...props}
  />
);

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
