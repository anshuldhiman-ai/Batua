import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { Button } from "./button";

/**
 * Shared "are you sure?" confirmation for destructive actions.
 *
 * Destructive operations should never fire straight off a single tap/click.
 * This wraps the same Dialog primitives that People/Goals already use, so every
 * delete flow reads and behaves the same way.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Are you sure?",
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  busy = false,
  onConfirm,
  testId = "confirm-dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  testId?: string;
}) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent onClose={close} className="max-w-md" data-testid={testId}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            {destructive && (
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500"
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
          {description && (
            <DialogDescription className={cn(destructive && "pl-12")}>
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy} data-testid={`${testId}-cancel`}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
            data-testid={`${testId}-confirm`}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
