import React from "react";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<any, any>(
  ({ className, value = 0, indicatorClassName, indicatorStyle, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-all", indicatorClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, ...indicatorStyle }}
      />
    </div>
  )
);
Progress.displayName = "Progress";

export { Progress };
