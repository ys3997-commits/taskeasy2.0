import {
  compareDelegatedTaskOrder,
  computeDisplayStatus,
  istDateString,
  matchesDisplayStatusFilter,
  recurringScheduleDisplayStatus,
} from "@rajshree/shared";
import type { DisplayStatus, Task } from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { completedCurrentOccurrenceIds } from "./recurring";

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
  const nowIso = new Date().toISOString();
  const frequencyFilter =
    params.frequency && params.frequency !== "all" ? params.frequency : null;
  const scheduleSelect = frequencyFilter
    ? `recurring_schedules!inner(frequency, start_date)`
    : `recurring_schedules(frequency, start_date)`;

  let query = admin
    .from("tasks")
    .select(
      `*, delegator:profiles!tasks_delegator_id_fkey(${PROFILE_SELECT}), receiver:profiles!tasks_receiver_id_fkey(${PROFILE_SELECT}), ${scheduleSelect}, task_occurrences(occurrence_date)`,
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

  if (params.delegator_id) query = query.eq("delegator_id", params.delegator_id);
  if (params.receiver_id) query = query.eq("receiver_id", params.receiver_id);
  if (params.from) query = query.gte("deadline", params.from);
  if (params.to) query = query.lte("deadline", params.to);
  if (params.q) {
    query = query.or(
      `title.ilike.%${params.q}%,description.ilike.%${params.q}%`
    );
  }

  if (frequencyFilter) {
    query = query
      .not("recurring_schedule_id", "is", null)
      .eq("recurring_schedules.frequency", frequencyFilter);
  }

  // Push display-status filters into SQL so count + page ranges stay accurate.
  if (params.status && params.status !== "all") {
    const pendingIncludesOverdue = view === "received" || view === "delegated";
    if (params.status === "cancelled") {
      query = query.eq("lifecycle", "cancelled");
    } else if (params.status === "completed") {
      query = query.eq("lifecycle", "completed");
    } else if (params.status === "sent_for_approval") {
      query = query.eq("lifecycle", "awaiting_approval");
    } else if (params.status === "overdue") {
      query = query.eq("lifecycle", "active").lt("deadline", nowIso);
    } else if (params.status === "pending") {
      query = query.eq("lifecycle", "active");
      if (!pendingIncludesOverdue) {
        query = query.gte("deadline", nowIso);
      }
    }
  }

  const ascending = (params.order || "asc") === "asc";
  if (view === "delegated") {
    // Approximate overdue-first ordering: soonest deadlines first among open work.
    query = query.order("deadline", { ascending: true });
  } else if (params.sort === "status") {
    query = query.order("lifecycle", { ascending }).order("deadline", { ascending: true });
  } else {
    const sortCol = params.sort === "created_at" ? "created_at" : "deadline";
    query = query.order(sortCol, { ascending });
  }

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  let rows = (data || []).map((t) => withDisplayStatus(t as Task));

  // Safety net if a row still doesn't match (e.g. clock skew on overdue/pending).
  if (params.status && params.status !== "all") {
    const pendingIncludesOverdue = view === "received" || view === "delegated";
    rows = rows.filter((t) => {
      if (
        pendingIncludesOverdue &&
        params.status === "pending" &&
        (t.display_status === "pending" || t.display_status === "overdue")
      ) {
        return true;
      }
      return matchesDisplayStatusFilter(t.display_status, params.status);
    });
  }

  if (view === "delegated") {
    rows.sort((a, b) =>
      compareDelegatedTaskOrder(
        { status: a.display_status, deadline: a.deadline, title: a.title },
        { status: b.display_status, deadline: b.deadline, title: b.title }
      )
    );
  }

  return {
    data: rows,
    page: params.page,
    pageSize: params.pageSize,
    total: count ?? rows.length,
  };
}

function emptyStatusCounts() {
  return {
    pending: 0,
    completed: 0,
    overdue: 0,
    sent_for_approval: 0,
  };
}

