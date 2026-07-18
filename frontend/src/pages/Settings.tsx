import React from "react";
import {
  Moon,
  Sun,
  IndianRupee,
  AlertTriangle,
  Trash2,
  Database,
  Download,
  UploadCloud,
  Sparkles,
  Bot,
  Palette,
  Plus,
  Edit,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ThemeContext } from "@/App";
import PageHeader from "@/components/PageHeader";
import MicTest from "@/components/MicTest";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ACCENTS, CUSTOM_ACCENT } from "@/lib/themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

// How the AI Insights chat answers questions. Read by QAChatWidget.
const QA_MODES = [
  {
    id: "hybrid",
    label: "Mixed (recommended)",
    desc: "Pattern rules compute the exact numbers, the local model rewords the reply so it sounds natural.",
  },
  {
    id: "llama",
    label: "Llama — local AI",
    desc: "The local model answers directly from a digest of your data. Needs Ollama running; falls back to rules when it isn't.",
  },
  {
    id: "rules",
    label: "Quick rules",
    desc: "Instant template answers from pattern matching only. No AI involved.",
  },
];

export default function Settings() {
  const { theme, toggle, accent, setAccent, customColor, setCustomColor } =
    React.useContext(ThemeContext);
  const customActive = accent === CUSTOM_ACCENT;
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [health, setHealth] = React.useState(null);
  const [qaMode, setQaMode] = useLocalStorage("batua-qa-mode", "hybrid");
  const [chatSessionId] = useLocalStorage("batua-chat-session-id", null);
  
  // Custom categories state
  const [categories, setCategories] = React.useState([]);
  const [customCategories, setCustomCategories] = React.useState([]);
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [editingCategory, setEditingCategory] = React.useState(null);
  const [deleteCategoryOpen, setDeleteCategoryOpen] = React.useState(false);
  const [categoryToDelete, setCategoryToDelete] = React.useState(null);
  const [reassignTo, setReassignTo] = React.useState("");

  React.useEffect(() => {
    api.get("/").then((r) => setHealth(r.data)).catch(() => {});
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const { data } = await api.get("/categories/");
      setCategories(data.categories || []);
      setCustomCategories(data.custom || []);
    } catch (e) {
      console.error("Failed to load categories", e);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await api.post("/categories/add", { name: newCategoryName.trim() });
      toast.success(`Category "${newCategoryName}" added`);
      setNewCategoryName("");
      loadCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add category");
    }
  };

  const startEditCategory = (cat) => {
    setEditingCategory({ ...cat });
  };

  const saveCategoryRename = async () => {
    if (!editingCategory || !editingCategory.newName?.trim()) return;
    try {
      await api.post("/categories/rename", {
        old_name: editingCategory.name,
        new_name: editingCategory.newName.trim()
      });
      toast.success(`Category renamed to "${editingCategory.newName}"`);
      setEditingCategory(null);
      loadCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to rename category");
    }
  };

  const startDeleteCategory = (cat) => {
    setCategoryToDelete(cat);
    setReassignTo("Other");
    setDeleteCategoryOpen(true);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete || !reassignTo) return;
    try {
      await api.post("/categories/delete", {
        name: categoryToDelete.name,
        reassign_to: reassignTo
      });
      toast.success(`Category "${categoryToDelete.name}" deleted and reassigned`);
      setDeleteCategoryOpen(false);
      setCategoryToDelete(null);
      loadCategories();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete category");
    }
  };

  const clearAll = async () => {
    await api.delete("/transactions/");
    setConfirmOpen(false);
    setConfirmText("");
    toast.success("All transactions cleared");
  };

  const [restoring, setRestoring] = React.useState(false);
  const restoreInputRef = React.useRef(null);

  const downloadBackup = async () => {
    try {
      const { data } = await api.get("/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batua-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Backup downloaded — ${data.transactions?.length ?? 0} transactions, ${data.budgets?.length ?? 0} budgets`
      );
    } catch {
      toast.error("Could not create backup");
    }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.app !== "batua" || (!parsed.transactions && !parsed.budgets)) {
        throw new Error("Not a Batua backup file");
      }
      const ok = window.confirm(
        `Restore ${parsed.transactions?.length ?? 0} transactions and ${parsed.budgets?.length ?? 0} budgets? ` +
          "This REPLACES all current data."
      );
      if (!ok) return;
      const { data } = await api.post("/restore", parsed);
      toast.success(
        `Restored ${data.transactions} transactions and ${data.budgets} budgets` +
          (data.skipped ? ` · skipped ${data.skipped} invalid rows` : "")
      );
      // Every page caches derived data — a clean reload is the honest way
      // to make the whole app reflect the restored dataset.
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Restore failed");
    } finally {
      setRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  const clearChatMemory = async () => {
    if (chatSessionId) {
      try {
        await api.delete(`/ml/chat/${chatSessionId}`);
      } catch {
        // Best-effort — the assistant widget re-hydrates from the backend
        // next time it opens, so an unreachable backend just means the
        // stale history reloads once more.
      }
    }
    toast.success("Conversation memory cleared");
  };

  return (
    <div className="page-enter max-w-4xl space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Appearance, preferences and data management"
      />

      {/* Tabbed layout — one concern per pane, so no wall of cards. */}
      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance" data-testid="settings-tab-appearance">
            <Palette className="mr-1.5 h-3.5 w-3.5" /> Appearance
          </TabsTrigger>
          <TabsTrigger value="ai" data-testid="settings-tab-ai">
            <Bot className="mr-1.5 h-3.5 w-3.5" /> AI & Voice
          </TabsTrigger>
          <TabsTrigger value="data" data-testid="settings-tab-data">
            <Database className="mr-1.5 h-3.5 w-3.5" /> Data
          </TabsTrigger>
        </TabsList>

        {/* ---------- Appearance ---------- */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Theme</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Mode</div>
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

              {/* Live preview — repaints instantly when an accent is picked,
                  so the choice is felt on this page, not just elsewhere. */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- AI & Voice ---------- */}
        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Insights mode</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                How the AI Insights chat answers your questions.
              </p>
              <div className="grid gap-2">
                {QA_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setQaMode(mode.id)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                      qaMode === mode.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    )}
                    data-testid={`qa-mode-${mode.id}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium text-sm">{mode.label}</span>
                      {qaMode === mode.id && (
                        <Badge variant="default" className="text-xs">Active</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{mode.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <MicTest />
        </TabsContent>

        {/* ---------- Data ---------- */}
        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>System</CardTitle></CardHeader>
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

          <Card>
            <CardHeader><CardTitle>Backup &amp; Restore</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Download full backup</div>
                  <div className="text-sm text-muted-foreground">
                    One JSON file with every transaction and budget — keep it anywhere, restore it on any machine.
                  </div>
                </div>
                <Button variant="outline" onClick={downloadBackup} data-testid="backup-download-btn">
                  <Download className="h-4 w-4" /> Backup
                </Button>
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <div>
                  <div className="font-medium">Restore from backup</div>
                  <div className="text-sm text-muted-foreground">
                    Load a previously downloaded backup file. Replaces all current data.
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={restoring}
                  onClick={() => restoreInputRef.current?.click()}
                  data-testid="backup-restore-btn"
                >
                  <UploadCloud className="h-4 w-4" /> {restoring ? "Restoring…" : "Restore"}
                </Button>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => restoreBackup(e.target.files?.[0])}
                  data-testid="backup-restore-input"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Custom Categories</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addCategory()}
                  data-testid="new-category-input"
                />
                <Button onClick={addCategory} data-testid="add-category-btn">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              
              <div className="space-y-2">
                {customCategories.map((cat) => (
                  <div key={cat} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                    {editingCategory?.name === cat ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          defaultValue={cat}
                          onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                          onKeyPress={(e) => e.key === "Enter" && saveCategoryRename()}
                          data-testid={`edit-category-input-${cat}`}
                        />
                        <Button size="sm" onClick={saveCategoryRename}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium">{cat}</span>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEditCategory(cat)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => startDeleteCategory(cat)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {customCategories.length === 0 && (
                  <p className="text-sm text-muted-foreground">No custom categories yet. Add one above.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-rose-500/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-500">
                <AlertTriangle className="h-4 w-4" /> Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Clear all transactions</div>
                  <div className="text-sm text-muted-foreground">Permanently deletes every transaction. Cannot be undone.</div>
                </div>
                <Button variant="destructive" onClick={() => setConfirmOpen(true)} data-testid="clear-all-btn">
                  <Trash2 className="h-4 w-4" /> Clear all
                </Button>
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <div>
                  <div className="font-medium">Clear conversation memory</div>
                  <div className="text-sm text-muted-foreground">Resets the finance assistant's chat history and follow-up context.</div>
                </div>
                <Button variant="outline" onClick={clearChatMemory} data-testid="clear-chat-memory-btn">
                  <Trash2 className="h-4 w-4" /> Clear chat
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setConfirmText(""); }}>
        <DialogContent onClose={() => { setConfirmOpen(false); setConfirmText(""); }}>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This will permanently delete all your transactions. This action cannot be undone.
              Type <strong>DELETE</strong> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            data-testid="confirm-clear-input"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={clearAll}
              disabled={confirmText.trim().toUpperCase() !== "DELETE"}
              data-testid="confirm-clear-btn"
            >
              Yes, delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteCategoryOpen} onOpenChange={setDeleteCategoryOpen}>
        <DialogContent onClose={() => { setDeleteCategoryOpen(false); setCategoryToDelete(null); }}>
          <DialogHeader>
            <DialogTitle>Delete category "{categoryToDelete?.name}"?</DialogTitle>
            <DialogDescription>
              Choose a category to reassign existing transactions to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reassign to:</label>
            <select
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              className="w-full h-10 rounded-lg border border-input bg-background px-3"
              data-testid="reassign-category-select"
            >
              {categories.filter(c => c !== categoryToDelete?.name).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteCategoryOpen(false); setCategoryToDelete(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteCategory} data-testid="confirm-delete-category-btn">
              Delete & Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ icon: Icon, label, value, badge }: any) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <span className="flex items-center gap-2.5 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" /> {label}
      </span>
      {badge ? <Badge variant={badge}>{value}</Badge> : <span className="text-sm text-muted-foreground">{value}</span>}
    </div>
  );
}
