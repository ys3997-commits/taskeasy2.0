import { Router } from "express";
import {
  approvalDecisionSchema,
  createTaskSchema,
  rejectTaskSchema,
  taskListQuerySchema,
  updateTaskSchema,
} from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { logActivity, notifyUser } from "../lib/activity";
import {
  canViewTask,
  dashboardSummary,
  getTaskById,
  listTasks,
} from "../services/tasks";

const router = Router();

router.use(requireAuth);

router.get("/dashboard/summary", async (req: AuthedRequest, res) => {
  try {
    const summary = await dashboardSummary(req.user!.id, req.user!.role);
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/", async (req: AuthedRequest, res) => {
  try {
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
    const deadline = new Date(body.deadline);
    if (Number.isNaN(deadline.getTime())) {
      throw new AppError(400, "Invalid deadline", "validation_error");
    }

    const rows = body.receiver_ids.map((receiverId) => ({
      title: body.title.trim(),
      description: body.description.trim(),
      task_type: "one_time" as const,
      delegator_id: req.user!.id,
      receiver_id: receiverId,
      deadline: deadline.toISOString(),
      lifecycle: "active" as const,
      approval_required: body.approval_required,
    }));

    const { data, error } = await admin.from("tasks").insert(rows).select("*");
    if (error) throw error;

    for (const task of data || []) {
      await logActivity({
        taskId: task.id,
        actorId: req.user!.id,
        action: "created",
        newValue: { title: task.title, receiver_id: task.receiver_id },
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

    res.status(201).json({ data });
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

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.receiver_id !== undefined) updates.receiver_id = body.receiver_id;
    if (body.deadline !== undefined) updates.deadline = new Date(body.deadline).toISOString();
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

    await admin.from("task_approvals").insert({
      task_id: data.id,
      submitted_by: req.user!.id,
      approver_id: data.delegator_id,
      decision: "pending",
      submitted_at: now,
    });

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

    res.json({ task: data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
