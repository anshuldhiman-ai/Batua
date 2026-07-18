import React from "react";
import { Plus, Target, TrendingUp, Calendar, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/utils-finance";
import { formatINR, formatDate } from "@/lib/utils-finance";

export default function Goals() {
  const [goals, setGoals] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingGoal, setEditingGoal] = React.useState(null);
  const [form, setForm] = React.useState({
    name: "",
    target_amount: "",
    target_date: "",
    current_amount: "",
  });

  React.useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    try {
      // For now, goals are stored in localStorage since backend endpoint is mock
      const stored = localStorage.getItem("batua-goals");
      if (stored) {
        setGoals(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load goals", e);
    } finally {
      setLoading(false);
    }
  };

  const saveGoals = (updatedGoals) => {
    setGoals(updatedGoals);
    localStorage.setItem("batua-goals", JSON.stringify(updatedGoals));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.target_amount || !form.target_date) {
      toast.error("Please fill in all required fields");
      return;
    }

    const goalData = {
      id: editingGoal?.id || `goal-${Date.now()}`,
      name: form.name,
      target_amount: parseFloat(form.target_amount),
      target_date: form.target_date,
      current_amount: parseFloat(form.current_amount) || 0,
      created_at: editingGoal?.created_at || new Date().toISOString(),
    };

    let updatedGoals;
    if (editingGoal) {
      updatedGoals = goals.map((g) => (g.id === editingGoal.id ? goalData : g));
      toast.success("Goal updated");
    } else {
      updatedGoals = [...goals, goalData];
      toast.success("Goal created");
    }

    saveGoals(updatedGoals);
    setDialogOpen(false);
    setEditingGoal(null);
    setForm({ name: "", target_amount: "", target_date: "", current_amount: "" });
  };

  const startEdit = (goal) => {
    setEditingGoal(goal);
    setForm({
      name: goal.name,
      target_amount: goal.target_amount.toString(),
      target_date: goal.target_date,
      current_amount: goal.current_amount.toString(),
    });
    setDialogOpen(true);
  };

  const deleteGoal = (id) => {
    const updatedGoals = goals.filter((g) => g.id !== id);
    saveGoals(updatedGoals);
    toast.success("Goal deleted");
  };

  const calculateProgress = (goal) => {
    const progress = (goal.current_amount / goal.target_amount) * 100;
    return Math.min(100, Math.max(0, progress));
  };

  const calculateDaysRemaining = (targetDate) => {
    const target = new Date(targetDate);
    const today = new Date();
    const diff = target - today;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  const calculateRequiredMonthly = (goal) => {
    const days = calculateDaysRemaining(goal.target_date);
    const remaining = goal.target_amount - goal.current_amount;
    if (days <= 0) return 0;
    const months = Math.max(1, Math.ceil(days / 30));
    return remaining / months;
  };

  if (loading) {
    return (
      <div className="page-enter">
        <PageHeader title="Savings Goals" subtitle="Track your financial targets" />
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading goals...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title="Savings Goals"
        subtitle="Track your financial targets and stay motivated"
        actions={
          <Button onClick={() => setDialogOpen(true)} data-testid="add-goal-btn">
            <Plus className="h-4 w-4 mr-2" /> Add Goal
          </Button>
        }
      />

      {goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No savings goals yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first savings goal to start tracking your progress
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((goal) => {
            const progress = calculateProgress(goal);
            const daysRemaining = calculateDaysRemaining(goal.target_date);
            const requiredMonthly = calculateRequiredMonthly(goal);

            return (
              <Card key={goal.id} data-testid={`goal-card-${goal.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{goal.name}</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(goal)}
                        data-testid={`edit-goal-${goal.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteGoal(goal.id)}
                        data-testid={`delete-goal-${goal.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatINR(goal.current_amount)}</span>
                      <span>{formatINR(goal.target_amount)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Target Date
                      </span>
                      <span className="font-medium">{formatDate(goal.target_date)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Days Remaining</span>
                      <Badge variant={daysRemaining < 30 ? "destructive" : "secondary"}>
                        {daysRemaining} days
                      </Badge>
                    </div>
                    {requiredMonthly > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Required Monthly
                        </span>
                        <span className="font-medium">{formatINR(requiredMonthly)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => { setDialogOpen(false); setEditingGoal(null); setForm({ name: "", target_amount: "", target_date: "", current_amount: "" }); }}>
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Edit Goal" : "Create Savings Goal"}</DialogTitle>
            <DialogDescription>
              Set a target amount and deadline to track your savings progress
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Goal Name</label>
              <Input
                placeholder="e.g., Emergency Fund, Vacation"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="goal-name-input"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Amount (₹)</label>
              <Input
                type="number"
                placeholder="50000"
                value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                data-testid="goal-amount-input"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Amount (₹)</label>
              <Input
                type="number"
                placeholder="0"
                value={form.current_amount}
                onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
                data-testid="goal-current-input"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Date</label>
              <Input
                type="date"
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                data-testid="goal-date-input"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setDialogOpen(false); setEditingGoal(null); setForm({ name: "", target_amount: "", target_date: "", current_amount: "" }); }}
              >
                Cancel
              </Button>
              <Button type="submit" data-testid="save-goal-btn">
                {editingGoal ? "Update" : "Create"} Goal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
