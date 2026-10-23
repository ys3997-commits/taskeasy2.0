"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, fullName } from "@/lib/utils";

export default function OverdueTasksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
    else if (user.role !== "admin") router.replace("/dashboard");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    api
      .overdueTasks()
      .then((res) => setTasks(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tasks"))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || user.role !== "admin") return null;

  return (
    <AppShell>
      <h1 className="mb-5 font-display text-3xl font-semibold text-ink-900">Overdue Tasks</h1>
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-ink-500">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <EmptyState title="No overdue tasks" description="Open tasks past their deadline show up here." />
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {tasks.map((task) => (
            <article key={task.id} className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h2 className="break-words text-base font-medium text-ink-900">{task.title}</h2>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm min-[400px]:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Receiver</dt>
                  <dd className="mt-0.5 break-words text-ink-800">
                    {task.receiver ? fullName(task.receiver) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Delegator</dt>
                  <dd className="mt-0.5 break-words text-ink-800">
                    {task.delegator ? fullName(task.delegator) : "—"}
                  </dd>
                </div>
                <div className="min-[400px]:col-span-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Deadline</dt>
                  <dd className="mt-0.5 font-medium text-red-700">{formatDateTime(task.deadline)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-lg border border-ink-200 bg-white md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tasks</th>
                <th className="px-4 py-3 font-medium">Receiver</th>
                <th className="px-4 py-3 font-medium">Delegator</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t border-red-100 bg-red-50/40">
                  <td className="max-w-md px-4 py-3 font-medium text-ink-900">
                    <p className="line-clamp-2">{task.title}</p>
                  </td>
                  <td className="px-4 py-3">{task.receiver ? fullName(task.receiver) : "—"}</td>
                  <td className="px-4 py-3">{task.delegator ? fullName(task.delegator) : "—"}</td>
                  <td className="px-4 py-3 font-medium text-red-700">{formatDateTime(task.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </AppShell>
  );
}
