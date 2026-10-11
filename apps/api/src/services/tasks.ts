import { computeDisplayStatus, matchesDisplayStatusFilter } from "@rajshree/shared";
import type { DisplayStatus, Task } from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";

const PROFILE_SELECT = "id, first_name, last_name, username";

export function withDisplayStatus<T extends { lifecycle: Task["lifecycle"]; deadline: string }>(
  task: T,
  now = new Date()
): T & { display_status: DisplayStatus } {
  return {
    ...task,
    display_status: computeDisplayStatus(task.lifecycle, task.deadline, now),
  };
}

export async function getTaskById(id: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("tasks")
    .select(
      `*, delegator:profiles!tasks_delegator_id_fkey(${PROFILE_SELECT}), receiver:profiles!tasks_receiver_id_fkey(${PROFILE_SELECT})`
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? withDisplayStatus(data as Task) : null;
}

export function canViewTask(
  task: { receiver_id: string; delegator_id: string },
  userId: string,
  role: string
): boolean {
  if (role === "admin") return true;
  return task.receiver_id === userId || task.delegator_id === userId;
}

export interface ListTasksParams {
  view?: "received" | "delegated" | "all" | "approvals";
  status?: DisplayStatus | "all";
  task_type?: "one_time" | "recurring_occurrence" | "all";
  frequency?: string;
  delegator_id?: string;
  receiver_id?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: "deadline" | "created_at" | "status";
  order?: "asc" | "desc";
  page: number;
  pageSize: number;
  userId: string;
  role: string;
}

export async function listTasks(params: ListTasksParams) {
  const admin = getAdminClient();
  let query = admin
    .from("tasks")
    .select(
      `*, delegator:profiles!tasks_delegator_id_fkey(${PROFILE_SELECT}), receiver:profiles!tasks_receiver_id_fkey(${PROFILE_SELECT}), recurring_schedules(frequency)`,
      { count: "exact" }
    );

  const view = params.view || "received";
  if (view === "received") {
    query = query.eq("receiver_id", params.userId);
  } else if (view === "delegated") {
    query = query.eq("delegator_id", params.userId);
  } else if (view === "approvals") {
    query = query
      .eq("delegator_id", params.userId)
      .eq("lifecycle", "awaiting_approval");
  } else if (view === "all") {
    if (params.role !== "admin") {
      query = query.or(
        `receiver_id.eq.${params.userId},delegator_id.eq.${params.userId}`
      );
    }
  }

  if (params.task_type && params.task_type !== "all") {
    query = query.eq("task_type", params.task_type);
  }
  if (params.delegator_id) query = query.eq("delegator_id", params.delegator_id);
  if (params.receiver_id) query = query.eq("receiver_id", params.receiver_id);
  if (params.from) query = query.gte("deadline", params.from);
  if (params.to) query = query.lte("deadline", params.to);
  if (params.q) {
    query = query.or(
      `title.ilike.%${params.q}%,description.ilike.%${params.q}%`
    );
  }

  const sortCol = params.sort === "created_at" ? "created_at" : "deadline";
  const ascending = (params.order || "asc") === "asc";
  query = query.order(sortCol, { ascending });

  // Fetch a wider page when filtering by computed status
  const needsStatusFilter =
    params.status && params.status !== "all" && params.status !== "cancelled"
      ? true
      : params.status === "cancelled";

  const { data, error, count } = await query.range(
    needsStatusFilter ? 0 : (params.page - 1) * params.pageSize,
    needsStatusFilter ? 999 : params.page * params.pageSize - 1
  );
  if (error) throw error;

  let rows = (data || []).map((t) => withDisplayStatus(t as Task));

  if (params.status && params.status !== "all") {
    rows = rows.filter((t) =>
      matchesDisplayStatusFilter(t.display_status, params.status)
    );
  }

  if (params.frequency && params.frequency !== "all") {
    rows = rows.filter((t) => {
      const freq = (t as Task & { recurring_schedules?: { frequency: string } | null })
        .recurring_schedules?.frequency;
      return freq === params.frequency;
    });
  }

  if (params.sort === "status") {
    const orderMap: Record<string, number> = {
      overdue: 0,
      pending: 1,
      sent_for_approval: 2,
      completed: 3,
      cancelled: 4,
    };
    rows.sort((a, b) => {
      const diff =
        (orderMap[a.display_status] ?? 9) - (orderMap[b.display_status] ?? 9);
      return ascending ? diff : -diff;
    });
  }

  const total = needsStatusFilter || (params.frequency && params.frequency !== "all")
    ? rows.length
    : count ?? rows.length;

  if (needsStatusFilter || (params.frequency && params.frequency !== "all")) {
    const start = (params.page - 1) * params.pageSize;
    rows = rows.slice(start, start + params.pageSize);
  }

  return { data: rows, page: params.page, pageSize: params.pageSize, total };
}

export async function dashboardSummary(userId: string, role: string) {
  const admin = getAdminClient();
  let query = admin.from("tasks").select("lifecycle, deadline");
  if (role !== "admin") {
    query = query.eq("receiver_id", userId);
  }
  const { data, error } = await query.neq("lifecycle", "cancelled");
  if (error) throw error;

  const summary = {
    pending: 0,
    completed: 0,
    overdue: 0,
    sent_for_approval: 0,
  };
  const now = new Date();
  for (const row of data || []) {
    const status = computeDisplayStatus(
      row.lifecycle,
      row.deadline,
      now
    );
    if (status === "pending") summary.pending += 1;
    else if (status === "completed") summary.completed += 1;
    else if (status === "overdue") summary.overdue += 1;
    else if (status === "sent_for_approval") summary.sent_for_approval += 1;
  }
  return summary;
}
