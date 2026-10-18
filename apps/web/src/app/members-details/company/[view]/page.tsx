"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  computeDisplayStatus,
  recurringScheduleDisplayStatus,
  type RecurringSchedule,
  type Task,
} from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { TaskTable } from "@/components/task-table";
import { Alert, Button, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const STATUS_LABELS: Record<string, { assigned: string; delegated: string }> = {
  pending: { assigned: "Pending", delegated: "Pending" },
  overdue: { assigned: "Overdue", delegated: "Overdue" },
  sent_for_approval: {
    assigned: "Sent for Approval",
    delegated: "Received for Approval",
  },
  completed: { assigned: "Completed", delegated: "Completed" },
};

function CompanyBoxTasksInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ view: string }>();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "pending";

  const view =
    params.view === "delegated"
      ? "delegated"
      : params.view === "assigned"
        ? "assigned"
        : null;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [error, setError] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && user && user.role !== "admin") router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (!view) {
      router.replace("/members-details");
      return;
    }
    if (user?.role !== "admin") return;

    setLoadingData(true);
    setError("");
    Promise.all([
      api.listTasks({ view: "all", status: "all", page: 1, pageSize: 500 }),
      api.listRecurring(),
    ])
      .then(([tasksRes, schedulesRes]) => {
        setTasks(
          tasksRes.data.map((t) => ({
            ...t,
            display_status: computeDisplayStatus(t.lifecycle, t.deadline),
          }))
        );
        setSchedules(schedulesRes.data);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load tasks")
      )
      .finally(() => setLoadingData(false));
  }, [user, view, router]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (task.lifecycle === "cancelled") return false;
      const display =
        task.display_status ?? computeDisplayStatus(task.lifecycle, task.deadline);
      if (status === "pending") {
        return display === "pending" || display === "overdue";
      }
      return display === status;
    });
  }, [tasks, status]);

  const filteredSchedules = useMemo(() => {
    if (status === "sent_for_approval" || status === "completed") return [];
    return schedules.filter((schedule) => {
      if (!schedule.is_active) return false;
      if (schedule.is_paused && schedule.current_occurrence_completed) return false;
      const display = recurringScheduleDisplayStatus(schedule);
      if (status === "pending") {
        return display === "pending" || display === "overdue";
      }
      if (status === "overdue") return display === "overdue";
      return false;
    });
  }, [schedules, status]);

  if (!user || user.role !== "admin" || !view) return null;

  const statusLabel =
    STATUS_LABELS[status]?.[view === "assigned" ? "assigned" : "delegated"] ||
    status;
  const viewTitle =
    view === "assigned" ? "Total Assigned Tasks" : "Total Delegated Tasks";

  return (
    <AppShell>
      <div className="mb-6">
        <Button
          variant="ghost"
          className="-ml-2 mb-2 px-2"
          onClick={() => router.push("/members-details")}
        >
          ← Back to Members Details
        </Button>
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Rajshree Energy
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {viewTitle} · {statusLabel}
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loadingData ? (
        <p className="text-sm text-ink-500">Loading tasks…</p>
      ) : filteredTasks.length === 0 && filteredSchedules.length === 0 ? (
        <EmptyState
          title={`No ${statusLabel.toLowerCase()} tasks`}
          description={`There are no company-wide ${viewTitle.toLowerCase()} in this status.`}
        />
      ) : (
        <TaskTable
          tasks={filteredTasks}
          schedules={filteredSchedules}
          variant={view === "assigned" ? "assigned" : "delegated"}
        />
      )}
    </AppShell>
  );
}

export default function CompanyBoxTasksPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-500">Loading…</div>}>
      <CompanyBoxTasksInner />
    </Suspense>
  );
}
