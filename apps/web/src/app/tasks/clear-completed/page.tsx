"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Hourglass } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const STATS = [
  {
    key: "completed",
    label: "Completed tasks",
    hint: "Will be cleared",
    icon: CheckCircle2,
    value: "text-emerald-800",
    iconWrap: "bg-emerald-100 text-emerald-700",
    card: "border-emerald-200 bg-gradient-to-b from-emerald-50 to-white",
  },
  {
    key: "cancelled",
    label: "Cancelled tasks",
    hint: "Will be cleared",
    icon: Ban,
    value: "text-ink-800",
    iconWrap: "bg-ink-100 text-ink-600",
    card: "border-ink-200 bg-gradient-to-b from-ink-50 to-white",
  },
  {
    key: "pendingApproval",
    label: "Approval pending",
    hint: "Will stay",
    icon: Hourglass,
    value: "text-sky-800",
    iconWrap: "bg-sky-100 text-sky-700",
    card: "border-sky-200 bg-gradient-to-b from-sky-50 to-white",
  },
] as const;

export default function ClearCompletedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [completed, setCompleted] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(0);
  const [pendingApproval, setPendingApproval] = useState(0);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<{ completed: number; cancelled: number } | null>(null);

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api
      .completedTaskCount()
      .then((res) => {
        setCompleted(res.completed);
        setCancelled(res.cancelled);
        setPendingApproval(res.pendingApproval);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load tasks")
      );
  }, [user]);

  if (!user || user.role !== "admin") return null;

  const ready = completed !== null;
  const clearable = (completed ?? 0) + cancelled;
  const counts = { completed: completed ?? 0, cancelled, pendingApproval };

  async function clearCompleted() {
    setError("");
    setClearing(true);
    try {
      const res = await api.clearCompletedTasks();
      setResult({ completed: res.completed, cancelled: res.cancelled });
      setCompleted(0);
      setCancelled(0);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to clear tasks");
    } finally {
      setClearing(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">Clear Finished Tasks</h1>
          <p className="mt-1 text-sm text-ink-500">
            Remove completed and cancelled tasks for every team member and admin.
          </p>
        </div>

        {error ? <Alert>{error}</Alert> : null}
        {result ? (
          <Alert variant="success">
            Cleared {result.completed} completed and {result.cancelled} cancelled{" "}
            {result.completed + result.cancelled === 1 ? "task" : "tasks"}. Approval pending tasks
            were left in place.
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.key} className={cn("p-5", stat.card)}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink-700">{stat.label}</p>
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full",
                      stat.iconWrap
                    )}
                  >
                    <Icon size={18} />
                  </span>
                </div>
                <p className={cn("mt-4 font-display text-4xl font-semibold tabular-nums", stat.value)}>
                  {ready ? counts[stat.key] : "—"}
                </p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-500">
                  {stat.hint}
                </p>
              </Card>
            );
          })}
        </div>

        <Card className="space-y-4 p-6">
          <p className="text-sm text-ink-700">
            Completed and cancelled tasks are removed for the whole company. A task that is
            finished but still waiting for approval stays until the approver decides.
          </p>

          {confirming ? (
            <div className="space-y-4 rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-900">
                This permanently deletes {completed} completed and {cancelled} cancelled tasks.
                {pendingApproval > 0
                  ? ` ${pendingApproval} approval pending ${pendingApproval === 1 ? "task stays" : "tasks stay"}.`
                  : " Approval pending tasks stay."}{" "}
                This cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" disabled={clearing} onClick={clearCompleted}>
                  {clearing ? "Clearing…" : "Yes, clear them"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={clearing}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="danger"
              disabled={!ready || clearable === 0}
              onClick={() => {
                setResult(null);
                setConfirming(true);
              }}
            >
              {clearable === 0 ? "Nothing to clear" : "Clear finished tasks"}
            </Button>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
