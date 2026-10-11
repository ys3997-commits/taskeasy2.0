"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecurringSchedule } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function RecurringListPage() {
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const res = await api.listRecurring();
    setSchedules(res.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message || "Failed to load schedules"));
  }, []);

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">
            Recurring Tasks
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Schedules and their generated occurrences.
          </p>
        </div>
        <Link href="/recurring/new">
          <Button>New recurring schedule</Button>
        </Link>
      </div>

      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

      {!schedules.length ? (
        <EmptyState
          title="No recurring schedules"
          description="Create a recurring schedule to generate timed occurrences."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Frequency</th>
                <th className="px-4 py-3 font-medium">Next occurrence</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-t border-ink-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/recurring/${s.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {s.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {s.frequency}
                    {s.interval > 1 ? ` / every ${s.interval}` : ""}
                  </td>
                  <td className="px-4 py-3">{formatDateTime(s.next_occurrence_at)}</td>
                  <td className="px-4 py-3">
                    {!s.is_active
                      ? "Cancelled"
                      : s.is_paused
                        ? "Paused"
                        : "Active"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {s.is_active && !s.is_paused ? (
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            await api.pauseRecurring(s.id);
                            await load();
                          }}
                        >
                          Pause
                        </Button>
                      ) : null}
                      {s.is_active && s.is_paused ? (
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            await api.resumeRecurring(s.id);
                            await load();
                          }}
                        >
                          Resume
                        </Button>
                      ) : null}
                      {s.is_active ? (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            if (!confirm("Cancel this recurring schedule?")) return;
                            await api.cancelRecurring(s.id);
                            await load();
                          }}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
