import {
  addCalendarDays,
  calendarDaysBetween,
  istCalendarDay,
  istDateString,
  recurringEditStartDate,
} from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import {
  deadlineForDate,
  isWorkingDay,
  nextWorkingInstant,
  rollWindowForward,
  type ScheduleLike,
} from "../lib/recurrence";
import { logActivity, notifyUser } from "../lib/activity";
import { AppError } from "../lib/errors";

export async function generateDueOccurrences(limit = 200): Promise<{
  created: number;
  advanced: number;
  errors: string[];
}> {
  const admin = getAdminClient();
  const now = new Date();
  const today = istDateString(now);
  const { data: schedules, error } = await admin
    .from("recurring_schedules")
    .select("*")
    .eq("is_active", true)
    .eq("is_paused", false)
    .lte("start_date", today)
    .limit(limit);

  if (error) throw error;

  const openScheduleIds = new Set<string>();
  const scheduleIds = (schedules || []).map((schedule) => schedule.id);
  if (scheduleIds.length) {
    const { data: openTasks, error: openError } = await admin
      .from("tasks")
      .select("recurring_schedule_id")
      .in("recurring_schedule_id", scheduleIds)
      .eq("lifecycle", "active");
    if (openError) throw openError;
    for (const task of openTasks || []) {
      if (task.recurring_schedule_id) openScheduleIds.add(task.recurring_schedule_id);
    }
  }

  let created = 0;
  let advanced = 0;
  const errors: string[] = [];

  for (const schedule of schedules || []) {
    try {
      // A pending or overdue occurrence blocks the next schedule date.
      if (openScheduleIds.has(schedule.id)) continue;

      const startDate = String(schedule.start_date).slice(0, 10);
      const endDate = String(schedule.end_date || schedule.start_date).slice(0, 10);
      const timeOfDay = String(schedule.time_of_day).slice(0, 8);
      const deadline = deadlineForDate(endDate, timeOfDay).toISOString();

      const { data: existingOcc } = await admin
        .from("task_occurrences")
        .select("id")
        .eq("recurring_schedule_id", schedule.id)
        .eq("occurrence_date", startDate)
        .maybeSingle();
      if (existingOcc) continue;

      const { data: task, error: taskError } = await admin
        .from("tasks")
        .insert({
          title: schedule.title,
          description: schedule.description,
          delegator_id: schedule.delegator_id,
          receiver_id: schedule.receiver_id,
          deadline,
          lifecycle: "active",
          approval_required: schedule.approval_required,
          recurring_schedule_id: schedule.id,
        })
        .select("*")
        .single();

      if (taskError) throw taskError;

      const { error: occError } = await admin.from("task_occurrences").insert({
        recurring_schedule_id: schedule.id,
        task_id: task.id,
        occurrence_date: startDate,
        deadline,
      });

      if (occError) {
        // Unique violation = already created by concurrent run
        if (occError.code !== "23505") throw occError;
        await admin.from("tasks").delete().eq("id", task.id);
        continue;
      }

      created += 1;
      openScheduleIds.add(schedule.id);
      await admin
        .from("recurring_schedules")
        .update({ next_occurrence_at: deadline })
        .eq("id", schedule.id);
      await logActivity({
        taskId: task.id,
        actorId: null,
        action: "occurrence_generated",
        newValue: { schedule_id: schedule.id, occurrence_date: startDate },
      });
      await notifyUser({
        userId: schedule.receiver_id,
        type: "task_assigned",
        title: "Recurring task due",
        body: `"${schedule.title}" can be started on ${startDate} and is due ${endDate}.`,
        relatedTaskId: task.id,
      });
    } catch (err) {
      errors.push(
        `schedule ${schedule.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { created, advanced, errors };
}

/** Current window moved forward by one frequency step, skipping deadlines already past. */
export function fieldsForNextWindow(schedule: {
  frequency: ScheduleLike["frequency"];
  interval: number;
  time_of_day: string;
  start_date: string;
  end_date: string | null;
  bymonthday?: number | null;
  today?: string;
}) {
  const today = schedule.today || istDateString(new Date());
  const window = rollWindowForward(
    schedule.start_date,
    schedule.end_date,
    schedule.frequency,
    schedule.interval,
    today,
    schedule.bymonthday
  );
  const timeOfDay = String(schedule.time_of_day).slice(0, 8);
  return {
    start_date: window.start_date,
    end_date: window.end_date,
    next_occurrence_at: deadlineForDate(window.end_date, timeOfDay).toISOString(),
    is_active: true,
  };
}

export async function realignReceiverSchedules(receiverId: string, workDays: 6 | 7) {
  const admin = getAdminClient();
  const { data: schedules, error } = await admin
    .from("recurring_schedules")
    .select("*")
    .eq("receiver_id", receiverId)
    .eq("is_active", true);
  if (error) throw error;

  for (const schedule of schedules || []) {
    const startDate = String(schedule.start_date).slice(0, 10);
    const endDate = String(schedule.end_date || schedule.start_date).slice(0, 10);
    const timeOfDay = String(schedule.time_of_day).slice(0, 8);
    const startAt = deadlineForDate(startDate, timeOfDay);
    if (isWorkingDay(startAt, workDays)) continue;

    // Keep the start→end span; only shift both days onto the next working day.
    const span = Math.max(0, calendarDaysBetween(startDate, endDate));
    const shiftedStart = nextWorkingInstant(startAt, workDays, timeOfDay);
    const nextStart = istDateString(shiftedStart);
    if (nextStart === startDate) continue;
    const nextEnd = addCalendarDays(nextStart, span);
    await admin
      .from("recurring_schedules")
      .update({
        start_date: nextStart,
        end_date: nextEnd,
        next_occurrence_at: deadlineForDate(nextEnd, timeOfDay).toISOString(),
      })
      .eq("id", schedule.id);
  }
}

/** Finish the occurrence the assignee currently sees, and keep the series running. */
export async function completeCurrentOccurrence(scheduleId: string, actorId: string) {
  const admin = getAdminClient();
  const { data: schedule, error } = await admin
    .from("recurring_schedules")
    .select("*")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error) throw error;
  if (!schedule) throw new AppError(404, "Schedule not found", "not_found");
  if (!schedule.is_active) {
    throw new AppError(400, "This recurring task is already finished", "invalid_state");
  }
  if (!schedule.next_occurrence_at) {
    throw new AppError(400, "This recurring task has no current occurrence", "invalid_state");
  }

  const { data: receiver } = await admin
    .from("profiles")
    .select("work_days")
    .eq("id", schedule.receiver_id)
    .maybeSingle();
  const workDays = receiver?.work_days === 6 ? 6 : 7;
  const occurrenceDate = String(schedule.start_date).slice(0, 10);
  const deadline = deadlineForDate(
    String(schedule.end_date || schedule.start_date).slice(0, 10),
    String(schedule.time_of_day).slice(0, 8)
  ).toISOString();
  const now = new Date().toISOString();

  const { data: existingOcc, error: occLookupError } = await admin
    .from("task_occurrences")
    .select("id, task_id")
    .eq("recurring_schedule_id", schedule.id)
    .eq("occurrence_date", occurrenceDate)
    .maybeSingle();
  if (occLookupError) throw occLookupError;

  let taskId = existingOcc?.task_id as string | undefined;
  if (taskId) {
    await admin
      .from("tasks")
      .update({ lifecycle: "completed", completed_at: now })
      .eq("id", taskId)
      .in("lifecycle", ["active", "awaiting_approval"]);
  } else {
    const { data: task, error: taskError } = await admin
      .from("tasks")
      .insert({
        title: schedule.title,
        description: schedule.description,
        delegator_id: schedule.delegator_id,
        receiver_id: schedule.receiver_id,
        deadline,
        lifecycle: "completed",
        approval_required: schedule.approval_required,
        recurring_schedule_id: schedule.id,
        completed_at: now,
      })
      .select("id")
      .single();
    if (taskError) throw taskError;
    taskId = task.id;

    const { error: occError } = await admin.from("task_occurrences").insert({
      recurring_schedule_id: schedule.id,
      task_id: taskId,
      occurrence_date: occurrenceDate,
      deadline,
    });
    if (occError && occError.code !== "23505") throw occError;
  }

  await logActivity({
    taskId: taskId!,
    actorId,
    action: "completed",
    newValue: { lifecycle: "completed", occurrence_date: occurrenceDate },
  });
  await notifyUser({
    userId: schedule.delegator_id,
    type: "task_completed",
    title: "Recurring task completed",
    body: `"${schedule.title}" for ${occurrenceDate} was marked completed.`,
    relatedTaskId: taskId,
  });

  return scheduleNextAfterCompletion(schedule.id, new Date(deadline), workDays);
}

/** Schedules whose current next_occurrence_at already has a saved occurrence. */
export async function completedCurrentOccurrenceIds(
  schedules: { id: string; start_date?: string | null; next_occurrence_at: string | null }[]
): Promise<Set<string>> {
  const nextDay = new Map<string, string>();
  for (const schedule of schedules) {
    if (!schedule.id) continue;
    const day = schedule.start_date
      ? String(schedule.start_date).slice(0, 10)
      : schedule.next_occurrence_at
        ? istDateString(new Date(schedule.next_occurrence_at))
        : null;
    if (day) nextDay.set(schedule.id, day);
  }
  if (!nextDay.size) return new Set();

  const admin = getAdminClient();
  const scheduleIds = [...nextDay.keys()];
  const occurrenceDates = [...new Set(nextDay.values())];
  const { data, error } = await admin
    .from("task_occurrences")
    .select("recurring_schedule_id, occurrence_date")
    .in("recurring_schedule_id", scheduleIds)
    .in("occurrence_date", occurrenceDates);
  if (error) throw error;

  const done = new Set<string>();
  for (const row of data || []) {
    if (nextDay.get(row.recurring_schedule_id) === row.occurrence_date) {
      done.add(row.recurring_schedule_id);
    }
  }
  return done;
}

/** Move a schedule to its next date after the open occurrence is finished. */
export async function scheduleNextAfterCompletion(
  scheduleId: string,
  completedAt: Date,
  knownWorkDays?: 6 | 7
) {
  const admin = getAdminClient();
  const { data: schedule, error } = await admin
    .from("recurring_schedules")
    .select("*")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error) throw error;
  if (!schedule || !schedule.is_active || schedule.is_paused) return schedule;

  const { data: stillOpen, error: openError } = await admin
    .from("tasks")
    .select("id")
    .eq("recurring_schedule_id", schedule.id)
    .eq("lifecycle", "active")
    .limit(1);
  if (openError) throw openError;
  if (stillOpen && stillOpen.length > 0) return schedule;

  void completedAt;
  void knownWorkDays;

  const nextWindow = fieldsForNextWindow({
    frequency: schedule.frequency,
    interval: schedule.interval,
    time_of_day: String(schedule.time_of_day).slice(0, 8),
    start_date: schedule.start_date,
    end_date: schedule.end_date,
    bymonthday: schedule.bymonthday,
  });

  const { data: updated, error: updateError } = await admin
    .from("recurring_schedules")
    .update(nextWindow)
    .eq("id", schedule.id)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return updated;
}

type ScheduleRow = {
  id: string;
  is_active: boolean;
  frequency: ScheduleLike["frequency"];
  interval: number;
  byweekday: number[] | null;
  bymonthday: number | null;
  time_of_day: string;
  start_date: string;
  end_date: string | null;
  next_occurrence_at: string | null;
};

type ScheduleEditBody = {
  frequency?: ScheduleLike["frequency"];
  interval?: number;
  byweekday?: number[] | null;
  bymonthday?: number | null;
  time_of_day?: string;
  start_date?: string;
  end_date?: string | null;
};

function sameWeekdays(left: number[] | null | undefined, right: number[] | null | undefined) {
  const a = [...(left ?? [])].map(Number).sort((x, y) => x - y);
  const b = [...(right ?? [])].map(Number).sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function clockTime(value: string) {
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}

function calendarDayOrEmpty(value: string | null | undefined) {
  if (!value) return "";
  return istCalendarDay(value);
}

/** Start date for an edit: overdue date, otherwise pending date, otherwise the upcoming date. */
export async function resolveRecurringEditAnchor(schedule: {
  id: string;
  start_date: string;
  next_occurrence_at: string | null;
}) {
  const admin = getAdminClient();
  const { data: openTasks, error } = await admin
    .from("tasks")
    .select("id, deadline")
    .eq("recurring_schedule_id", schedule.id)
    .eq("lifecycle", "active");
  if (error) throw error;

  const ids = (openTasks || []).map((task) => task.id);
  const occurrenceByTask = new Map<string, string>();
  if (ids.length) {
    const { data: occurrences, error: occurrenceError } = await admin
      .from("task_occurrences")
      .select("task_id, occurrence_date")
      .in("task_id", ids);
    if (occurrenceError) throw occurrenceError;
    for (const row of occurrences || []) {
      occurrenceByTask.set(row.task_id, String(row.occurrence_date).slice(0, 10));
    }
  }

  return recurringEditStartDate(
    schedule,
    (openTasks || []).map((task) => ({
      deadline: task.deadline,
      occurrenceDate: occurrenceByTask.get(task.id) ?? null,
    }))
  );
}

/** True when the edit actually changes when future occurrences fall. */
export function recurrenceEditDelta(existing: ScheduleRow, body: ScheduleEditBody) {
  const timeOfDayChanged =
    body.time_of_day !== undefined &&
    clockTime(body.time_of_day) !== clockTime(String(existing.time_of_day));
  const timingChanged =
    timeOfDayChanged ||
    (body.frequency !== undefined && body.frequency !== existing.frequency) ||
    (body.interval !== undefined && Number(body.interval) !== Number(existing.interval)) ||
    (body.byweekday !== undefined && !sameWeekdays(body.byweekday, existing.byweekday)) ||
    (body.bymonthday !== undefined &&
      (body.bymonthday ?? null) !== (existing.bymonthday ?? null)) ||
    (body.start_date !== undefined &&
      calendarDayOrEmpty(body.start_date) !== calendarDayOrEmpty(existing.start_date)) ||
    (body.end_date !== undefined &&
      calendarDayOrEmpty(body.end_date) !== calendarDayOrEmpty(existing.end_date));
  return { timingChanged, timeOfDayChanged };
}

/**
 * Copy an admin schedule edit onto the open occurrence only.
 * Pending and overdue tasks are lifecycle "active". Completed, cancelled,
 * and sent-for-approval occurrences are left unchanged.
 */
export async function syncOpenRecurringTasks(params: {
  scheduleId: string;
  title: string;
  description: string;
  receiverId: string;
  approvalRequired: boolean;
  endDate?: string | null;
  timeOfDay?: string;
  actorId: string;
}) {
  const admin = getAdminClient();
  const { data: openTasks, error } = await admin
    .from("tasks")
    .select("id, title, description, receiver_id, approval_required, deadline")
    .eq("recurring_schedule_id", params.scheduleId)
    .eq("lifecycle", "active");
  if (error) throw error;

  for (const task of openTasks || []) {
    const patch: Record<string, unknown> = {};
    if (task.title !== params.title) patch.title = params.title;
    if (task.description !== params.description) patch.description = params.description;
    if (task.receiver_id !== params.receiverId) patch.receiver_id = params.receiverId;
    if (task.approval_required !== params.approvalRequired) {
      patch.approval_required = params.approvalRequired;
    }
    if (params.endDate !== undefined || params.timeOfDay) {
      const day =
        params.endDate !== undefined && params.endDate
          ? String(params.endDate).slice(0, 10)
          : istDateString(new Date(task.deadline));
      const time = params.timeOfDay || "23:59:00";
      const nextDeadline = deadlineForDate(day, time);
      if (nextDeadline.getTime() !== new Date(task.deadline).getTime()) {
        patch.deadline = nextDeadline.toISOString();
      }
    }
    if (!Object.keys(patch).length) continue;

    const { error: updateError } = await admin.from("tasks").update(patch).eq("id", task.id);
    if (updateError) throw updateError;
    if (patch.deadline) {
      const { error: occurrenceError } = await admin
        .from("task_occurrences")
        .update({ deadline: patch.deadline })
        .eq("task_id", task.id);
      if (occurrenceError) throw occurrenceError;
    }
    await logActivity({
      taskId: task.id,
      actorId: params.actorId,
      action: "updated",
      previousValue: {
        title: task.title,
        description: task.description,
        receiver_id: task.receiver_id,
        approval_required: task.approval_required,
        deadline: task.deadline,
      },
      newValue: patch,
    });
  }
}

export function buildInitialNext(params: {
  frequency: ScheduleLike["frequency"];
  interval: number;
  byweekday?: number[] | null;
  bymonthday?: number | null;
  time_of_day: string;
  start_date: string;
  end_date?: string | null;
  work_days?: 6 | 7;
}): string | null {
  const end = params.end_date || params.start_date;
  return deadlineForDate(end, params.time_of_day).toISOString();
}

export { deadlineForDate };
