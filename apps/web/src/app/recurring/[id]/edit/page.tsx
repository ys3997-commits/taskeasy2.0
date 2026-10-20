"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FREQUENCY_LABELS,
  addCalendarDays,
  canReceiveAssignedTasks,
  isBeforeTodayIst,
  istCalendarDay,
  recurringEditStartDate,
  todayIst,
  type Frequency,
  type Profile,
} from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

const FREQUENCIES: Frequency[] = [
  "daily",
  "weekly",
  "semi_monthly",
  "thrice_monthly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
];

function openTasksFrom(occurrences: unknown[]) {
  const tasks: { deadline: string; occurrenceDate?: string | null }[] = [];
  for (const row of occurrences) {
    if (!row || typeof row !== "object") continue;
    const occurrence = row as {
      occurrence_date?: string;
      tasks?:
        | { lifecycle?: string; deadline?: string }
        | { lifecycle?: string; deadline?: string }[]
        | null;
    };
    const nested = occurrence.tasks;
    const list = Array.isArray(nested) ? nested : nested ? [nested] : [];
    for (const task of list) {
      if (task?.lifecycle === "active" && task.deadline) {
        tasks.push({
          deadline: task.deadline,
          occurrenceDate: occurrence.occurrence_date ?? null,
        });
      }
    }
  }
  return tasks;
}

export default function EditRecurringPage() {
  const params = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [description, setDescription] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [frequency, setFrequency] = useState<Frequency | "">("");
  const [interval, setInterval] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [startLocked, setStartLocked] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [savedEndDate, setSavedEndDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .getRecurring(params.id)
      .then((res) => {
        const schedule = res.schedule;
        if (user.role !== "admin" && user.id !== schedule.delegator_id) {
          router.replace("/recurring");
          return;
        }
        setDescription(schedule.description);
        setReceiverId(schedule.receiver_id);
        setApprovalRequired(schedule.approval_required);
        setFrequency(schedule.frequency);
        setInterval(schedule.interval);
        const loadedEnd = schedule.end_date ? schedule.end_date.slice(0, 10) : "";
        const anchor = recurringEditStartDate(schedule, openTasksFrom(res.occurrences));
        const nextEnd = schedule.frequency === "daily" ? anchor.startDate : loadedEnd;
        setStartDate(anchor.startDate);
        setStartLocked(anchor.kind === "pending" || anchor.kind === "overdue");
        setEndDate(nextEnd);
        setSavedEndDate(nextEnd);
        setReady(true);
      })
      .catch((e) => setError(e.message || "Failed to load schedule"));
  }, [user, params.id, router]);

  useEffect(() => {
    if (!user) return;
    api.listActiveStaff().then((res) => setStaff(res.data)).catch(() => undefined);
  }, [user]);

  function onFrequencyChange(value: Frequency | "") {
    setFrequency(value);
    if (value === "daily") setEndDate(startDate);
  }

  function onStartDateChange(value: string) {
    setStartDate(value);
    if (frequency === "daily") setEndDate(value);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!receiverId) {
      setError("Select a name");
      return;
    }
    if (!frequency) {
      setError("Select a frequency");
      return;
    }
    if (!startLocked && istCalendarDay(startDate) <= todayIst()) {
      setError("Start date must be a future date");
      return;
    }
    if (frequency === "daily" && startDate !== endDate) {
      setError("For daily frequency, start date and end date must be the same");
      return;
    }
    if (endDate && endDate < startDate) {
      setError("End date must be on or after the start date");
      return;
    }
    const resolvedEnd = frequency === "daily" ? startDate : endDate;
    const endMovedBack =
      Boolean(resolvedEnd) &&
      isBeforeTodayIst(resolvedEnd) &&
      istCalendarDay(resolvedEnd) !== (savedEndDate ? istCalendarDay(savedEndDate) : "");
    if (endMovedBack) {
      setError("Dates must be today or in the future");
      return;
    }
    setSaving(true);
    try {
      const title = description.trim().split("\n")[0].slice(0, 200);
      await api.updateRecurring(params.id, {
        title,
        description,
        receiver_id: receiverId,
        approval_required: approvalRequired,
        frequency,
        interval,
        byweekday: null,
        bymonthday: null,
        start_date: startDate,
        end_date: resolvedEnd || null,
      });
      router.push("/recurring");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  if (loading || (!ready && !error)) {
    return (
      <AppShell>
        <p className="text-sm text-ink-500">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">
        Edit recurring schedule
      </h1>
      <form
        onSubmit={onSubmit}
        className="mt-6 max-w-2xl space-y-4 rounded-lg border border-ink-200 bg-white p-5"
      >
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label>Description</Label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="receiver">Receiver</Label>
          <Select
            id="receiver"
            value={receiverId}
            onChange={(e) => setReceiverId(e.target.value)}
            required
          >
            <option value="">Select a name</option>
            {staff
              .filter((s) => s.id === receiverId || canReceiveAssignedTasks(s))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(e) => setApprovalRequired(e.target.checked)}
          />
          Approval required
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Frequency</Label>
            <Select
              value={frequency}
              onChange={(e) => onFrequencyChange(e.target.value as Frequency)}
              required
            >
              <option value="">Select frequency</option>
              {FREQUENCIES.map((value) => (
                <option key={value} value={value}>
                  {FREQUENCY_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Every N</Label>
            <Input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Start date</Label>
            <Input
              type="date"
              min={startLocked ? undefined : addCalendarDays(todayIst(), 1)}
              value={startDate}
              disabled={startLocked}
              required
              onChange={(e) => onStartDateChange(e.target.value)}
              className={startLocked ? "cursor-not-allowed bg-ink-50 text-ink-500" : undefined}
            />
            <p className="mt-1 text-xs text-ink-500">
              {startLocked
                ? "Start date cannot be changed while this task is pending or overdue."
                : "The day work can begin."}
            </p>
          </div>
          <div>
            <Label>End date</Label>
            <Input
              type="date"
              min={startDate || todayIst()}
              value={frequency === "daily" ? startDate : endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={frequency === "daily"}
              required
              className={
                frequency === "daily" ? "cursor-not-allowed bg-ink-50 text-ink-500" : undefined
              }
            />
            <p className="mt-1 text-xs text-ink-500">
              {frequency === "daily"
                ? "Daily tasks use the same start and end date."
                : "The deadline for this occurrence."}
            </p>
          </div>
        </div>
        {frequency && frequency !== "daily" ? (
          <p className="text-sm text-ink-500">
            The next occurrence keeps the same number of days and moves forward by the frequency.
            Weekly from 20/10 to 22/10 comes back from 27/10 to 29/10.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !ready}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/recurring")}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
