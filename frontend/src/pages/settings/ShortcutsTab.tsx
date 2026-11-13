import React from "react";
import { Palette, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelContent } from "./primitives";

/* ── Shortcuts tab ────────────────────────────────────────────── */

export default function ShortcutsTab() {
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? "⌘" : "Ctrl";

  const navigationShortcuts = [
    { keys: ["G", "D"], description: "Go to Dashboard" },
    { keys: ["G", "T"], description: "Go to Transactions ledger" },
    { keys: ["G", "A"], description: "Go to Analytics & breakdowns" },
    { keys: ["G", "B"], description: "Go to Budgets tracking" },
    { keys: ["G", "O"], description: "Go to Goals & savings" },
    { keys: ["G", "P"], description: "Go to People ledger" },
    { keys: ["G", "S"], description: "Go to Settings" },
  ];

  const actionShortcuts = [
    { keys: [modKey, "K"], description: "Open Universal Command Palette (Search & Commands)" },
    { keys: ["N"], description: "New Transaction entry" },
    { keys: ["T"], description: "Toggle Dark / Light Mode" },
    { keys: ["?"], description: "Open Interactive User Guide & Help modal" },
    { keys: ["Esc"], description: "Close any active modal, dialog, or drawer" },
  ];

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          icon={Keyboard}
          title="Productivity Shortcuts"
          desc="Fly through Batua without lifting your fingers from the keyboard."
          right={
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("command-palette:open"))}
              className="gap-1.5"
            >
              <span>Test Palette</span>
              <kbd className="rounded border border-border/70 bg-muted/60 px-1 py-0.5 font-mono text-[10px]">
                {modKey}+K
              </kbd>
            </Button>
          }
        />
        <PanelContent className="space-y-6">
          {/* Quick Actions */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Global Quick Actions
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {actionShortcuts.map((item) => (
                <div
                  key={item.description}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-xs"
                >
                  <span className="font-medium text-foreground">{item.description}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {item.keys.map((k, i) => (
                      <React.Fragment key={k}>
                        {i > 0 && <span className="text-muted-foreground/60">+</span>}
                        <kbd className="inline-flex min-w-5 items-center justify-center rounded-md border border-border/80 bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-sm">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Navigation */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Navigation Jump Sequences (Press sequentially)
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {navigationShortcuts.map((item) => (
                <div
                  key={item.description}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-xs"
                >
                  <span className="font-medium text-foreground">{item.description}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {item.keys.map((k, i) => (
                      <React.Fragment key={k}>
                        {i > 0 && <span className="text-muted-foreground/60 font-sans text-[10px]">then</span>}
                        <kbd className="inline-flex min-w-5 items-center justify-center rounded-md border border-border/80 bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-sm">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs text-muted-foreground flex items-center justify-between">
            <span>
              💡 Pressing <kbd className="rounded border border-primary/30 bg-primary/10 px-1 font-mono text-primary font-semibold">?</kbd> at any time opens the comprehensive User Guide with interactive walkthroughs.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("shortcut:show-help"))}
              className="text-xs text-primary hover:text-primary"
            >
              Open Guide
            </Button>
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
