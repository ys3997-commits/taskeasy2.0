import type { DisplayStatus, TaskLifecycle } from "./types";
import { istDateString } from "./time";

export function computeDisplayStatus(
  lifecycle: TaskLifecycle,
  deadline: string | Date,
  now: Date = new Date()
): DisplayStatus {
  if (lifecycle === "cancelled") return "cancelled";
  if (lifecycle === "completed") return "completed";
  if (lifecycle === "awaiting_approval") return "sent_for_approval";

  const deadlineDate = typeof deadline === "string" ? new Date(deadline) : deadline;
  if (deadlineDate.getTime() < now.getTime()) return "overdue";
  return "pending";
}

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  overdue: "Overdue",
  sent_for_approval: "Sent for Approval",
  cancelled: "Cancelled",
};

const DELEGATED_STATUS_ORDER: Record<DisplayStatus, number> = {
  overdue: 0,
  pending: 1,
  sent_for_approval: 2,
  completed: 3,
  cancelled: 4,
};

function deadlineMillis(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** Overdue, then pending, then deadline, then title. */
export function compareDelegatedTaskOrder(
  a: { status: DisplayStatus; deadline: string | null | undefined; title: string },
  b: { status: DisplayStatus; deadline: string | null | undefined; title: string }
): number {
  const statusDiff =
    (DELEGATED_STATUS_ORDER[a.status] ?? 9) - (DELEGATED_STATUS_ORDER[b.status] ?? 9);
  if (statusDiff !== 0) return statusDiff;
  const deadlineDiff = deadlineMillis(a.deadline) - deadlineMillis(b.deadline);
  if (deadlineDiff !== 0) return deadlineDiff;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function recurringScheduleDisplayStatus(
  schedule: {
    is_active: boolean;
    is_paused: boolean;
    next_occurrence_at: string | null;
  },
  now: Date = new Date()
): DisplayStatus {
  if (!schedule.is_active) {
    return schedule.is_paused ? "cancelled" : "completed";
  }
  if (
    schedule.next_occurrence_at &&
    new Date(schedule.next_occurrence_at).getTime() < now.getTime()
  ) {
    return "overdue";
  }
  return "pending";
}

export type RecurringEditAnchor = "overdue" | "pending" | "upcoming";

/**
 * Start date used when a recurring schedule is edited.
 * Overdue wins, then pending. With neither, the upcoming occurrence date is the start.
 */
export function recurringEditStartDate(
  schedule: { start_date: string; next_occurrence_at: string | null },
  openTasks: Array<{ deadline: string; occurrenceDate?: string | null }>,
  now: Date = new Date()
): { startDate: string; kind: RecurringEditAnchor } {
  const dayOf = (task: { deadline: string; occurrenceDate?: string | null }) => {
    if (task.occurrenceDate && /^\d{4}-\d{2}-\d{2}/.test(task.occurrenceDate)) {
      return task.occurrenceDate.slice(0, 10);
    }
    return istDateString(new Date(task.deadline));
  };

  const overdue = openTasks.filter((task) => new Date(task.deadline).getTime() < now.getTime());
  if (overdue.length) {
    const current = overdue.reduce((latest, task) =>
      new Date(task.deadline).getTime() > new Date(latest.deadline).getTime() ? task : latest
    );
    return { startDate: dayOf(current), kind: "overdue" };
  }

  const pending = openTasks.filter((task) => new Date(task.deadline).getTime() >= now.getTime());
  if (pending.length) {
    const current = pending.reduce((soonest, task) =>
      new Date(task.deadline).getTime() < new Date(soonest.deadline).getTime() ? task : soonest
    );
    return { startDate: dayOf(current), kind: "pending" };
  }

  if (schedule.next_occurrence_at) {
    const next = new Date(schedule.next_occurrence_at);
    const nextDay = istDateString(next);
    if (next.getTime() < now.getTime()) return { startDate: nextDay, kind: "overdue" };
    if (nextDay > istDateString(now)) return { startDate: nextDay, kind: "upcoming" };
    return { startDate: nextDay, kind: "pending" };
  }

  return { startDate: schedule.start_date.slice(0, 10), kind: "upcoming" };
}

export function matchesDisplayStatusFilter(
  displayStatus: DisplayStatus,
  filter: DisplayStatus | "all" | undefined
): boolean {
  if (!filter || filter === "all") return true;
  return displayStatus === filter;
}
