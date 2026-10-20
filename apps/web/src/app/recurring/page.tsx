"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  FREQUENCY_LABELS,
  FREQUENCY_ORDER as SHARED_FREQUENCY_ORDER,
  FREQUENCY_PERIOD_DAYS,
  type Frequency,
  type RecurringSchedule,
} from "@rajshree/shared";

const FREQUENCY_ORDER =
  SHARED_FREQUENCY_ORDER ??
  (Object.keys(FREQUENCY_PERIOD_DAYS || FREQUENCY_LABELS) as Frequency[]);
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState, Select } from "@/components/ui";
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

function frequencyRank(frequency: Frequency) {
  return FREQUENCY_PERIOD_DAYS[frequency] ?? Number.MAX_SAFE_INTEGER;
}

function receiverName(schedule: RecurringSchedule) {
  return schedule.receiver ? fullName(schedule.receiver) : "";
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function compareFrequency(a: RecurringSchedule, b: RecurringSchedule) {
  const byRank = frequencyRank(a.frequency) - frequencyRank(b.frequency);
  if (byRank !== 0) return byRank;
  return a.interval - b.interval;
}

function compareDefaultCascade(a: RecurringSchedule, b: RecurringSchedule) {
  const byReceiver = compareText(receiverName(a), receiverName(b));
  if (byReceiver !== 0) return byReceiver;
  const byFrequency = compareFrequency(a, b);
  if (byFrequency !== 0) return byFrequency;
  return compareText(a.title, b.title);
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
  if (key === "receiver") return compareText(receiverName(a), receiverName(b));
  if (key === "frequency") return compareFrequency(a, b);
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
    if (!av && !bv) return compareDefaultCascade(a, b);
    return av ? -1 : 1;
  }
  const byDate = av.localeCompare(bv);
  if (byDate !== 0) return dir === "asc" ? byDate : -byDate;
  return compareDefaultCascade(a, b);
}

export default function RecurringListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [error, setError] = useState("");
  const [clearingCancelled, setClearingCancelled] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("receiver");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [receiverId, setReceiverId] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; label: string }[]>([]);

  const cancelledCount = useMemo(
    () => schedules.filter((s) => !s.is_active && s.is_paused).length,
    [schedules]
  );

  const filteredSchedules = useMemo(() => {
    if (!isAdmin || !receiverId) return schedules;
    return schedules.filter((s) => s.receiver_id === receiverId);
  }, [schedules, isAdmin, receiverId]);

  const frequencySummary = useMemo(() => {
    const counts = Object.fromEntries(FREQUENCY_ORDER.map((f) => [f, 0])) as Record<
      Frequency,
      number
    >;
    for (const s of filteredSchedules) {
      counts[s.frequency] += 1;
    }
    return {
      total: filteredSchedules.length,
      items: FREQUENCY_ORDER.filter((f) => counts[f] > 0).map((f) => ({
        key: f,
        label: FREQUENCY_LABELS[f],
        count: counts[f],
      })),
    };
  }, [filteredSchedules]);

  const sortedSchedules = useMemo(() => {
    return [...filteredSchedules].sort((a, b) => {
      if (sortKey === "start") {
        return compareDateField(a, b, (schedule) => schedule.start_date, sortDir);
      }
      if (sortKey === "end") {
        return compareDateField(a, b, (schedule) => schedule.end_date, sortDir);
      }
      if (sortKey === "receiver" && sortDir === "asc") {
        return compareDefaultCascade(a, b);
      }
      const primary = compareSchedules(a, b, sortKey);
      if (primary !== 0) return sortDir === "asc" ? primary : -primary;
      return compareDefaultCascade(a, b);
    });
  }, [filteredSchedules, sortKey, sortDir]);

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

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listActiveStaff()
      .then((res) =>
        setStaffOptions(
          res.data
            .map((s) => ({
              id: s.id,
              label: fullName(s),
            }))
            .sort((a, b) => compareText(a.label, b.label))
        )
      )
      .catch(() => undefined);
  }, [isAdmin]);

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

      {isAdmin ? (
        <div className="mb-5 rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full max-w-xs">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
                Receiver
              </p>
              <Select
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                aria-label="Filter by receiver"
              >
                <option value="">All receivers</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
                Total recurring
              </p>
              <p className="font-display text-3xl font-semibold tabular-nums text-brand-900">
                {frequencySummary.total}
              </p>
            </div>
          </div>

          {frequencySummary.items.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
              {frequencySummary.items.map((item) => (
                <div
                  key={item.key}
                  className="rounded-md border border-ink-100 bg-ink-50/80 px-3 py-2.5 text-center"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
                    {item.label}
                  </p>
                  <p className="mt-1 font-display text-xl font-semibold tabular-nums text-ink-900">
                    {item.count}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

      {!schedules.length ? (
        <EmptyState
          title="No recurring schedules"
          description="Create a recurring schedule to generate timed occurrences."
        />
      ) : !filteredSchedules.length ? (
        <EmptyState
          title="No matching schedules"
          description="No recurring tasks for the selected receiver."
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
