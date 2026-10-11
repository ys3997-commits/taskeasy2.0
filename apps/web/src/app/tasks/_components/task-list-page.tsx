"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Task } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import {
  TaskFilters,
  defaultFilters,
  type TaskFiltersState,
} from "@/components/task-filters";
import { TaskTable } from "@/components/task-table";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
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
  const [filters, setFilters] = useState<TaskFiltersState>({
    ...defaultFilters,
    status: initialStatus || "all",
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; label: string }[]>([]);

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

  const query = useMemo(
    () => ({
      view,
      status: filters.status,
      task_type: filters.task_type,
      frequency: filters.frequency,
      q: filters.q,
      sort: filters.sort,
      order: filters.order,
      from: filters.from ? new Date(filters.from).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
      delegator_id: filters.delegator_id || undefined,
      receiver_id: filters.receiver_id || undefined,
      page: 1,
      pageSize: 50,
    }),
    [filters, view]
  );

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

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">{title}</h1>
          <p className="mt-1 text-sm text-ink-500">{description}</p>
        </div>
        {view !== "approvals" ? (
          <Link href="/tasks/new">
            <Button>Create task</Button>
          </Link>
        ) : null}
      </div>

      <div className="mb-4">
        <TaskFilters
          value={filters}
          onChange={setFilters}
          showSearch={showSearch}
          showPeople={showPeople}
          staffOptions={staffOptions}
        />
      </div>

      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-ink-500">Loading tasks…</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-500">{total} task(s)</p>
          <TaskTable tasks={tasks} />
        </>
      )}
    </AppShell>
  );
}
