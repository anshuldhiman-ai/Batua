import React from "react";
import { Moon, Sun, IndianRupee, AlertTriangle, Trash2, Database, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ThemeContext } from "@/App";
import { ACCENTS, CUSTOM_ACCENT } from "@/lib/themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/utils-finance";

export default function Settings() {
  const { theme, toggle, accent, setAccent, customColor, setCustomColor } =
    React.useContext(ThemeContext);
  const customActive = accent === CUSTOM_ACCENT;
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [health, setHealth] = React.useState(null);

  React.useEffect(() => {
    api.get("/").then((r) => setHealth(r.data)).catch(() => {});
  }, []);

  const clearAll = async () => {
    await api.delete("/transactions/");
    setConfirmOpen(false);
    toast.success("All transactions cleared");
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
        Settings
      </h1>

      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Theme</div>
              <div className="text-sm text-muted-foreground">Switch between light and dark mode</div>
            </div>
            <Button variant="outline" onClick={toggle} data-testid="settings-theme-toggle">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-5">
            <div>
              <div className="font-medium">Accent color</div>
              <div className="text-sm text-muted-foreground">Choose the overall color theme of the app</div>
            </div>
            <div className="flex items-center gap-2" data-testid="accent-picker">
              {ACCENTS.map((a) => {
                const active = a.id === accent;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccent(a.id)}
                    title={a.label}
                    aria-label={a.label}
                    aria-pressed={active}
                    data-testid={`accent-${a.id}`}
                    className={
                      "h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                      (active ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "")
                    }
                    style={{ backgroundColor: `hsl(${a.swatch})` }}
                  />
                );
              })}

              {/* Custom "any color" picker */}
              <label
                title="Custom color"
                aria-label="Custom color"
                data-testid="accent-custom"
                className={
                  "relative h-7 w-7 cursor-pointer overflow-hidden rounded-full transition-transform hover:scale-110 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background " +
                  (customActive ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "")
                }
                style={
                  customActive
                    ? { backgroundColor: customColor }
                    : {
                        background:
                          "conic-gradient(red, orange, yellow, lime, aqua, blue, magenta, red)",
                      }
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Row icon={IndianRupee} label="Currency" value="Indian Rupee (₹) — INR" />
          <Row icon={Database} label="Storage backend" value={
            health?.storage === "json-file"
              ? "Local JSON file (persists between restarts)"
              : health?.storage === "sqlite"
              ? "Local SQLite database (persists between restarts)"
              : health?.storage === "mongodb"
              ? "MongoDB database"
              : (health?.storage || "…")
          } />
          <Row
            icon={Sparkles}
            label="AI insights (Gemini)"
            value={health ? (health.ai ? "Connected" : "Rule-based fallback") : "…"}
            badge={health ? (health.ai ? "success" : "secondary") : undefined}
          />
        </CardContent>
      </Card>

      <Card className="border-rose-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-500">
            <AlertTriangle className="h-4 w-4" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <div className="font-medium">Clear all transactions</div>
            <div className="text-sm text-muted-foreground">Permanently deletes every transaction. Cannot be undone.</div>
          </div>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} data-testid="clear-all-btn">
            <Trash2 className="h-4 w-4" /> Clear all
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onClose={() => setConfirmOpen(false)}>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete all your transactions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={clearAll} data-testid="confirm-clear-btn">
              Yes, delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ icon: Icon, label, value, badge }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <span className="flex items-center gap-2.5 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" /> {label}
      </span>
      {badge ? <Badge variant={badge}>{value}</Badge> : <span className="text-sm text-muted-foreground">{value}</span>}
    </div>
  );
}
