import type { DisplayStatus, TaskLifecycle } from "./types";

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

export function matchesDisplayStatusFilter(
  displayStatus: DisplayStatus,
  filter: DisplayStatus | "all" | undefined
): boolean {
  if (!filter || filter === "all") return true;
  return displayStatus === filter;
}
