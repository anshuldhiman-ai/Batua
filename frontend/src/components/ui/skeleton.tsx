import React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
