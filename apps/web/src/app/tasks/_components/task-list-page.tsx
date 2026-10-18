"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  istDateString,
  istInstant,
  recurringScheduleDisplayStatus,
  type RecurringSchedule,
  type Task,
} from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import {
  TaskFilters,
  defaultFilters,
  type TaskFiltersState,
} from "@/components/task-filters";
import { TaskTable } from "@/components/task-table";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

export function TaskListPage({
  title,
  description,
  view,
  showSearch,
  showPeople,
  initialStatus,
}: {
  title: string;
  description: string;
  view: "received" | "delegated" | "all" | "approvals";
  showSearch?: boolean;
  showPeople?: boolean;
  initialStatus?: string;
}) {
  const { user } = useAuth();
  const [filters, setFilters] = useState<TaskFiltersState>({
    ...defaultFilters,
    status: initialStatus || "all",
  });

  useEffect(() => {
    if (!initialStatus) return;
    setFilters((current) =>
      current.status === initialStatus ? current : { ...current, status: initialStatus }
    );
  }, [initialStatus]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; label: string }[]>([]);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    if (!showPeople) return;
    api
      .listActiveStaff()
      .then((res) =>
        setStaffOptions(
          res.data.map((s) => ({
            id: s.id,
            label: `${fullName(s)} (${s.username})`,
          }))
        )
      )
      .catch(() => undefined);
  }, [showPeople]);

  useEffect(() => {
    if (!user || view === "approvals") {
      setSchedules([]);
      return;
    }
    api
      .listRecurring()
      .then((res) => setSchedules(res.data))
      .catch(() => undefined);
  }, [user, view]);

  useEffect(() => {
    setPage(1);
  }, [filters, view]);

  const query = useMemo(
    () => ({
      view,
      status: filters.status,
      frequency: filters.frequency,
      q: filters.q,
      sort: filters.sort,
      order: filters.order,
      from: filters.from ? istInstant(filters.from, "00:00:00").toISOString() : undefined,
      to: filters.to ? istInstant(filters.to, "23:59:59").toISOString() : undefined,
      delegator_id: filters.delegator_id || undefined,
      receiver_id: filters.receiver_id || undefined,
      page,
      pageSize,
    }),
    [filters, view, page]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const visibleSchedules = useMemo(() => {
    if (!user || view === "approvals") return [];
    const q = filters.q.trim().toLowerCase();
    return schedules.filter((schedule) => {
      if (view === "received" && schedule.receiver_id !== user.id) return false;
      if (view === "delegated" && schedule.delegator_id !== user.id) return false;
      if (filters.frequency !== "all" && schedule.frequency !== filters.frequency) {
        return false;
      }
      if (filters.delegator_id && schedule.delegator_id !== filters.delegator_id) {
        return false;
      }
      if (filters.receiver_id && schedule.receiver_id !== filters.receiver_id) {
        return false;
      }
      if (
        q &&
        !schedule.title.toLowerCase().includes(q) &&
        !schedule.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (
        tasks.some(
          (task) =>
            task.recurring_schedule_id === schedule.id && task.lifecycle === "active"
        )
      ) {
        return false;
      }
      if (
        schedule.is_active &&
        !schedule.is_paused &&
        schedule.start_date.slice(0, 10) > istDateString(new Date())
      ) {
        return false;
      }
      if (schedule.is_active && schedule.is_paused && schedule.current_occurrence_completed) {
        return false;
      }
      if (filters.from || filters.to) {
        if (!schedule.next_occurrence_at) return false;
        const next = new Date(schedule.next_occurrence_at);
        if (filters.from && next < istInstant(filters.from, "00:00:00")) return false;
        if (filters.to && next > istInstant(filters.to, "23:59:59")) return false;
      }
      const status = recurringScheduleDisplayStatus(schedule);
      if (filters.status === "all") return true;
      if (
        (view === "received" || view === "delegated") &&
        filters.status === "pending" &&
        (status === "pending" || status === "overdue")
      ) {
        return true;
      }
      return status === filters.status;
    });
  }, [filters, schedules, tasks, user, view]);

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .listTasks(query)
      .then((res) => {
        setTasks(res.data);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message || "Failed to load tasks"))
      .finally(() => setLoading(false));
  }, [query]);

  async function reloadTasks() {
    const res = await api.listTasks(query);
    setTasks(res.data);
    setTotal(res.total);
  }

  async function reloadSchedules() {
    const res = await api.listRecurring();
    setSchedules(res.data);
  }

  async function completeTask(task: Task) {
    setCompletingId(task.id);
    setError("");
    try {
      await api.completeTask(task.id);
      await Promise.all([reloadTasks(), reloadSchedules()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete task");
    } finally {
      setCompletingId(null);
    }
  }

  async function runDelegatorAction(
    id: string,
    action: "cancel" | "approve" | "retask",
    work: () => Promise<unknown>
  ) {
    setActingId(`${id}:${action}`);
    setError("");
    try {
      await work();
      await Promise.all([reloadTasks(), view === "approvals" ? Promise.resolve() : reloadSchedules()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActingId(null);
    }
  }

  function cancelTask(task: Task) {
    if (!confirm("Cancel this task? It will be closed.")) return;
    void runDelegatorAction(task.id, "cancel", () => api.cancelTask(task.id));
  }

  function approveTask(task: Task) {
    void runDelegatorAction(task.id, "approve", () => api.approveTask(task.id));
  }

  function retask(task: Task) {
    void runDelegatorAction(task.id, "retask", () => api.reopenTask(task.id));
  }

  async function completeSchedule(schedule: RecurringSchedule) {
    setCompletingId(schedule.id);
    setError("");
    try {
      await api.completeRecurring(schedule.id);
      await Promise.all([reloadTasks(), reloadSchedules()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete task");
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">{title}</h1>
          <p className="mt-1 text-sm text-ink-500">{description}</p>
        </div>
        {view !== "approvals" ? (
          <Link href="/tasks/new">
            <Button>
              {view === "delegated" || view === "received"
                ? "Create One-Time Task"
                : "Create task"}
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="mb-4">
        <TaskFilters
          value={filters}
          onChange={setFilters}
          showSearch={showSearch}
          showPeople={showPeople}
          showSort={view !== "delegated"}
          staffOptions={staffOptions}
          approvalLabel={view === "delegated" ? "Received for Approval" : undefined}
        />
      </div>

      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-ink-500">Loading tasks…</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-500">
            {total + visibleSchedules.length} task(s)
            {total > pageSize
              ? ` · page ${page} of ${totalPages}`
              : null}
          </p>
          <TaskTable
            tasks={tasks}
            schedules={visibleSchedules}
            variant={
              view === "received"
                ? "assigned"
                : view === "delegated"
                  ? "delegated"
                  : view === "approvals"
                    ? "approvals"
                    : "default"
            }
            onComplete={view === "received" ? completeTask : undefined}
            onCompleteSchedule={view === "received" ? completeSchedule : undefined}
            completingId={completingId}
            delegatorActions={view === "delegated" || view === "approvals"}
            onCancel={cancelTask}
            onApprove={approveTask}
            onRetask={retask}
            actingId={actingId}
          />
          {total > pageSize ? (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