function addStatus(
  summary: ReturnType<typeof emptyStatusCounts>,
  status: string
) {
  if (status === "pending") summary.pending += 1;
  else if (status === "completed") summary.completed += 1;
  else if (status === "overdue") {
    summary.overdue += 1;
    summary.pending += 1;
  }
  else if (status === "sent_for_approval") summary.sent_for_approval += 1;
}

function countByDisplayStatus(
  rows: { lifecycle: Task["lifecycle"]; deadline: string }[],
  schedules: {
    id?: string;
    is_active: boolean;
    is_paused: boolean;
    start_date?: string | null;
    next_occurrence_at: string | null;
    current_occurrence_completed?: boolean;
  }[],
  blockedScheduleIds: Set<string>,
  now: Date
) {
  const summary = emptyStatusCounts();
  for (const row of rows) {
    addStatus(summary, computeDisplayStatus(row.lifecycle, row.deadline, now));
  }
  const today = istDateString(now);
  for (const schedule of schedules) {
    if (schedule.id && blockedScheduleIds.has(schedule.id)) continue;
    if (schedule.is_active && !schedule.is_paused) {
      const opens = schedule.start_date
        ? String(schedule.start_date).slice(0, 10)
        : schedule.next_occurrence_at
          ? istDateString(new Date(schedule.next_occurrence_at))
          : "";
      if (!opens || opens > today) continue;
    }
    if (schedule.is_active && schedule.is_paused && schedule.current_occurrence_completed) {
      continue;
    }
    addStatus(summary, recurringScheduleDisplayStatus(schedule, now));
  }
  return summary;
}

function punctualityFromCompleted(
  rows: { lifecycle: string; deadline: string; completed_at: string | null }[]
) {
  let onTime = 0;
  let late = 0;
  for (const row of rows) {
    if (row.lifecycle !== "completed" || !row.completed_at) continue;
    if (new Date(row.completed_at).getTime() <= new Date(row.deadline).getTime()) {
      onTime += 1;
    } else {
      late += 1;
    }
  }
  const completed = onTime + late;
  const onTimePercent = completed === 0 ? 0 : Math.round((onTime / completed) * 100);
  return {
    completed,
    on_time: onTime,
    late,
    on_time_percent: onTimePercent,
    late_percent: completed === 0 ? 0 : 100 - onTimePercent,
  };
}

export async function dashboardSummary(userId: string, _role: string) {
  const admin = getAdminClient();
  const tasks = () =>
    admin
      .from("tasks")
      .select("lifecycle, deadline, completed_at")
      .neq("lifecycle", "cancelled");
  const schedules = () =>
    admin
      .from("recurring_schedules")
      .select("id, is_active, is_paused, start_date, next_occurrence_at");

  const [receivedRes, delegatedRes, receivedSchedulesRes, delegatedSchedulesRes, openRes] =
    await Promise.all([
      tasks().eq("receiver_id", userId),
      tasks().eq("delegator_id", userId),
      schedules().eq("receiver_id", userId),
      schedules().eq("delegator_id", userId),
      admin
        .from("tasks")
        .select("recurring_schedule_id")
        .eq("lifecycle", "active")
        .or(`receiver_id.eq.${userId},delegator_id.eq.${userId}`)
        .not("recurring_schedule_id", "is", null),
    ]);
  if (receivedRes.error) throw receivedRes.error;
  if (delegatedRes.error) throw delegatedRes.error;
  if (receivedSchedulesRes.error) throw receivedSchedulesRes.error;
  if (delegatedSchedulesRes.error) throw delegatedSchedulesRes.error;
  if (openRes.error) throw openRes.error;

  const blockedScheduleIds = new Set(
    (openRes.data || [])
      .map((row) => row.recurring_schedule_id)
      .filter((id): id is string => Boolean(id))
  );
  const finished = await completedCurrentOccurrenceIds([
    ...(receivedSchedulesRes.data || []),
    ...(delegatedSchedulesRes.data || []),
  ]);
  const withFinished = (
    rows: { id: string; is_active: boolean; is_paused: boolean; next_occurrence_at: string | null }[]
  ) =>
    rows.map((schedule) => ({
      ...schedule,
      current_occurrence_completed: finished.has(schedule.id),
    }));
  const now = new Date();
  return {
    received: countByDisplayStatus(
      receivedRes.data || [],
      withFinished(receivedSchedulesRes.data || []),
      blockedScheduleIds,
      now
    ),
    delegated: countByDisplayStatus(
      delegatedRes.data || [],
      withFinished(delegatedSchedulesRes.data || []),
      blockedScheduleIds,
      now
    ),
    punctuality: punctualityFromCompleted(receivedRes.data || []),
  };
}

