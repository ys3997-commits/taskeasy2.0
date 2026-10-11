"use client";

import Link from "next/link";
import type { Task } from "@rajshree/shared";
import { formatDateTime, fullName } from "@/lib/utils";
import { EmptyState, StatusBadge } from "./ui";

export function TaskTable({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) {
    return (
      <EmptyState
        title="No tasks found"
        description="Try adjusting filters or create a new task."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-ink-50 text-ink-500">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Receiver</th>
            <th className="px-4 py-3 font-medium">Delegator</th>
            <th className="px-4 py-3 font-medium">Deadline</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const overdue = task.display_status === "overdue";
            return (
              <tr
                key={task.id}
                className={
                  overdue
                    ? "border-t border-red-100 bg-red-50/40"
                    : "border-t border-ink-100"
                }
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {task.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {task.receiver
                    ? fullName(task.receiver)
                    : task.receiver_id.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {task.delegator
                    ? fullName(task.delegator)
                    : task.delegator_id.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {formatDateTime(task.deadline)}
                </td>
                <td className="px-4 py-3 capitalize text-ink-700">
                  {task.task_type === "one_time" ? "One-time" : "Recurring"}
                </td>
                <td className="px-4 py-3">
                  {task.display_status ? (
                    <StatusBadge status={task.display_status} />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
