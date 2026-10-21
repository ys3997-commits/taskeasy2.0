import { Router } from "express";
import {
  approvalDecisionSchema,
  canReceiveAssignedTasks,
  createTaskSchema,
  discardTaskAttachmentsSchema,
  isBeforeTodayIst,
  istCalendarDay,
  parseAsIst,
  prepareTaskAttachmentsSchema,
  rejectTaskSchema,
  taskListQuerySchema,
  updateTaskSchema,
} from "@rajshree/shared";
import { z } from "zod";
import {
  attachmentLinksForTasks,
  commitTaskAttachments,
  discardPendingAttachments,
  prepareAttachmentUploads,
  removeTaskAttachments,
  stageTaskAttachments,
} from "../lib/attachments";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import {
  AuthedRequest,
  requireAuth,
  requirePasswordChanged,
  requireRole,
} from "../middleware/auth";
import { logActivity, notifyUser } from "../lib/activity";
import { scheduleNextAfterCompletion } from "../services/recurring";
import { scheduleDueOccurrences } from "../lib/occurrence-runner";
import { cachedValue, invalidateCachePrefix } from "../lib/response-cache";
import {
  canViewTask,
  dashboardSummary,
  getTaskById,
  listOverdueTasks,
  listTasks,
} from "../services/tasks";

const router = Router();

router.use(requireAuth, requirePasswordChanged);

function bustTaskCaches() {
  invalidateCachePrefix("dashboard:");
  invalidateCachePrefix("staff:details-summary");
  invalidateCachePrefix("recurring-list:");
}

