"use client";

import { Input, Select } from "./ui";

export interface TaskFiltersState {
  status: string;
  task_type: string;
  frequency: string;
  q: string;
  sort: string;
  order: string;
  from: string;
  to: string;
  delegator_id: string;
  receiver_id: string;
}

export function TaskFilters({
  value,
  onChange,
  staffOptions,
  showSearch,
  showPeople,
  showSort = true,
  approvalLabel = "Sent for Approval",
}: {
  value: TaskFiltersState;
  onChange: (next: TaskFiltersState) => void;
  staffOptions?: { id: string; label: string }[];
  showSearch?: boolean;
  showPeople?: boolean;
  showSort?: boolean;
  approvalLabel?: string;
}) {
  const set = (key: keyof TaskFiltersState, v: string) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="grid gap-3 rounded-lg border border-ink-200 bg-white p-3 md:grid-cols-3 lg:grid-cols-4">
      <Select value={value.status} onChange={(e) => set("status", e.target.value)}>
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="completed">Completed</option>
        <option value="overdue">Overdue</option>
        <option value="sent_for_approval">{approvalLabel}</option>
        <option value="cancelled">Cancelled</option>
      </Select>
      <Select value={value.task_type} onChange={(e) => set("task_type", e.target.value)}>
        <option value="all">All types</option>
        <option value="one_time">One-time</option>
        <option value="recurring_occurrence">Recurring occurrence</option>
      </Select>
      <Select value={value.frequency} onChange={(e) => set("frequency", e.target.value)}>
        <option value="all">All frequencies</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="semi_monthly">Semi-monthly</option>
        <option value="monthly">Monthly</option>
        <option value="quarterly">Quarterly</option>
        <option value="half_yearly">Half-yearly</option>
        <option value="yearly">Yearly</option>
      </Select>
      {showSort ? (
        <>
          <Select value={value.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="deadline">Sort by deadline</option>
            <option value="created_at">Sort by created</option>
            <option value="status">Sort by status</option>
          </Select>
          <Select value={value.order} onChange={(e) => set("order", e.target.value)}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </Select>
        </>
      ) : null}
      <Input
        type="date"
        value={value.from}
        onChange={(e) => set("from", e.target.value)}
        aria-label="From date"
      />
      <Input
        type="date"
        value={value.to}
        onChange={(e) => set("to", e.target.value)}
        aria-label="To date"
      />
      {showSearch ? (
        <Input
          placeholder="Search title or description"
          value={value.q}
          onChange={(e) => set("q", e.target.value)}
        />
      ) : null}
      {showPeople && staffOptions ? (
        <>
          <Select
            value={value.delegator_id}
            onChange={(e) => set("delegator_id", e.target.value)}
          >
            <option value="">All delegators</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select
            value={value.receiver_id}
            onChange={(e) => set("receiver_id", e.target.value)}
          >
            <option value="">All receivers</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </>
      ) : null}
    </div>
  );
}

export const defaultFilters: TaskFiltersState = {
  status: "all",
  task_type: "all",
  frequency: "all",
  q: "",
  sort: "deadline",
  order: "asc",
  from: "",
  to: "",
  delegator_id: "",
  receiver_id: "",
};
