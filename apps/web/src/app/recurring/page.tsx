"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { FREQUENCY_LABELS, type RecurringSchedule } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate, fullName } from "@/lib/utils";

type SortKey = "title" | "delegator" | "receiver" | "start" | "end" | "frequency" | "status";
type SortDir = "asc" | "desc";

function scheduleStatus(schedule: RecurringSchedule) {
  if (!schedule.is_active) return schedule.is_paused ? "Cancelled" : "Completed";
  return schedule.is_paused ? "Paused" : "Active";
}

function frequencyText(schedule: RecurringSchedule) {
  const label = FREQUENCY_LABELS[schedule.frequency];
  return schedule.interval > 1 ? `${label} / every ${schedule.interval}` : label;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function compareSchedules(
  a: RecurringSchedule,
  b: RecurringSchedule,
  key: Exclude<SortKey, "start" | "end">
) {
  if (key === "title") return compareText(a.title, b.title);
  if (key === "delegator") {
    return compareText(
      a.delegator ? fullName(a.delegator) : "",
      b.delegator ? fullName(b.delegator) : ""
    );
  }
  if (key === "receiver") {
    return compareText(a.receiver ? fullName(a.receiver) : "", b.receiver ? fullName(b.receiver) : "");
  }
  if (key === "frequency") return compareText(frequencyText(a), frequencyText(b));
  return compareText(scheduleStatus(a), scheduleStatus(b));
}

function compareDateField(
  a: RecurringSchedule,
  b: RecurringSchedule,
  value: (schedule: RecurringSchedule) => string | null,
  dir: SortDir
) {
  const av = value(a);
  const bv = value(b);
  if (!av || !bv) {
    if (!av && !bv) return compareText(a.title, b.title);
    return av ? -1 : 1;
  }
  const byDate = av.localeCompare(bv);
  if (byDate !== 0) return dir === "asc" ? byDate : -byDate;
  return compareText(a.title, b.title);
}

export default function RecurringListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [error, setError] = useState("");
  const [clearingCancelled, setClearingCancelled] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const cancelledCount = useMemo(
    () => schedules.filter((s) => !s.is_active && s.is_paused).length,
    [schedules]
  );

  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      if (sortKey === "start") {
        return compareDateField(a, b, (schedule) => schedule.start_date, sortDir);
      }
      if (sortKey === "end") {
        return compareDateField(a, b, (schedule) => schedule.end_date, sortDir);
      }
      const primary = compareSchedules(a, b, sortKey);
      if (primary !== 0) return sortDir === "asc" ? primary : -primary;
      if (sortKey === "title") return 0;
      return compareText(a.title, b.title);
    });
  }, [schedules, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

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
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Recurring Tasks
        </h1>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/recurring/new">
              <Button>Create Recurring Task</Button>
            </Link>
            <Button
              variant="danger"
              disabled={!cancelledCount || clearingCancelled}
              onClick={async () => {
                if (
                  !confirm(
                    `Clear ${cancelledCount} cancelled recurring ${
                      cancelledCount === 1 ? "task" : "tasks"
                    } from the list?`
                  )
                ) {
                  return;
                }
                setError("");
                setClearingCancelled(true);
                try {
                  await api.clearCancelledRecurring();
                  await load();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Failed to clear cancelled tasks"
                  );
                } finally {
                  setClearingCancelled(false);
                }
              }}
            >
              {clearingCancelled ? "Clearing…" : "Clear Cancelled Tasks"}
            </Button>
          </div>
        ) : null}
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
                <SortHeader
                  label="Tasks"
                  column="title"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Delegator"
                  column="delegator"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Receiver"
                  column="receiver"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Start Date"
                  column="start"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="End Date"
                  column="end"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Frequency"
                  column="frequency"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Status"
                  column="status"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                {isAdmin ? (
                  <th className="px-4 py-3 text-center font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sortedSchedules.map((s) => (
                <tr key={s.id} className="border-t border-ink-100">
                  <td className="max-w-md px-4 py-3 font-medium text-ink-900">
                    <p className="line-clamp-2">{s.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.delegator ? fullName(s.delegator) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.receiver ? fullName(s.receiver) : "—"}
                  </td>
                  <td className="px-4 py-3">{formatDate(s.start_date)}</td>
                  <td className="px-4 py-3">{formatDate(s.end_date)}</td>
                  <td className="px-4 py-3">{frequencyText(s)}</td>
                  <td className="px-4 py-3">{scheduleStatus(s)}</td>
                  {isAdmin ? (
                    <td className="px-4 py-3">
                      {s.is_active ? (
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Link href={`/recurring/${s.id}/edit`} className="inline-flex">
                            <Button variant="secondary" className="px-3 py-1.5">
                              Edit
                            </Button>
                          </Link>
                          {s.is_paused ? (
                            <Button
                              variant="secondary"
                              className="px-3 py-1.5"
                              onClick={async () => {
                                try {
                                  await api.resumeRecurring(s.id);
                                  await load();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Failed to resume");
                                }
                              }}
                            >
                              Resume
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              className="px-3 py-1.5"
                              onClick={async () => {
                                try {
                                  await api.pauseRecurring(s.id);
                                  await load();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : "Failed to pause");
                                }
                              }}
                            >
                              Pause
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            className="px-3 py-1.5"
                            onClick={async () => {
                              if (!confirm("Cancel this recurring schedule?")) return;
                              try {
                                await api.cancelRecurring(s.id);
                                await load();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed to cancel");
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <p className="text-right text-ink-400">—</p>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  const nextDir = active && sortDir === "asc" ? "descending" : "ascending";
  return (
    <th
      className="px-4 py-3 font-medium"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1.5 hover:text-ink-900 ${
          active ? "text-ink-900" : "text-ink-500"
        }`}
        title={`Sort ${label} ${nextDir}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
        )}
      </button>
    </th>
  );
}
