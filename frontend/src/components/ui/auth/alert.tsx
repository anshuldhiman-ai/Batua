import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Server / network error banner. Rendered at the top of the
 * form, `aria-live` so screen readers announce it the moment
 * it appears. `variant="warning"` carries the rate-limit /
 * lockout message with its countdown.
 */

interface AuthAlertProps {
  children: React.ReactNode;
  variant?: "error" | "warning";
  className?: string;
}

export function AuthAlert({
  children,
  variant = "error",
  className,
}: AuthAlertProps) {
  const isError = variant === "error";
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
        isError
          ? "border-[color:var(--auth-error)]/40 bg-[color:var(--auth-error)]/10 text-[color:var(--auth-error)]"
          : "border-[color:var(--auth-warning)]/40 bg-[color:var(--auth-warning)]/10 text-[color:var(--auth-warning)]",
        className
      )}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="min-w-0 leading-relaxed">{children}</span>
    </div>
  );
}
