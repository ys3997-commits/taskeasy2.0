"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { RecurringSchedule } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface OccurrenceRow {
  id: string;
  occurrence_date: string;
  deadline: string;
  task_id: string;
  tasks?: { id: string; title: string; lifecycle: string };
}

export default function RecurringDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [schedule, setSchedule] = useState<RecurringSchedule | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getRecurring(params.id)
      .then((res) => {
        setSchedule(res.schedule);
        setOccurrences(res.occurrences as OccurrenceRow[]);
      })
      .catch((e) => setError(e.message || "Failed to load"));
  }, [params.id]);

  if (!schedule) {
    return (
      <AppShell>
        <p className="text-sm text-ink-500">{error || "Loading…"}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">
            {schedule.title}
          </h1>
          <p className="mt-1 text-sm capitalize text-ink-500">
            {schedule.frequency}
            {schedule.interval > 1 ? ` · every ${schedule.interval}` : ""} ·{" "}
            {!schedule.is_active
              ? "Cancelled"
              : schedule.is_paused
                ? "Paused"
                : "Active"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => router.push("/recurring")}>
          Back
        </Button>
      </div>

      <Card className="mb-4 space-y-2 text-sm">
        <p className="whitespace-pre-wrap">{schedule.description}</p>
        <p>
          <span className="text-ink-500">Next occurrence:</span>{" "}
          {formatDateTime(schedule.next_occurrence_at)}
        </p>
        <p>
          <span className="text-ink-500">Time of day:</span> {String(schedule.time_of_day)}
        </p>
        <p>
          <span className="text-ink-500">Start / end:</span> {schedule.start_date}
          {schedule.end_date ? ` → ${schedule.end_date}` : " → open"}
        </p>
        <p>
          <span className="text-ink-500">Approval required:</span>{" "}
          {schedule.approval_required ? "Yes" : "No"}
        </p>
      </Card>

      <h2 className="mb-2 text-base font-semibold">Occurrences</h2>
      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Deadline</th>
              <th className="px-4 py-3 font-medium">Lifecycle</th>
              <th className="px-4 py-3 font-medium">Task</th>
            </tr>
          </thead>
          <tbody>
            {occurrences.map((o) => (
              <tr key={o.id} className="border-t border-ink-100">
                <td className="px-4 py-3">{o.occurrence_date}</td>
                <td className="px-4 py-3">{formatDateTime(o.deadline)}</td>
                <td className="px-4 py-3 capitalize">
                  {o.tasks?.lifecycle || "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/tasks/${o.task_id}`}
                    className="text-brand-700 hover:underline"
                  >
                    Open task
                  </Link>
                </td>
              </tr>
            ))}
            {!occurrences.length ? (
              <tr>
                <td className="px-4 py-6 text-ink-500" colSpan={4}>
                  No occurrences generated yet. The hourly cron job will create them when due.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
