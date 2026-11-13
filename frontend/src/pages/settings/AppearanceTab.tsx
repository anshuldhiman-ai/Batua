import { Moon, Sun, Palette, Check } from "lucide-react";
import { ACCENTS, CUSTOM_ACCENT } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SUPPORTED_CURRENCIES } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, PanelContent } from "./primitives";

/* ── Appearance tab ───────────────────────────────────────────── */

export default function AppearanceTab({
  theme,
  toggle,
  accent,
  setAccent,
  customColor,
  setCustomColor,
  customActive,
  currentCurrency,
  onCurrencyChange,
}: any) {
  return (
    <Panel>
      <PanelHeader
        icon={Palette}
        title="Theme & Internationalization"
        desc="Light/dark mode, accent color styling, and base currency localization."
      />
      <PanelContent className="space-y-6">
        {/* Mode — two selectable cards, premium segmented choice */}
        <div>
          <div className="mb-1 text-sm font-medium">Mode</div>
          <div className="mb-3 text-xs text-muted-foreground">Switch between light and dark mode</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { id: "light", icon: Sun, label: "Light", desc: "Bright and airy" },
              { id: "dark", icon: Moon, label: "Dark", desc: "Deep and focused" },
            ].map((m) => {
              const active = theme === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { if (!active) toggle(); }}
                  aria-pressed={active}
                  data-testid={`settings-theme-${m.id}`}
                  data-settings-theme-toggle=""
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-200",
                    active
                      ? "border-primary/40 bg-primary/5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                      : "border-border/60 hover:border-border hover:bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.desc}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset transition-all",
                      active
                        ? "bg-primary text-primary-foreground ring-primary"
                        : "ring-border text-transparent"
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent color */}
        <div className="border-t border-border/50 pt-6">
          <div className="mb-1 text-sm font-medium">Accent color</div>
          <div className="mb-3 text-xs text-muted-foreground">Choose the overall color theme of the app</div>
          <div className="flex flex-wrap items-center gap-3" data-testid="accent-picker">
            {ACCENTS.map((a) => {
              const active = a.id === accent;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccent(a.id)}
                  title={a.label ?? a.id}
                  aria-label={a.label ?? a.id}
                  aria-pressed={active}
                  data-testid={`accent-${a.id}`}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 hover:scale-110",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active && "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  )}
                  style={{ backgroundColor: `hsl(${a.swatch})` }}
                >
                  {active && <Check className="h-4 w-4 text-white drop-shadow" />}
                </button>
              );
            })}

            {/* Custom "any color" picker */}
            <label
              title="Custom color"
              aria-label="Custom color"
              data-testid="accent-custom"
              className={cn(
                "relative h-9 w-9 cursor-pointer overflow-hidden rounded-full transition-transform hover:scale-110 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                customActive && "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
              style={
                customActive
                  ? { backgroundColor: customColor }
                  : { background: "conic-gradient(red, orange, yellow, lime, aqua, blue, magenta, red)" }
              }
            >
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setAccent(CUSTOM_ACCENT);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        {/* Live preview — repaints instantly when an accent is picked,
            so the choice is felt on this page, not just elsewhere. */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">Primary button</Button>
            <Badge>Badge</Badge>
            <svg width="120" height="28" viewBox="0 0 120 28" aria-hidden="true">
              <polyline
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points="2,22 22,16 42,19 62,9 82,13 102,4 118,8"
              />
              <circle cx="118" cy="8" r="3" fill="hsl(var(--primary))" />
            </svg>
            <span className="text-sm font-medium text-primary">Accent text</span>
          </div>
        </div>

        {/* Base Currency */}
        <div className="border-t border-border/50 pt-6">
          <div className="mb-1 text-sm font-medium">Base Currency</div>
          <div className="mb-3 text-xs text-muted-foreground">Select your primary currency format and locale for all transactions and statements.</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5" data-testid="currency-picker">
            {SUPPORTED_CURRENCIES.map((c) => {
              const active = currentCurrency?.code === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => onCurrencyChange?.(c.code)}
                  aria-pressed={active}
                  data-testid={`currency-select-${c.code}`}
                  className={cn(
                    "group flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-200",
                    active
                      ? "border-primary/50 bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)] text-primary font-medium ring-1 ring-primary/30"
                      : "border-border/60 hover:border-border hover:bg-muted/40 text-foreground"
                  )}
                >
                  <span className="text-xl" role="img" aria-label={c.label}>{c.flag}</span>
                  <span className="text-sm font-bold tracking-tight">{c.symbol} {c.code}</span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-full">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}