router.get("/overdue", requireRole("admin"), async (_req: AuthedRequest, res) => {
  try {
    const data = await listOverdueTasks();
    res.json({ data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/dashboard/summary", async (req: AuthedRequest, res) => {
  try {
    const summary = await cachedValue(
      `dashboard:${req.user!.id}`,
      30_000,
      () => dashboardSummary(req.user!.id, req.user!.role)
    );
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/", async (req: AuthedRequest, res) => {
  try {
    scheduleDueOccurrences(50);
    const query = taskListQuerySchema.parse(req.query);
    if (query.view === "all" && req.user!.role !== "admin") {
      // staff may still use all as union of received+delegated — listTasks handles it
    }
    const result = await listTasks({
      ...query,
      userId: req.user!.id,
      role: req.user!.role,
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = createTaskSchema.parse(req.body);
    const admin = getAdminClient();
    const deadline = parseAsIst(body.deadline);
    if (Number.isNaN(deadline.getTime())) {
      throw new AppError(400, "Invalid deadline", "validation_error");
    }
    if (isBeforeTodayIst(deadline)) {
      throw new AppError(
        400,
        "Deadline must be today or a future date",
        "validation_error"
      );
    }

    const { data: receivers, error: receiversError } = await admin
      .from("profiles")
      .select("id, first_name, last_name, username")
      .in("id", body.receiver_ids);
    if (receiversError) throw receiversError;
    if (!receivers?.length || receivers.length !== body.receiver_ids.length) {
      throw new AppError(400, "Invalid receiver", "validation_error");
    }
    if (receivers.some((receiver) => !canReceiveAssignedTasks(receiver))) {
      throw new AppError(
        400,
        "Tasks cannot be assigned to Schedule Tasks",
        "validation_error"
      );
    }

    const rows = body.receiver_ids.map((receiverId) => ({
      title: body.title.trim(),
      description: body.description.trim(),
      delegator_id: req.user!.id,
      receiver_id: receiverId,
      deadline: deadline.toISOString(),
      lifecycle: "active" as const,
      approval_required: body.approval_required,
    }));

    const staged = body.attachment_paths?.length
      ? await stageTaskAttachments(req.user!.id, body.attachment_paths)
      : [];

    const { data, error } = await admin.from("tasks").insert(rows).select("*");
    if (error) throw error;

    const created = data || [];
    if (staged.length) {
      try {
        await commitTaskAttachments(
          created.map((task) => task.id),
          staged
        );
      } catch (err) {
        await admin.from("tasks").delete().in(
          "id",
          created.map((task) => task.id)
        );
        throw err;
      }
    }

    for (const task of created) {
      await logActivity({
        taskId: task.id,
        actorId: req.user!.id,
        action: "created",
        newValue: {
          title: task.title,
          receiver_id: task.receiver_id,
          attachments: staged.map((file) => file.fileName),
        },
      });
      if (task.receiver_id !== req.user!.id) {
        await notifyUser({
          userId: task.receiver_id,
          type: "task_assigned",
          title: "New task assigned",
          body: `"${task.title}" has been assigned to you.`,
          relatedTaskId: task.id,
        });
      }
    }

    bustTaskCaches();
    res.status(201).json({ data: created });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/attachment-uploads", async (req: AuthedRequest, res) => {
  try {
    const body = prepareTaskAttachmentsSchema.parse(req.body);
    const uploads = await prepareAttachmentUploads(req.user!.id, body.files);
    res.json({ uploads });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/attachment-uploads/discard", async (req: AuthedRequest, res) => {
  try {
    const body = discardTaskAttachmentsSchema.parse(req.body);
    await discardPendingAttachments(req.user!.id, body.paths);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/attachments", async (req: AuthedRequest, res) => {
  try {
    const ids = [
      ...new Set(
        String(req.query.ids || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ];
    if (ids.length === 0) {
      res.json({ data: {} });
      return;
    }
    if (ids.length > 50 || ids.some((id) => !z.string().uuid().safeParse(id).success)) {
      throw new AppError(400, "Invalid attachment request", "validation_error");
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .select("id, receiver_id, delegator_id")
      .in("id", ids);
    if (error) throw error;

    const allowed = (data || [])
      .filter((task) => canViewTask(task, req.user!.id, req.user!.role))
      .map((task) => task.id as string);
    const attachments = await attachmentLinksForTasks(allowed);
    res.json({ data: attachments });
  } catch (err) {
    sendError(res, err);
  }
});

async function pendingApprovalTaskIds() {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("task_approvals")
    .select("task_id")
    .eq("decision", "pending");
  if (error) throw error;
  return [...new Set((data || []).map((row) => row.task_id as string))];
}

function excludePending<T extends { not: (column: string, operator: string, value: string) => T }>(
  query: T,
  protectedIds: string[]
) {
  if (protectedIds.length === 0) return query;
  return query.not("id", "in", `(${protectedIds.join(",")})`);
}

router.get("/completed/count", requireRole("admin"), async (_req, res) => {
  try {
    const admin = getAdminClient();
    const protectedIds = await pendingApprovalTaskIds();
    const [completedResult, cancelledResult, awaitingResult] = await Promise.all([
      excludePending(
        admin.from("tasks").select("id", { count: "exact", head: true }).eq("lifecycle", "completed"),
        protectedIds
      ),
      excludePending(
        admin.from("tasks").select("id", { count: "exact", head: true }).eq("lifecycle", "cancelled"),
        protectedIds
      ),
      admin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("lifecycle", "awaiting_approval"),
    ]);
    if (completedResult.error) throw completedResult.error;
    if (cancelledResult.error) throw cancelledResult.error;
    if (awaitingResult.error) throw awaitingResult.error;
    res.json({
      completed: completedResult.count ?? 0,
      cancelled: cancelledResult.count ?? 0,
      pendingApproval: awaitingResult.count ?? 0,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/completed/clear", requireRole("admin"), async (_req, res) => {
  try {
    const admin = getAdminClient();
    const protectedIds = await pendingApprovalTaskIds();
    let completed = 0;
    let cancelled = 0;

    for (let batch = 0; batch < 50; batch += 1) {
      const query = excludePending(
        admin.from("tasks").delete().in("lifecycle", ["completed", "cancelled"]),
        protectedIds
      );
      const { data, error } = await query.select("id, lifecycle");
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) break;
      await removeTaskAttachments(rows.map((row) => row.id as string));
      completed += rows.filter((row) => row.lifecycle === "completed").length;
      cancelled += rows.filter((row) => row.lifecycle === "cancelled").length;
    }

    bustTaskCaches();
    res.json({ deleted: completed + cancelled, completed, cancelled });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/:id", async (req: AuthedRequest, res) => {
  try {
    const task = await getTaskById(req.params.id);
    if (!task) throw new AppError(404, "Task not found", "not_found");
    if (!canViewTask(task, req.user!.id, req.user!.role)) {
      throw new AppError(403, "You do not have access to this task", "forbidden");
    }

    const admin = getAdminClient();
    const [{ data: approvals }, { data: activity }] = await Promise.all([
      admin
        .from("task_approvals")
        .select("*")
        .eq("task_id", task.id)
        .order("submitted_at", { ascending: false }),
      admin
        .from("task_activity_log")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at", { ascending: false }),
    ]);

    res.json({ task, approvals: approvals || [], activity: activity || [] });
  } catch (err) {
    sendError(res, err);
  }
});

router.patch("/:id", async (req: AuthedRequest, res) => {
  try {
    const body = updateTaskSchema.parse(req.body);
    const existing = await getTaskById(req.params.id);
    if (!existing) throw new AppError(404, "Task not found", "not_found");

    const isAdmin = req.user!.role === "admin";
    const isDelegator = existing.delegator_id === req.user!.id;
    if (!isAdmin && !isDelegator) {
      throw new AppError(403, "Only the delegator can edit this task", "forbidden");
    }
    if (existing.lifecycle === "cancelled" || existing.lifecycle === "completed") {
      throw new AppError(400, "Cannot edit a completed or cancelled task", "invalid_state");
    }

    if (body.receiver_id !== undefined && body.receiver_id !== existing.receiver_id) {
      const admin = getAdminClient();
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

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.receiver_id !== undefined) updates.receiver_id = body.receiver_id;
    if (body.deadline !== undefined) {
      const deadline = parseAsIst(body.deadline);
      if (Number.isNaN(deadline.getTime())) {
        throw new AppError(400, "Invalid deadline", "validation_error");
      }
      if (
        isBeforeTodayIst(deadline) &&
        istCalendarDay(deadline) !== istCalendarDay(existing.deadline)
      ) {
        throw new AppError(
          400,
          "Deadline must be today or a future date",
          "validation_error"
        );
      }
      updates.deadline = deadline.toISOString();
    }
    if (body.approval_required !== undefined) updates.approval_required = body.approval_required;

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .update(updates)
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw error;

    await logActivity({
      taskId: data.id,
      actorId: req.user!.id,
      action: "updated",
      previousValue: {
        title: existing.title,
        deadline: existing.deadline,
        receiver_id: existing.receiver_id,
      },
      newValue: updates,
    });

    if (body.deadline || body.receiver_id) {
      await notifyUser({
        userId: data.receiver_id,
        type: "task_updated",
        title: "Task updated",
        body: `"${data.title}" was updated.`,
        relatedTaskId: data.id,
      });
    }

    bustTaskCaches();
    res.json({ task: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/cancel", async (req: AuthedRequest, res) => {
  try {
    const existing = await getTaskById(req.params.id);
    if (!existing) throw new AppError(404, "Task not found", "not_found");
    const isAdmin = req.user!.role === "admin";
    const isDelegator = existing.delegator_id === req.user!.id;
    if (!isAdmin && !isDelegator) {
      throw new AppError(403, "Only the delegator can cancel this task", "forbidden");
    }
    if (existing.lifecycle === "cancelled" || existing.lifecycle === "completed") {
      throw new AppError(400, "Task is already closed", "invalid_state");
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .update({ lifecycle: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw error;

    await logActivity({
      taskId: data.id,
      actorId: req.user!.id,
      action: "cancelled",
      previousValue: { lifecycle: existing.lifecycle },
      newValue: { lifecycle: "cancelled" },
    });
    await notifyUser({
      userId: data.receiver_id,
      type: "task_cancelled",
      title: "Task cancelled",
      body: `"${data.title}" was cancelled.`,
      relatedTaskId: data.id,
    });
    if (existing.recurring_schedule_id) {
      await scheduleNextAfterCompletion(
        existing.recurring_schedule_id,
        new Date(existing.deadline)
      );
    }

    bustTaskCaches();
    res.json({ task: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/complete", async (req: AuthedRequest, res) => {
  try {
    const existing = await getTaskById(req.params.id);
    if (!existing) throw new AppError(404, "Task not found", "not_found");
    if (existing.receiver_id !== req.user!.id && req.user!.role !== "admin") {
      throw new AppError(403, "Only the receiver can complete this task", "forbidden");
    }
    if (existing.lifecycle !== "active") {
      throw new AppError(400, "Task cannot be completed in its current state", "invalid_state");
    }

    const admin = getAdminClient();
    const now = new Date().toISOString();

    if (!existing.approval_required) {
      const { data, error } = await admin
        .from("tasks")
        .update({ lifecycle: "completed", completed_at: now })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      await logActivity({
        taskId: data.id,
        actorId: req.user!.id,
        action: "completed",
        newValue: { lifecycle: "completed" },
      });
      await notifyUser({
        userId: data.delegator_id,
        type: "task_completed",
        title: "Task completed",
        body: `"${data.title}" was marked completed.`,
        relatedTaskId: data.id,
      });
      if (existing.recurring_schedule_id) {
        await scheduleNextAfterCompletion(
          existing.recurring_schedule_id,
          new Date(existing.deadline)
        );
      }
      bustTaskCaches();
      res.json({ task: data });
      return;
    }

    const { data, error } = await admin
      .from("tasks")
      .update({ lifecycle: "awaiting_approval", submitted_at: now })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

    const { error: approvalError } = await admin.from("task_approvals").insert({
      task_id: data.id,
      submitted_by: req.user!.id,
      approver_id: data.delegator_id,
      decision: "pending",
      submitted_at: now,
    });
    if (approvalError) throw approvalError;

    await logActivity({
      taskId: data.id,
      actorId: req.user!.id,
      action: "submitted_for_approval",
      newValue: { lifecycle: "awaiting_approval" },
    });
    await notifyUser({
      userId: data.delegator_id,
      type: "approval_requested",
      title: "Task awaiting approval",
      body: `"${data.title}" was submitted for your approval.`,
      relatedTaskId: data.id,
    });

    bustTaskCaches();
    res.json({ task: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/approve", async (req: AuthedRequest, res) => {
  try {
    const body = approvalDecisionSchema.parse(req.body || {});
    const existing = await getTaskById(req.params.id);
    if (!existing) throw new AppError(404, "Task not found", "not_found");
    if (existing.delegator_id !== req.user!.id) {
      throw new AppError(403, "Only the delegator can approve this task", "forbidden");
    }
    if (existing.lifecycle !== "awaiting_approval") {
      throw new AppError(400, "Task is not awaiting approval", "invalid_state");
    }

    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("tasks")
      .update({ lifecycle: "completed", completed_at: now })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

    await admin
      .from("task_approvals")
      .update({
        decision: "approved",
        comments: body.comments || null,
        approver_id: req.user!.id,
        decided_at: now,
      })
      .eq("task_id", existing.id)
      .eq("decision", "pending");

    await logActivity({
      taskId: data.id,
      actorId: req.user!.id,
      action: "approved",
      newValue: { comments: body.comments || null },
    });
    await notifyUser({
      userId: data.receiver_id,
      type: "task_approved",
      title: "Task approved",
      body: `"${data.title}" was approved.`,
      relatedTaskId: data.id,
    });
    if (existing.recurring_schedule_id) {
      await scheduleNextAfterCompletion(
        existing.recurring_schedule_id,
        new Date(existing.deadline)
      );
    }

    bustTaskCaches();
    res.json({ task: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/reject", async (req: AuthedRequest, res) => {
  try {
    const body = rejectTaskSchema.parse(req.body);
    const existing = await getTaskById(req.params.id);
    if (!existing) throw new AppError(404, "Task not found", "not_found");
    if (existing.delegator_id !== req.user!.id) {
      throw new AppError(403, "Only the delegator can reject this task", "forbidden");
    }
    if (existing.lifecycle !== "awaiting_approval") {
      throw new AppError(400, "Task is not awaiting approval", "invalid_state");
    }

    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("tasks")
      .update({ lifecycle: "active", submitted_at: null })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

    await admin
      .from("task_approvals")
      .update({
        decision: "rejected",
        comments: body.comments,
        approver_id: req.user!.id,
        decided_at: now,
      })
      .eq("task_id", existing.id)
      .eq("decision", "pending");

    await logActivity({
      taskId: data.id,
      actorId: req.user!.id,
      action: "rejected",
      newValue: { comments: body.comments },
    });
    await notifyUser({
      userId: data.receiver_id,
      type: "task_rejected",
      title: "Task rejected",
      body: `"${data.title}" was rejected: ${body.comments}`,
      relatedTaskId: data.id,
    });

    bustTaskCaches();
    res.json({ task: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/reopen", async (req: AuthedRequest, res) => {
  try {
    const existing = await getTaskById(req.params.id);
    if (!existing) throw new AppError(404, "Task not found", "not_found");
    if (existing.delegator_id !== req.user!.id) {
      throw new AppError(403, "Only the delegator can send this task back", "forbidden");
    }
    if (existing.lifecycle !== "awaiting_approval") {
      throw new AppError(400, "Task is not awaiting approval", "invalid_state");
    }

    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("tasks")
      .update({ lifecycle: "active", submitted_at: null })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;

    const { error: approvalError } = await admin
      .from("task_approvals")
      .update({
        decision: "rejected",
        comments: "Sent back to in progress",
        approver_id: req.user!.id,
        decided_at: now,
      })
      .eq("task_id", existing.id)
      .eq("decision", "pending");
    if (approvalError) throw approvalError;

    await logActivity({
      taskId: data.id,
      actorId: req.user!.id,
      action: "retasked",
      newValue: { lifecycle: "active" },
    });
    await notifyUser({
      userId: data.receiver_id,
      type: "task_retasked",
      title: "Task sent back",
      body: `"${data.title}" was sent back to in progress.`,
      relatedTaskId: data.id,
    });

    bustTaskCaches();
    res.json({ task: data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
