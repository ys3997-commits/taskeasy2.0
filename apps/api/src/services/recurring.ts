import { getAdminClient } from "../lib/supabase";
import {
  computeNextOccurrence,
  deadlineForDate,
  initialNextOccurrence,
  type ScheduleLike,
} from "../lib/recurrence";
import { logActivity, notifyUser } from "../lib/activity";

export async function generateDueOccurrences(limit = 200): Promise<{
  created: number;
  advanced: number;
  errors: string[];
}> {
  const admin = getAdminClient();
  const now = new Date();
  const { data: schedules, error } = await admin
    .from("recurring_schedules")
    .select("*")
    .eq("is_active", true)
    .eq("is_paused", false)
    .lte("next_occurrence_at", now.toISOString())
    .limit(limit);

  if (error) throw error;

  let created = 0;
  let advanced = 0;
  const errors: string[] = [];

  for (const schedule of schedules || []) {
    try {
      let nextAt = schedule.next_occurrence_at
        ? new Date(schedule.next_occurrence_at)
        : null;

      // Generate all due occurrences up to now (catch-up), with a safety cap
      let safety = 0;
      while (nextAt && nextAt <= now && safety < 60) {
        safety += 1;
        const occurrenceDate = nextAt.toISOString().slice(0, 10);
        const deadline = nextAt.toISOString();

        const { data: existingOcc } = await admin
          .from("task_occurrences")
          .select("id")
          .eq("recurring_schedule_id", schedule.id)
          .eq("occurrence_date", occurrenceDate)
          .maybeSingle();

        if (!existingOcc) {
          const { data: task, error: taskError } = await admin
            .from("tasks")
            .insert({
              title: schedule.title,
              description: schedule.description,
              task_type: "recurring_occurrence",
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
            occurrence_date: occurrenceDate,
            deadline,
          });

          if (occError) {
            // Unique violation = already created by concurrent run
            if (occError.code !== "23505") throw occError;
            await admin.from("tasks").delete().eq("id", task.id);
          } else {
            created += 1;
            await logActivity({
              taskId: task.id,
              actorId: null,
              action: "occurrence_generated",
              newValue: { schedule_id: schedule.id, occurrence_date: occurrenceDate },
            });
            await notifyUser({
              userId: schedule.receiver_id,
              type: "task_assigned",
              title: "Recurring task due",
              body: `"${schedule.title}" occurrence for ${occurrenceDate} has been created.`,
              relatedTaskId: task.id,
            });
          }
        }

        const scheduleLike: ScheduleLike = {
          frequency: schedule.frequency,
          interval: schedule.interval,
          byweekday: schedule.byweekday,
          bymonthday: schedule.bymonthday,
          time_of_day: String(schedule.time_of_day).slice(0, 8),
          start_date: schedule.start_date,
          end_date: schedule.end_date,
          next_occurrence_at: nextAt.toISOString(),
        };

        const following = computeNextOccurrence(scheduleLike, nextAt);
        nextAt = following;
        advanced += 1;

        await admin
          .from("recurring_schedules")
          .update({
            next_occurrence_at: following ? following.toISOString() : null,
            is_active: following ? true : false,
          })
          .eq("id", schedule.id);

        if (!following) break;
      }
    } catch (err) {
      errors.push(
        `schedule ${schedule.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { created, advanced, errors };
}

export function buildInitialNext(params: {
  frequency: ScheduleLike["frequency"];
  interval: number;
  byweekday?: number[] | null;
  bymonthday?: number | null;
  time_of_day: string;
  start_date: string;
  end_date?: string | null;
}): string | null {
  const next = initialNextOccurrence({
    frequency: params.frequency,
    interval: params.interval,
    byweekday: params.byweekday ?? null,
    bymonthday: params.bymonthday ?? null,
    time_of_day: params.time_of_day,
    start_date: params.start_date,
    end_date: params.end_date ?? null,
  });
  return next ? next.toISOString() : null;
}

export { deadlineForDate };
