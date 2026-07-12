import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Dialog({ open, onOpenChange, children }) {
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

const DialogContent = React.forwardRef(
  ({ className, children, onClose, ...props }, ref) => (
    <div
      ref={ref}
      role="dialog"
      className={cn(
        "relative z-10 my-auto max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl animate-fade-up sm:p-6",
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
  )
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("mb-4 flex flex-col space-y-1.5", className)} {...props} />
);

const DialogTitle = ({ className, ...props }) => (
  <h2
    className={cn("font-display text-base font-semibold tracking-tight", className)}
    {...props}
  />
);

const DialogDescription = ({ className, ...props }) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

const DialogFooter = ({ className, ...props }) => (
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
