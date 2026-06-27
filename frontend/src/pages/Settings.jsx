import React from "react";
import { Moon, Sun, IndianRupee, AlertTriangle, Trash2, Database, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ThemeContext } from "@/App";
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
  const { theme, toggle } = React.useContext(ThemeContext);
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
      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <div className="font-medium">Theme</div>
            <div className="text-sm text-muted-foreground">Switch between light and dark mode</div>
          </div>
          <Button variant="outline" onClick={toggle} data-testid="settings-theme-toggle">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Button>
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