export async function membersDetailsSummary() {
  const admin = getAdminClient();
  const [profilesRes, tasksRes, schedulesRes, openRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, last_name, username, role, is_active, work_days")
      .order("last_name", { ascending: true }),
    admin
      .from("tasks")
      .select(
        "lifecycle, deadline, completed_at, receiver_id, delegator_id, recurring_schedule_id"
      )
      .neq("lifecycle", "cancelled"),
    admin
      .from("recurring_schedules")
      .select("id, is_active, is_paused, start_date, next_occurrence_at, receiver_id, delegator_id"),
    admin
      .from("tasks")
      .select("recurring_schedule_id, receiver_id, delegator_id")
      .eq("lifecycle", "active")
      .not("recurring_schedule_id", "is", null),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (tasksRes.error) throw tasksRes.error;
  if (schedulesRes.error) throw schedulesRes.error;
  if (openRes.error) throw openRes.error;

  const profiles = profilesRes.data || [];
  const tasks = tasksRes.data || [];
  const schedules = schedulesRes.data || [];
  const finished = await completedCurrentOccurrenceIds(schedules);
  const now = new Date();

  const openByUser = new Map<string, Set<string>>();
  for (const row of openRes.data || []) {
    const scheduleId = row.recurring_schedule_id;
    if (!scheduleId) continue;
    for (const userId of [row.receiver_id, row.delegator_id]) {
      if (!userId) continue;
      let set = openByUser.get(userId);
      if (!set) {
        set = new Set();
        openByUser.set(userId, set);
      }
      set.add(scheduleId);
    }
  }

  const receivedTasks = new Map<string, typeof tasks>();
  const delegatedTasks = new Map<string, typeof tasks>();
  for (const task of tasks) {
    if (task.receiver_id) {
      const list = receivedTasks.get(task.receiver_id) || [];
      list.push(task);
      receivedTasks.set(task.receiver_id, list);
    }
    if (task.delegator_id) {
      const list = delegatedTasks.get(task.delegator_id) || [];
      list.push(task);
      delegatedTasks.set(task.delegator_id, list);
    }
  }

  type ScheduleRow = (typeof schedules)[number];
  const receivedSchedules = new Map<string, ScheduleRow[]>();
  const delegatedSchedules = new Map<string, ScheduleRow[]>();
  for (const schedule of schedules) {
    if (schedule.receiver_id) {
      const list = receivedSchedules.get(schedule.receiver_id) || [];
      list.push(schedule);
      receivedSchedules.set(schedule.receiver_id, list);
    }
    if (schedule.delegator_id) {
      const list = delegatedSchedules.get(schedule.delegator_id) || [];
      list.push(schedule);
      delegatedSchedules.set(schedule.delegator_id, list);
    }
  }

  const withFinished = (rows: ScheduleRow[]) =>
    rows.map((schedule) => ({
      ...schedule,
      current_occurrence_completed: finished.has(schedule.id),
    }));

  return profiles.map((profile) => {
    const blocked = openByUser.get(profile.id) || new Set<string>();
    const received = receivedTasks.get(profile.id) || [];
    return {
      id: profile.id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      username: profile.username,
      role: profile.role,
      is_active: profile.is_active,
      work_days: profile.work_days,
      received: countByDisplayStatus(
        received,
        withFinished(receivedSchedules.get(profile.id) || []),
        blocked,
        now
      ),
      delegated: countByDisplayStatus(
        delegatedTasks.get(profile.id) || [],
        withFinished(delegatedSchedules.get(profile.id) || []),
        blocked,
        now
      ),
      punctuality: punctualityFromCompleted(received),
    };
  });
}
