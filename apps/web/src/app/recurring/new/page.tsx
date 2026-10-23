"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FREQUENCY_LABELS,
  FREQUENCY_ORDER,
  canReceiveAssignedTasks,
  isBeforeTodayIst,
  todayIst,
  type Frequency,
  type Profile,
} from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

const FREQUENCIES: Frequency[] = FREQUENCY_ORDER;

export default function NewRecurringPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [description, setDescription] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [frequency, setFrequency] = useState<Frequency | "">("");
  const [interval, setInterval] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && user && user.role !== "admin") router.replace("/recurring");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
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
    if (!endDate) {
      setError("End date is required");
      return;
    }
    if (frequency === "daily" && startDate !== endDate) {
      setError("For daily frequency, start date and end date must be the same");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date");
      return;
    }
    if (isBeforeTodayIst(startDate) || isBeforeTodayIst(endDate)) {
      setError("Dates must be today or in the future");
      return;
    }
    setSaving(true);
    try {
      const title = description.trim().split("\n")[0].slice(0, 200);
      await api.createRecurring({
        title,
        description,
        receiver_id: receiverId,
        approval_required: approvalRequired,
        frequency,
        interval,
        byweekday: null,
        bymonthday: null,
        time_of_day: "23:59",
        start_date: startDate,
        end_date: frequency === "daily" ? startDate : endDate,
      });
      router.push("/recurring");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  }

  if (!loading && user && user.role !== "admin") return null;

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">
        Create Recurring Task
      </h1>
      <form
        onSubmit={onSubmit}
        className="mt-6 w-full max-w-2xl space-y-4 rounded-lg border border-ink-200 bg-white p-4 sm:p-5"
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
              .filter((s) => s.id !== user?.id && canReceiveAssignedTasks(s))
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
            {frequency === "thrice_monthly" ? (
              <p className="mt-1 text-xs text-ink-500">
                Three times a month: start day, then +10 days, then +20 days.
              </p>
            ) : null}
            {frequency === "semi_monthly" ? (
              <p className="mt-1 text-xs text-ink-500">
                Twice a month: start day, then +15 days.
              </p>
            ) : null}
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
              min={todayIst()}
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              required
            />
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
            {frequency === "daily" ? (
              <p className="mt-1 text-xs text-ink-500">
                Daily tasks use the same start and end date.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
            {saving ? "Creating…" : "Create schedule"}
          </Button>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
