import { Router } from "express";
import { createRecurringSchema, updateRecurringSchema } from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { buildInitialNext, generateDueOccurrences } from "../services/recurring";
import { logActivity, notifyUser } from "../lib/activity";

const router = Router();

router.use(requireAuth);

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
    res.json({ data });
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

router.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = createRecurringSchema.parse(req.body);
    const time = body.time_of_day.length === 5 ? `${body.time_of_day}:00` : body.time_of_day;
    const next = buildInitialNext({
      frequency: body.frequency,
      interval: body.interval,
      byweekday: body.byweekday ?? null,
      bymonthday: body.bymonthday ?? null,
      time_of_day: time,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
    });

    const admin = getAdminClient();
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
        end_date: body.end_date ?? null,
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
    if (body.end_date !== undefined) updates.end_date = body.end_date;
    if (body.is_paused !== undefined) updates.is_paused = body.is_paused;

    // Recompute next if schedule shape changed
    if (
      body.frequency ||
      body.interval ||
      body.byweekday !== undefined ||
      body.bymonthday !== undefined ||
      body.time_of_day ||
      body.end_date !== undefined
    ) {
      const merged = { ...existing, ...updates };
      updates.next_occurrence_at = buildInitialNext({
        frequency: merged.frequency,
        interval: merged.interval,
        byweekday: merged.byweekday,
        bymonthday: merged.bymonthday,
        time_of_day: String(merged.time_of_day).slice(0, 8),
        start_date: merged.start_date,
        end_date: merged.end_date,
      });
    }

    const { data, error } = await admin
      .from("recurring_schedules")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

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

router.post("/:id/pause", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    if (existing.delegator_id !== req.user!.id && req.user!.role !== "admin") {
      throw new AppError(403, "Forbidden", "forbidden");
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

router.post("/:id/resume", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    if (existing.delegator_id !== req.user!.id && req.user!.role !== "admin") {
      throw new AppError(403, "Forbidden", "forbidden");
    }
    const { data, error } = await admin
      .from("recurring_schedules")
      .update({ is_paused: false })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    res.json({ schedule: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/cancel", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from("recurring_schedules")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!existing) throw new AppError(404, "Schedule not found", "not_found");
    if (existing.delegator_id !== req.user!.id && req.user!.role !== "admin") {
      throw new AppError(403, "Forbidden", "forbidden");
    }
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
