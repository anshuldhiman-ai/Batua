import React from "react";
import { cn } from "@/lib/utils";

/* Card with a cursor-tracking glow (.glow-card in index.css). Pointer position
   is written to --glow-x/--glow-y on the element itself — no re-renders, the
   ::before pseudo-element does the painting. Opt out with glow={false}. */
const Card = React.forwardRef<any, any>(({ className, glow = true, onPointerMove, ...props }, ref) => {
  const handlePointerMove = React.useCallback(
    (e) => {
      if (e.pointerType === "mouse") {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--glow-x", `${e.clientX - rect.left}px`);
        e.currentTarget.style.setProperty("--glow-y", `${e.clientY - rect.top}px`);
      }
      onPointerMove?.(e);
    },
    [onPointerMove]
  );

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        glow && "glow-card",
        className
      )}
      onPointerMove={glow ? handlePointerMove : onPointerMove}
      {...props}
    />
  );
});
Card.displayName = "Card";

/* Uniform paddings: header p-4 pb-2, content p-4 pt-0 — the rhythm used app-wide. */
const CardHeader = React.forwardRef<any, any>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1 p-4 pb-2", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<any, any>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-display text-sm font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<any, any>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-xs text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<any, any>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<any, any>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
