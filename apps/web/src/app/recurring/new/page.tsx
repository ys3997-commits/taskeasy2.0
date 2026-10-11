"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@rajshree/shared";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fullName } from "@/lib/utils";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export default function NewRecurringPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");
  const [interval, setInterval] = useState(1);
  const [byweekday, setByweekday] = useState<number[]>([1]);
  const [bymonthday, setBymonthday] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("17:00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listActiveStaff().then((res) => setStaff(res.data)).catch(() => undefined);
  }, []);

  function toggleDay(day: number) {
    setByweekday((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const { schedule } = await api.createRecurring({
        title,
        description,
        receiver_id: receiverId,
        approval_required: approvalRequired,
        frequency,
        interval,
        byweekday: frequency === "weekly" ? byweekday : null,
        bymonthday: frequency === "monthly" ? bymonthday : null,
        time_of_day: timeOfDay,
        start_date: startDate,
        end_date: endDate || null,
      });
      router.push(`/recurring/${schedule.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-semibold text-ink-900">
        New recurring schedule
      </h1>
      <form
        onSubmit={onSubmit}
        className="mt-6 max-w-2xl space-y-4 rounded-lg border border-ink-200 bg-white p-5"
      >
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
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
          <Label>Receiver</Label>
          <Select
            value={receiverId}
            onChange={(e) => setReceiverId(e.target.value)}
            required
          >
            <option value="">Select staff</option>
            {staff
              .filter((s) => s.id !== user?.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)} ({s.username})
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
              onChange={(e) =>
                setFrequency(e.target.value as typeof frequency)
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </div>
          <div>
            <Label>Every N</Label>
            <Input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </div>
        </div>
        {frequency === "weekly" ? (
          <div>
            <Label>Weekdays</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <label key={d.value} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={byweekday.includes(d.value)}
                    onChange={() => toggleDay(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {frequency === "monthly" ? (
          <div>
            <Label>Day of month</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={bymonthday}
              onChange={(e) => setBymonthday(Number(e.target.value))}
            />
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Time of day</Label>
            <Input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>End date (optional)</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create schedule"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
