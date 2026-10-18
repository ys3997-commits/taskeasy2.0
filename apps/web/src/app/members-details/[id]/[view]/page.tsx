"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  computeDisplayStatus,
  recurringScheduleDisplayStatus,
  type MemberDetailsSummary,
  type RecurringSchedule,
  type Task,
} from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { TaskTable } from "@/components/task-table";
import { Alert, Button, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

const STATUS_LABELS: Record<string, { assigned: string; delegated: string }> = {
  pending: { assigned: "Pending", delegated: "Pending" },
  overdue: { assigned: "Overdue", delegated: "Overdue" },
  sent_for_approval: {
    assigned: "Sent for Approval",
    delegated: "Received for Approval",
  },
  completed: { assigned: "Completed", delegated: "Completed" },
};

function MemberBoxTasksInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string; view: string }>();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "pending";

  const view =
    params.view === "delegated"
      ? "delegated"
      : params.view === "assigned"
        ? "assigned"
        : null;

  const [member, setMember] = useState<MemberDetailsSummary | null>(null);
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
      api.membersDetailsSummary(),
      api.staffTasks(params.id),
      api.listRecurring(),
    ])
      .then(([summaryRes, tasksRes, schedulesRes]) => {
        setMember(summaryRes.data.find((row) => row.id === params.id) || null);
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
  }, [user, params.id, view, router]);

  const filteredTasks = useMemo(() => {
    if (!view) return [];
    return tasks.filter((task) => {
      if (view === "assigned" && task.receiver_id !== params.id) return false;
      if (view === "delegated" && task.delegator_id !== params.id) return false;
      const display =
        task.display_status ?? computeDisplayStatus(task.lifecycle, task.deadline);
      if (status === "pending") {
        return display === "pending" || display === "overdue";
      }
      return display === status;
    });
  }, [tasks, view, params.id, status]);

  const filteredSchedules = useMemo(() => {
    if (!view) return [];
    if (status === "sent_for_approval" || status === "completed") return [];
    return schedules.filter((schedule) => {
      if (view === "assigned" && schedule.receiver_id !== params.id) return false;
      if (view === "delegated" && schedule.delegator_id !== params.id) return false;
      if (!schedule.is_active) return false;
      if (schedule.is_paused && schedule.current_occurrence_completed) return false;
      const display = recurringScheduleDisplayStatus(schedule);
      if (status === "pending") {
        return display === "pending" || display === "overdue";
      }
      if (status === "overdue") return display === "overdue";
      return false;
    });
  }, [schedules, view, params.id, status]);

  if (!user || user.role !== "admin" || !view) return null;

  const statusLabel =
    STATUS_LABELS[status]?.[view === "assigned" ? "assigned" : "delegated"] ||
    status;
  const viewTitle = view === "assigned" ? "Assigned Task" : "Delegated Tasks";
  const memberName = member ? fullName(member) : "Member";

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
          {memberName}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {viewTitle} · {statusLabel}
          {member ? ` · @${member.username}` : ""}
        </p>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loadingData ? (
        <p className="text-sm text-ink-500">Loading tasks…</p>
      ) : !member ? (
        <EmptyState
          title="Member not found"
          description="This member may have been removed."
        />
      ) : filteredTasks.length === 0 && filteredSchedules.length === 0 ? (
        <EmptyState
          title={`No ${statusLabel.toLowerCase()} tasks`}
          description={`${memberName} has no ${viewTitle.toLowerCase()} in this status.`}
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

export default function MemberBoxTasksPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-500">Loading…</div>}>
      <MemberBoxTasksInner />
    </Suspense>
  );
}
