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
import { Button, EmptyState, Select, StatusBadge } from "./ui";

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
  showBothPeople = false,
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
  showBothPeople?: boolean;
}) {
  const assigned = variant === "assigned";
  const delegated = variant === "delegated";
  const approvals = variant === "approvals";
  const showReceiver = showBothPeople || !assigned;
  const showDelegator = showBothPeople || !delegated;
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

  const titleLabel = assigned || delegated || approvals ? "Tasks" : "Title";
  const deadlineLabel = showRange ? "End Date" : "Deadline";
  const sortFields: { key: SortKey; label: string }[] = [
    { key: "title", label: titleLabel },
    ...(showReceiver ? [{ key: "receiver" as const, label: "Receiver" }] : []),
    ...(showDelegator ? [{ key: "delegator" as const, label: "Delegator" }] : []),
    ...(showRange ? [{ key: "start" as const, label: "Start Date" }] : []),
    { key: "deadline", label: deadlineLabel },
    { key: "frequency", label: "Frequency" },
  ];

  return (
    <>
      {sortable ? (
        <div className="mb-3 md:hidden">
          <label htmlFor="task-mobile-sort" className="mb-1 block text-xs font-medium text-ink-500">
            Sort
          </label>
          <Select
            id="task-mobile-sort"
            value={sort ? `${sort.key}:${sort.dir}` : ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                setSort(null);
                return;
              }
              const [key, dir] = value.split(":") as [SortKey, SortDir];
              setSort({ key, dir });
            }}
          >
            <option value="">Default order</option>
            {sortFields.map((field) => (
              <option key={`${field.key}:asc`} value={`${field.key}:asc`}>
                {sortChoiceLabel(field.key, field.label, "asc")}
              </option>
            ))}
            {sortFields.map((field) => (
              <option key={`${field.key}:desc`} value={`${field.key}:desc`}>
                {sortChoiceLabel(field.key, field.label, "desc")}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="space-y-3 md:hidden">
        {rows.map(({ key, deadlineRaw: _deadlineRaw, startRaw: _startRaw, ...row }) => (
          <TaskCard key={key} {...row} attachments={attachments[key] ?? []} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-ink-200 bg-white md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <SortHeader
                label={titleLabel}
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
                label={deadlineLabel}
                column="deadline"
                sortable={sortable}
                sort={sort}
                onSort={toggleSort}
              />
              <SortHeader
                label="Frequency"
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
    </>
  );
}

function sortChoiceLabel(key: SortKey, label: string, dir: SortDir) {
  if (key === "deadline" || key === "start") {
    return dir === "asc" ? `${label}, earliest first` : `${label}, latest first`;
  }
  return dir === "asc" ? `${label}, A to Z` : `${label}, Z to A`;
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
        type: taskFrequencyLabel(task),
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
              !task.recurring_schedule_id
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
        type: FREQUENCY_LABELS[schedule.frequency],
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

function taskFrequencyLabel(task: Task) {
  if (!task.recurring_schedule_id) return "—";
  const nested = task.recurring_schedules;
  const frequency: Frequency | undefined = Array.isArray(nested)
    ? nested[0]?.frequency
    : nested?.frequency;
  return frequency ? FREQUENCY_LABELS[frequency] : "—";
}

function AttachmentLinks({ attachments }: { attachments: TaskAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
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
  );
}

type TaskItemProps = {
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
};

function TaskCard({
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
}: TaskItemProps) {
  const overdue = status === "overdue";
  return (
    <article
      className={
        overdue
          ? "rounded-lg border border-red-200 bg-red-50 p-4"
          : "rounded-lg border border-ink-200 bg-white p-4 shadow-sm"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={`min-w-0 break-words text-base font-medium ${overdue ? "text-red-800" : "text-ink-900"}`}>
          {title}
        </h3>
        {status ? <StatusBadge status={status} label={statusLabel} /> : null}
      </div>
      <AttachmentLinks attachments={attachments} />
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {showReceiver ? <Meta label="Receiver" value={receiver} /> : null}
        {showDelegator ? <Meta label="Delegator" value={delegator} /> : null}
        {showStartDate ? <Meta label="Start Date" value={startDate || "—"} /> : null}
        <Meta label="Deadline" value={deadline} />
        <Meta label="Frequency" value={type} />
      </dl>
      {complete?.enabled ? (
        <Button
          type="button"
          className="mt-4 w-full bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={complete.pending}
          onClick={complete.onClick}
        >
          {complete.pending
            ? complete.pendingLabel || "Marking…"
            : complete.label || "Mark as Complete"}
        </Button>
      ) : null}
      {delegatorAction && delegatorAction.kind !== "none" ? (
        <div className="mt-4">
          <DelegatorButtons action={delegatorAction} wide />
        </div>
      ) : null}
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink-800">{value}</dd>
    </div>
  );
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
}: TaskItemProps) {
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
        <AttachmentLinks attachments={attachments} />
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

const actionButtonClass = "h-7 min-h-0 w-40 justify-center whitespace-nowrap px-2 py-0 text-xs";
const wideActionButtonClass = "w-full justify-center whitespace-normal";

function DelegatorButtons({ action, wide = false }: { action: DelegatorAction; wide?: boolean }) {
  if (action.kind === "none") return <span>—</span>;
  const buttonClass = wide ? wideActionButtonClass : actionButtonClass;

  return (
    <div className={wide ? "flex flex-col gap-2" : "flex w-40 flex-col gap-1"}>
      {action.kind === "cancel" ? (
        <Button
          type="button"
          variant="danger"
          className={buttonClass}
          disabled={action.pending}
          onClick={action.onCancel}
        >
          {action.pending ? "Cancelling…" : "Cancel"}
        </Button>
      ) : (
        <>
          <Button
            type="button"
            className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700`}
            disabled={action.pending}
            onClick={action.onApprove}
          >
            {action.busy === "approve" ? "Completing…" : "Mark as complete"}
          </Button>
          <Button
            type="button"
            className={`${buttonClass} bg-orange-500 text-white hover:bg-orange-600`}
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
