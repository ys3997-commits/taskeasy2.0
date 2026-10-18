import { Router } from "express";
import {
  canReceiveAssignedTasks,
  createRecurringSchema,
  isBeforeTodayIst,
  istCalendarDay,
  todayIst,
  updateRecurringSchema,
} from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import {
  AuthedRequest,
  requireAuth,
  requirePasswordChanged,
  requireRole,
} from "../middleware/auth";
import {
  buildInitialNext,
  completeCurrentOccurrence,
  completedCurrentOccurrenceIds,
  fieldsForNextWindow,
  generateDueOccurrences,
  recurrenceEditDelta,
  resolveRecurringEditAnchor,
  syncOpenRecurringTasks,
} from "../services/recurring";
import { logActivity, notifyUser } from "../lib/activity";

const router = Router();

router.use(requireAuth, requirePasswordChanged);

router.get("/", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    let query = admin
      .from("recurring_schedules")
      .select(
        `*, delegator:profiles!recurring_schedules_delegator_id_fkey(id, first_name, last_name, username), receiver:profiles!recurring_schedules_receiver_id_fkey(id, first_name, last_name, username)`
      )
      .order("created_at", { ascending: false });

    if (req.user!.role !== "admin") {
      query = query.or(
        `delegator_id.eq.${req.user!.id},receiver_id.eq.${req.user!.id}`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    await generateDueOccurrences(50);
    const schedules = data || [];
    const finished = await completedCurrentOccurrenceIds(schedules);
    res.json({
      data: schedules.map((schedule) => ({
        ...schedule,
        current_occurrence_completed: finished.has(schedule.id),
      })),
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/:id", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: schedule, error } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!schedule) throw new AppError(404, "Schedule not found", "not_found");

    if (
      req.user!.role !== "admin" &&
      schedule.delegator_id !== req.user!.id &&
      schedule.receiver_id !== req.user!.id
    ) {
      throw new AppError(403, "Forbidden", "forbidden");
    }

    const { data: occurrences } = await admin
      .from("task_occurrences")
      .select("*, tasks(*)")
      .eq("recurring_schedule_id", schedule.id)
      .order("occurrence_date", { ascending: false })
      .limit(50);

    res.json({ schedule, occurrences: occurrences || [] });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/", requireRole("admin"), async (req: AuthedRequest, res) => {
  try {
    const body = createRecurringSchema.parse(req.body);
    if (
      body.frequency === "daily" &&
      istCalendarDay(body.start_date) !== istCalendarDay(body.end_date)
    ) {
      throw new AppError(
        400,
        "For daily frequency, start date and end date must be the same",
        "validation_error"
      );
    }
    if (istCalendarDay(body.end_date) < istCalendarDay(body.start_date)) {
      throw new AppError(
        400,
        "End date must be on or after the start date",
        "validation_error"
      );
    }
    if (isBeforeTodayIst(body.start_date) || isBeforeTodayIst(body.end_date)) {
      throw new AppError(400, "Dates must be today or in the future", "validation_error");
    }
    const time = body.time_of_day.length === 5 ? `${body.time_of_day}:00` : body.time_of_day;
    const endDate =
      body.frequency === "daily" ? istCalendarDay(body.start_date) : body.end_date;
    const admin = getAdminClient();
    const { data: receiver } = await admin
      .from("profiles")
      .select("work_days, first_name, last_name, username")
      .eq("id", body.receiver_id)
      .maybeSingle();
    if (!receiver) {
      throw new AppError(400, "Invalid receiver", "validation_error");
    }
    if (!canReceiveAssignedTasks(receiver)) {
      throw new AppError(
        400,
        "Tasks cannot be assigned to Schedule Tasks",
        "validation_error"
      );
    }
    const next = buildInitialNext({
      frequency: body.frequency,
      interval: body.interval,
      byweekday: body.byweekday ?? null,
      bymonthday: body.bymonthday ?? null,
      time_of_day: time,
      start_date: body.start_date,
      end_date: endDate ?? null,
      work_days: receiver.work_days === 6 ? 6 : 7,
    });
    const { data, error } = await admin
      .from("recurring_schedules")
      .insert({
        title: body.title.trim(),
        description: body.description.trim(),
        delegator_id: req.user!.id,
        receiver_id: body.receiver_id,
        approval_required: body.approval_required,
        frequency: body.frequency,
        interval: body.interval,
        byweekday: body.byweekday ?? null,
        bymonthday: body.bymonthday ?? null,
        time_of_day: time,
        start_date: body.start_date,
        end_date: endDate ?? null,
        next_occurrence_at: next,
        is_active: true,
        is_paused: false,
      })
      .select("*")
      .single();
    if (error) throw error;

    // Immediately generate if first occurrence is due
    await generateDueOccurrences(50);

    res.status(201).json({ schedule: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const body = updateRecurringSchema.parse(req.body);
    const admin = getAdminClient();
    const { data: existing, error: fetchError } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    if (existing.delegator_id !== req.user!.id && req.user!.role !== "admin") {
      throw new AppError(403, "Only the delegator can edit this schedule", "forbidden");
    }

    if (body.receiver_id !== undefined && body.receiver_id !== existing.receiver_id) {
      const { data: receiver } = await admin
        .from("profiles")
        .select("first_name, last_name, username")
        .eq("id", body.receiver_id)
        .maybeSingle();
      if (!receiver) {
        throw new AppError(400, "Invalid receiver", "validation_error");
      }
      if (!canReceiveAssignedTasks(receiver)) {
        throw new AppError(
          400,
          "Tasks cannot be assigned to Schedule Tasks",
          "validation_error"
        );
      }
    }

    const scope = body.scope || "future";

    if (scope === "this" && body.occurrence_task_id) {
      const updates: Record<string, unknown> = {};
      if (body.title !== undefined) updates.title = body.title.trim();
      if (body.description !== undefined) updates.description = body.description.trim();
      if (body.receiver_id !== undefined) updates.receiver_id = body.receiver_id;
      if (body.approval_required !== undefined) updates.approval_required = body.approval_required;

      const { data: task, error } = await admin
        .from("tasks")
        .update(updates)
        .eq("id", body.occurrence_task_id)
        .eq("recurring_schedule_id", existing.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!task) throw new AppError(404, "Occurrence task not found", "not_found");

      await logActivity({
        taskId: task.id,
        actorId: req.user!.id,
        action: "occurrence_updated",
        newValue: updates,
      });
      res.json({ task, schedule: existing });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.receiver_id !== undefined) updates.receiver_id = body.receiver_id;
    if (body.approval_required !== undefined) updates.approval_required = body.approval_required;
    if (body.frequency !== undefined) updates.frequency = body.frequency;
    if (body.interval !== undefined) updates.interval = body.interval;
    if (body.byweekday !== undefined) updates.byweekday = body.byweekday;
    if (body.bymonthday !== undefined) updates.bymonthday = body.bymonthday;
    if (body.time_of_day !== undefined) {
      updates.time_of_day =
        body.time_of_day.length === 5 ? `${body.time_of_day}:00` : body.time_of_day;
    }
    const anchor = await resolveRecurringEditAnchor(existing);
    const startLocked = anchor.kind === "pending" || anchor.kind === "overdue";
    let startDate = anchor.startDate;
    if (startLocked) {
      if (
        body.start_date !== undefined &&
        istCalendarDay(body.start_date) !== istCalendarDay(anchor.startDate)
      ) {
        throw new AppError(
          400,
          "Start date cannot be changed while this task is pending or overdue",
          "validation_error"
        );
      }
    } else if (body.start_date !== undefined) {
      const requested = istCalendarDay(body.start_date);
      if (requested <= todayIst()) {
        throw new AppError(400, "Start date must be a future date", "validation_error");
      }
      startDate = requested;
    }
    updates.start_date = startDate;
    const nextFrequency =
      (typeof updates.frequency === "string" ? updates.frequency : existing.frequency) as
        | typeof existing.frequency
        | undefined;
    if (body.end_date !== undefined) {
      const unchanged =
        Boolean(body.end_date) &&
        Boolean(existing.end_date) &&
        istCalendarDay(body.end_date as string) === istCalendarDay(existing.end_date);
      const dailySameDay =
        nextFrequency === "daily" &&
        Boolean(body.end_date) &&
        istCalendarDay(body.end_date as string) === istCalendarDay(startDate);
      if (body.end_date && isBeforeTodayIst(body.end_date) && !unchanged && !dailySameDay) {
        throw new AppError(400, "Dates must be today or in the future", "validation_error");
      }
      updates.end_date = body.end_date;
    }
    let nextEnd =
      updates.end_date !== undefined ? (updates.end_date as string | null) : existing.end_date;
    if (nextFrequency === "daily") {
      nextEnd = startDate;
      updates.end_date = startDate;
    }
    if (
      nextFrequency === "daily" &&
      nextEnd &&
      istCalendarDay(nextEnd) !== istCalendarDay(startDate)
    ) {
      throw new AppError(
        400,
        "For daily frequency, start date and end date must be the same",
        "validation_error"
      );
    }
    if (nextEnd && istCalendarDay(nextEnd) < istCalendarDay(startDate)) {
      throw new AppError(
        400,
        "End date must be on or after the start date",
        "validation_error"
      );
    }
    if (body.is_paused !== undefined) {
      if (req.user!.role !== "admin") {
        throw new AppError(403, "Only an admin can pause or resume a recurring task", "forbidden");
      }
      updates.is_paused = body.is_paused;
    }

    const { timingChanged } = recurrenceEditDelta(
      { ...existing, start_date: anchor.startDate },
      { ...body, start_date: startDate }
    );
    const receiverChanged =
      body.receiver_id !== undefined && body.receiver_id !== existing.receiver_id;
    if (existing.is_active && (timingChanged || receiverChanged)) {
      const endValue = nextEnd || startDate;
      const timeValue =
        typeof updates.time_of_day === "string" ? updates.time_of_day : existing.time_of_day;
      updates.next_occurrence_at = buildInitialNext({
        frequency: nextFrequency || existing.frequency,
        interval:
          typeof updates.interval === "number" ? updates.interval : existing.interval,
        time_of_day: String(timeValue),
        start_date: startDate,
        end_date: endValue,
      });
    }

    if (existing.is_paused && updates.is_paused === false) {
      const resumedStart =
        typeof updates.start_date === "string" ? updates.start_date : existing.start_date;
      const { data: occurred } = await admin
        .from("task_occurrences")
        .select("id")
        .eq("recurring_schedule_id", existing.id)
        .eq("occurrence_date", String(resumedStart).slice(0, 10))
        .maybeSingle();
      const { data: openTasks } = await admin
        .from("tasks")
        .select("id")
        .eq("recurring_schedule_id", existing.id)
        .eq("lifecycle", "active")
        .limit(1);
      if (occurred && (!openTasks || openTasks.length === 0)) {
        Object.assign(
          updates,
          fieldsForNextWindow({
            frequency: nextFrequency || existing.frequency,
            interval:
              typeof updates.interval === "number" ? updates.interval : existing.interval,
            time_of_day:
              typeof updates.time_of_day === "string" ? updates.time_of_day : existing.time_of_day,
            start_date: resumedStart,
            end_date:
              updates.end_date !== undefined
                ? (updates.end_date as string | null)
                : existing.end_date,
          })
        );
      }
    }

    const { data, error } = await admin
      .from("recurring_schedules")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

    await syncOpenRecurringTasks({
      scheduleId: data.id,
      title: data.title,
      description: data.description,
      receiverId: data.receiver_id,
      approvalRequired: data.approval_required,
      endDate: data.end_date,
      timeOfDay: String(data.time_of_day).slice(0, 8),
      actorId: req.user!.id,
    });

    await notifyUser({
      userId: data.receiver_id,
      type: "schedule_updated",
      title: "Recurring schedule updated",
      body: `"${data.title}" schedule was updated.`,
    });

    res.json({ schedule: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/pause", requireRole("admin"), async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    if (!existing.is_active) {
      throw new AppError(400, "This recurring task is already finished", "invalid_state");
    }
    const { data, error } = await admin
      .from("recurring_schedules")
      .update({ is_paused: true })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    res.json({ schedule: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/resume", requireRole("admin"), async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    if (!existing.is_active) {
      throw new AppError(400, "This recurring task is already finished", "invalid_state");
    }
    const updates: Record<string, unknown> = { is_paused: false };
    const { data: finished } = await admin
      .from("task_occurrences")
      .select("id")
      .eq("recurring_schedule_id", existing.id)
      .eq("occurrence_date", String(existing.start_date).slice(0, 10))
      .maybeSingle();
    const { data: openTasks } = await admin
      .from("tasks")
      .select("id")
      .eq("recurring_schedule_id", existing.id)
      .eq("lifecycle", "active")
      .limit(1);
    if (finished && (!openTasks || openTasks.length === 0)) {
      Object.assign(updates, fieldsForNextWindow(existing));
    }
    const { data, error } = await admin
      .from("recurring_schedules")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    res.json({ schedule: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/complete", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    const userId = req.user!.id;
    if (
      existing.receiver_id !== userId &&
      existing.delegator_id !== userId &&
      req.user!.role !== "admin"
    ) {
      throw new AppError(403, "Forbidden", "forbidden");
    }

    const schedule = await completeCurrentOccurrence(existing.id, userId);
    res.json({ schedule });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/cancel", requireRole("admin"), async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    const { data, error } = await admin
      .from("recurring_schedules")
      .update({ is_active: false, is_paused: true, next_occurrence_at: null })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    res.json({ schedule: data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
