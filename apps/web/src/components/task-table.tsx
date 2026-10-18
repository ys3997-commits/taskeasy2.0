"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Image as ImageIcon, Paperclip } from "lucide-react";
import {
  FREQUENCY_LABELS,
  type DisplayStatus,
  type Frequency,
  type RecurringSchedule,
  type Task,
  type TaskAttachment,
  compareDelegatedTaskOrder,
  computeDisplayStatus,
  recurringScheduleDisplayStatus,
} from "@rajshree/shared";
import { api } from "@/lib/api";
import { formatFileSize } from "@/lib/attachments";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import { Button, EmptyState, StatusBadge } from "./ui";

export function TaskTable({
  tasks,
  schedules = [],
  variant = "default",
  onComplete,
  onCompleteSchedule,
  completingId,
  delegatorActions,
  onCancel,
  onApprove,
  onRetask,
  actingId,
}: {
  tasks: Task[];
  schedules?: RecurringSchedule[];
  variant?: "default" | "assigned" | "delegated" | "approvals";
  onComplete?: (task: Task) => void;
  onCompleteSchedule?: (schedule: RecurringSchedule) => void;
  completingId?: string | null;
  delegatorActions?: boolean;
  onCancel?: (task: Task) => void;
  onApprove?: (task: Task) => void;
  onRetask?: (task: Task) => void;
  actingId?: string | null;
}) {
  const assigned = variant === "assigned";
  const delegated = variant === "delegated";
  const approvals = variant === "approvals";
  const showReceiver = !assigned;
  const showDelegator = !delegated;
  const showFrequency = assigned || delegated || approvals;
  const showRange = assigned || delegated;
  const dateOnly = assigned || delegated;
  const sortable = assigned || delegated || approvals;
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const taskIds = tasks.map((task) => task.id).join(",");
  const [attachments, setAttachments] = useState<Record<string, TaskAttachment[]>>({});

  useEffect(() => {
    const ids = taskIds ? taskIds.split(",") : [];
    if (!ids.length) {
      setAttachments({});
      return;
    }
    let cancelled = false;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    Promise.all(chunks.map((chunk) => api.taskAttachments(chunk)))
      .then((pages) => {
        if (cancelled) return;
        setAttachments(Object.assign({}, ...pages.map((page) => page.data)));
      })
      .catch(() => {
        if (!cancelled) setAttachments({});
      });
    return () => {
      cancelled = true;
    };
  }, [taskIds]);

  const rows = sortRows(
    buildRows({
      tasks,
      schedules,
      assigned,
      delegated,
      showReceiver,
      showDelegator,
      showFrequency,
      showRange,
      dateOnly,
      onComplete,
      onCompleteSchedule,
      completingId,
      delegatorActions,
      onCancel,
      onApprove,
      onRetask,
      actingId,
    }),
    sort
  );

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key === key) {
        return { key, dir: current.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }

  if (!rows.length) {
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
            <SortHeader
              label={assigned || delegated || approvals ? "Tasks" : "Title"}
              column="title"
              sortable={sortable}
              sort={sort}
              onSort={toggleSort}
            />
            {showReceiver ? (
              <SortHeader
                label="Receiver"
                column="receiver"
                sortable={sortable}
                sort={sort}
                onSort={toggleSort}
              />
            ) : null}
            {showDelegator ? (
              <SortHeader
                label="Delegator"
                column="delegator"
                sortable={sortable}
                sort={sort}
                onSort={toggleSort}
              />
            ) : null}
            {showRange ? (
              <SortHeader
                label="Start Date"
                column="start"
                sortable={sortable}
                sort={sort}
                onSort={toggleSort}
              />
            ) : null}
            <SortHeader
              label={showRange ? "End Date" : "Deadline"}
              column="deadline"
              sortable={sortable}
              sort={sort}
              onSort={toggleSort}
            />
            <SortHeader
              label={showFrequency ? "Frequency" : "Type"}
              column="frequency"
              sortable={sortable}
              sort={sort}
              onSort={toggleSort}
            />
            <th className="px-4 py-3 font-medium">Status</th>
            {assigned || delegatorActions ? (
              <th className="px-4 py-3 font-medium">Action</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, deadlineRaw: _deadlineRaw, startRaw: _startRaw, ...row }) => (
            <TaskRow key={key} {...row} attachments={attachments[key] ?? []} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortKey = "title" | "receiver" | "delegator" | "start" | "deadline" | "frequency";
type SortDir = "asc" | "desc";

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function sortRows<
  T extends {
    title: string;
    receiver: string;
    delegator: string;
    startRaw: string | null;
    deadlineRaw: string | null;
    type: string;
  },
>(rows: T[], sort: { key: SortKey; dir: SortDir } | null) {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === "deadline" || sort.key === "start") {
      const av = deadlineMillis(sort.key === "start" ? a.startRaw : a.deadlineRaw);
      const bv = deadlineMillis(sort.key === "start" ? b.startRaw : b.deadlineRaw);
      const aMissing = !Number.isFinite(av);
      const bMissing = !Number.isFinite(bv);
      if (aMissing && bMissing) return compareText(a.title, b.title);
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (av !== bv) return (av - bv) * factor;
      return compareText(a.title, b.title);
    }
    const cmp =
      sort.key === "title"
        ? compareText(a.title, b.title)
        : sort.key === "receiver"
          ? compareText(a.receiver, b.receiver)
          : sort.key === "delegator"
            ? compareText(a.delegator, b.delegator)
            : compareText(a.type, b.type);
    if (cmp !== 0) return cmp * factor;
    if (sort.key === "title") return 0;
    return compareText(a.title, b.title);
  });
}

