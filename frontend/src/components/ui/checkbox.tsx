import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<any, any>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary border-primary text-primary-foreground" : "bg-background",
        className
      )}
      {...props}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