function deadlineMillis(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function SortHeader({
  label,
  column,
  sortable,
  sort,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortable: boolean;
  sort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
}) {
  if (!sortable) {
    return <th className="px-4 py-3 font-medium">{label}</th>;
  }
  const active = sort?.key === column;
  const nextDir = active && sort.dir === "asc" ? "descending" : "ascending";
  return (
    <th
      className="px-4 py-3 font-medium"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
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
          sort.dir === "asc" ? (
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

function buildRows({
  tasks,
  schedules,
  assigned,
  delegated,
  showReceiver,
  showDelegator,
  showFrequency,
  showRange,
  dateOnly,
  onComplete,
  onCompleteSchedule,
  completingId,
  delegatorActions,
  onCancel,
  onApprove,
  onRetask,
  actingId,
}: {
  tasks: Task[];
  schedules: RecurringSchedule[];
  assigned: boolean;
  delegated: boolean;
  showReceiver: boolean;
  showDelegator: boolean;
  showFrequency: boolean;
  showRange: boolean;
  dateOnly: boolean;
  onComplete?: (task: Task) => void;
  onCompleteSchedule?: (schedule: RecurringSchedule) => void;
  completingId?: string | null;
  delegatorActions?: boolean;
  onCancel?: (task: Task) => void;
  onApprove?: (task: Task) => void;
  onRetask?: (task: Task) => void;
  actingId?: string | null;
}) {
  const rows = [
    ...tasks.map((task) => {
      const status =
        task.display_status ?? computeDisplayStatus(task.lifecycle, task.deadline);
      return {
        key: task.id,
        title: task.title,
        receiver: task.receiver ? fullName(task.receiver) : task.receiver_id.slice(0, 8),
        showReceiver,
        delegator: task.delegator ? fullName(task.delegator) : task.delegator_id.slice(0, 8),
        showDelegator,
        showStartDate: showRange,
        startDate: formatRangeDate(taskStartRaw(task), dateOnly),
        startRaw: taskStartRaw(task),
        deadline: dateOnly ? formatDate(task.deadline) : formatDateTime(task.deadline),
        deadlineRaw: task.deadline,
        type: showFrequency ? taskFrequencyLabel(task) : taskTypeLabel(task),
        status,
        statusLabel: delegated && status === "sent_for_approval" ? "Approval" : undefined,
        complete: assigned
          ? {
              enabled: status === "pending" || status === "overdue",
              pending: completingId === task.id,
              label: task.approval_required ? "Submit for approval" : "Mark as Complete",
              pendingLabel: task.approval_required ? "Submitting…" : "Marking…",
              onClick: () => onComplete?.(task),
            }
          : undefined,
        delegatorAction: delegatorActions
          ? delegatorRowAction(
              status,
              task.id,
              actingId,
              {
                onCancel: () => onCancel?.(task),
                onApprove: () => onApprove?.(task),
                onRetask: () => onRetask?.(task),
              },
              task.task_type === "one_time"
            )
          : undefined,
      };
    }),
    ...schedules.map((schedule) => {
      const status = recurringScheduleDisplayStatus(schedule);
      return {
        key: schedule.id,
        title: schedule.title,
        receiver: schedule.receiver
          ? fullName(schedule.receiver)
          : schedule.receiver_id.slice(0, 8),
        showReceiver,
        delegator: schedule.delegator
          ? fullName(schedule.delegator)
          : schedule.delegator_id.slice(0, 8),
        showDelegator,
        showStartDate: showRange,
        startDate: formatRangeDate(schedule.start_date, dateOnly),
        startRaw: schedule.start_date,
        deadline: dateOnly
          ? formatDate(schedule.end_date || schedule.next_occurrence_at)
          : formatDateTime(schedule.next_occurrence_at || schedule.end_date),
        deadlineRaw: schedule.next_occurrence_at || schedule.end_date,
        type: showFrequency ? FREQUENCY_LABELS[schedule.frequency] : "Recurring",
        status,
        statusLabel: undefined,
        complete: assigned
          ? {
              enabled: status === "pending" || status === "overdue",
              pending: completingId === schedule.id,
              onClick: () => onCompleteSchedule?.(schedule),
            }
          : undefined,
        delegatorAction: delegatorActions ? { kind: "none" as const } : undefined,
      };
    }),
  ];

  if (!delegated) return rows;

  return rows.sort((a, b) =>
    compareDelegatedTaskOrder(
      { status: a.status, deadline: a.deadlineRaw, title: a.title },
      { status: b.status, deadline: b.deadlineRaw, title: b.title }
    )
  );
}

function delegatorRowAction(
  status: DisplayStatus,
  id: string,
  actingId: string | null | undefined,
  handlers: {
    onCancel: () => void;
    onApprove: () => void;
    onRetask: () => void;
  },
  oneTime: boolean
): DelegatorAction {
  const busy = actingId?.startsWith(`${id}:`) ? actingId.slice(id.length + 1) : undefined;
  if (status === "pending" || status === "overdue") {
    if (!oneTime) return { kind: "none" };
    return { kind: "cancel", pending: busy === "cancel", onCancel: handlers.onCancel };
  }
  if (status === "sent_for_approval") {
    return {
      kind: "review",
      pending: busy === "approve" || busy === "retask",
      busy,
      onApprove: handlers.onApprove,
      onRetask: handlers.onRetask,
    };
  }
  return { kind: "none" };
}

type DelegatorAction =
  | { kind: "cancel"; pending: boolean; onCancel: () => void }
  | {
      kind: "review";
      pending: boolean;
      busy?: string;
      onApprove: () => void;
      onRetask: () => void;
    }
  | { kind: "none" };

function formatRangeDate(value: string | null | undefined, dateOnly: boolean) {
  return dateOnly ? formatDate(value) : formatDateTime(value);
}

function firstNested<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function taskStartRaw(task: Task) {
  return firstNested(task.task_occurrences)?.occurrence_date || task.created_at;
}

function taskTypeLabel(task: Task) {
  return task.task_type === "one_time" ? "One-time" : "Recurring";
}

function taskFrequencyLabel(task: Task) {
  if (task.task_type === "one_time") return "One-time";
  const nested = task.recurring_schedules;
  const frequency: Frequency | undefined = Array.isArray(nested)
    ? nested[0]?.frequency
    : nested?.frequency;
  return frequency ? FREQUENCY_LABELS[frequency] : "—";
}

function TaskRow({
  title,
  receiver,
  showReceiver,
  delegator,
  showDelegator,
  showStartDate,
  startDate,
  deadline,
  type,
  status,
  statusLabel,
  complete,
  delegatorAction,
  attachments,
}: {
  title: string;
  receiver: string;
  showReceiver: boolean;
  delegator: string;
  showDelegator: boolean;
  showStartDate?: boolean;
  startDate?: string;
  deadline: string;
  type: string;
  status?: DisplayStatus;
  statusLabel?: string;
  attachments: TaskAttachment[];
  complete?: {
    enabled: boolean;
    pending?: boolean;
    label?: string;
    pendingLabel?: string;
    onClick?: () => void;
  };
  delegatorAction?: DelegatorAction;
}) {
  const overdue = status === "overdue";
  const cellText = overdue ? "text-red-800" : "text-ink-700";
  return (
    <tr
      className={overdue ? "border-t border-red-100 bg-red-50" : "border-t border-ink-100"}
    >
      <td className="px-4 py-3">
        <span className={overdue ? "font-medium text-red-800" : "font-medium text-ink-900"}>
          {title}
        </span>
        {attachments.length ? (
          <div className="mt-1.5 flex max-w-xs flex-wrap gap-1">
            {attachments.map((file) => (
              <a
                key={file.id}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${file.file_name} (${formatFileSize(file.size_bytes)})`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-700 hover:border-brand-500 hover:text-brand-700"
              >
                {file.content_type.startsWith("image/") ? (
                  <ImageIcon className="h-3 w-3 shrink-0" aria-hidden />
                ) : (
                  <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                )}
                <span className="max-w-[11rem] truncate">{file.file_name}</span>
              </a>
            ))}
          </div>
        ) : null}
      </td>
      {showReceiver ? <td className={`px-4 py-3 ${cellText}`}>{receiver}</td> : null}
      {showDelegator ? <td className={`px-4 py-3 ${cellText}`}>{delegator}</td> : null}
      {showStartDate ? <td className={`px-4 py-3 ${cellText}`}>{startDate}</td> : null}
      <td className={`px-4 py-3 ${cellText}`}>{deadline}</td>
      <td className={`px-4 py-3 ${cellText}`}>{type}</td>
      <td className="px-4 py-3 align-middle">
        {status ? <StatusBadge status={status} label={statusLabel} /> : "—"}
      </td>
      {complete ? (
        <td className="px-4 py-3 align-middle">
          {complete.enabled ? (
            <Button
              type="button"
              className="whitespace-nowrap bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"
              disabled={complete.pending}
              onClick={complete.onClick}
            >
              {complete.pending
                ? complete.pendingLabel || "Marking…"
                : complete.label || "Mark as Complete"}
            </Button>
          ) : (
            "—"
          )}
        </td>
      ) : null}
      {delegatorAction ? (
        <td className="px-4 py-3 align-middle">
          <DelegatorButtons action={delegatorAction} />
        </td>
      ) : null}
    </tr>
  );
}

const actionButtonClass = "h-7 w-40 justify-center whitespace-nowrap px-2 py-0 text-xs";

function DelegatorButtons({ action }: { action: DelegatorAction }) {
  if (action.kind === "none") return <span>—</span>;

  return (
    <div className="flex w-40 flex-col gap-1">
      {action.kind === "cancel" ? (
        <Button
          type="button"
          variant="danger"
          className={actionButtonClass}
          disabled={action.pending}
          onClick={action.onCancel}
        >
          {action.pending ? "Cancelling…" : "Cancel"}
        </Button>
      ) : (
        <>
          <Button
            type="button"
            className={`${actionButtonClass} bg-emerald-600 text-white hover:bg-emerald-700`}
            disabled={action.pending}
            onClick={action.onApprove}
          >
            {action.busy === "approve" ? "Completing…" : "Mark as complete"}
          </Button>
          <Button
            type="button"
            className={`${actionButtonClass} bg-orange-500 text-white hover:bg-orange-600`}
            disabled={action.pending}
            onClick={action.onRetask}
          >
            {action.busy === "retask" ? "Sending…" : "Retask as in progress"}
          </Button>
        </>
      )}
    </div>
  );
}
