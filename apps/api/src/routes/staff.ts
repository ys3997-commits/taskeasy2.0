import { Router } from "express";
import {
  baseUsername,
  capitalizeName,
  createStaffSchema,
  nextUniqueUsername,
  updateStaffSchema,
} from "@rajshree/shared";
import { z } from "zod";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import { generateTemporaryPassword } from "../lib/password";
import {
  AuthedRequest,
  requireAuth,
  requirePasswordChanged,
  requireRole,
} from "../middleware/auth";
import { realignReceiverSchedules } from "../services/recurring";
import { listBoxTasks, membersDetailsSummary } from "../services/tasks";
import { cachedValue, invalidateCachePrefix } from "../lib/response-cache";

const router = Router();

router.use(requireAuth, requirePasswordChanged);

router.get("/", requireRole("admin"), async (_req, res) => {
  try {
    const payload = await cachedValue("staff:all", 30_000, async () => {
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("profiles")
        .select("*")
        .order("last_name", { ascending: true });
      if (error) throw error;
      return { data };
    });
    res.json(payload);
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/active", requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const payload = await cachedValue("staff:active", 60_000, async () => {
      const admin = getAdminClient();
      const { data, error } = await admin
        .from("profiles")
        .select("id, first_name, last_name, username, role, is_active")
        .eq("is_active", true)
        .order("first_name", { ascending: true });
      if (error) throw error;
      return { data };
    });
    res.json(payload);
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/details-summary", requireRole("admin"), async (_req, res) => {
  try {
    const data = await cachedValue("staff:details-summary", 20_000, () =>
      membersDetailsSummary()
    );
    res.json({ data });
  } catch (err) {
    sendError(res, err);
  }
});

const boxTasksQuerySchema = z.object({
  side: z.enum(["assigned", "delegated"]),
  status: z.enum(["pending", "overdue", "sent_for_approval"]),
  member_id: z.string().uuid().optional(),
});

router.get("/box-tasks", requireRole("admin"), async (req, res) => {
  try {
    const query = boxTasksQuerySchema.parse(req.query);
    const data = await cachedValue(
      `staff:box-tasks:${query.side}:${query.status}:${query.member_id || "all"}`,
      15_000,
      () =>
        listBoxTasks({
          side: query.side,
          status: query.status,
          memberId: query.member_id,
        })
    );
    if (query.member_id && !data.member) {
      throw new AppError(404, "Member not found", "not_found");
    }
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/", requireRole("admin"), async (req: AuthedRequest, res) => {
  try {
    const body = createStaffSchema.parse(req.body);
    const admin = getAdminClient();
    const base = baseUsername(body.first_name, body.last_name);

    const { data: existing } = await admin
      .from("profiles")
      .select("username")
      .ilike("username", `${base}%`);

    const username = nextUniqueUsername(
      base,
      (existing || []).map((r) => r.username)
    );
    const authEmail = `${username}@users.rajshree.internal`;

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: authEmail,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        first_name: body.first_name,
        last_name: body.last_name,
        username,
      },
    });
    if (authError || !authUser.user) {
      throw new AppError(400, authError?.message || "Failed to create auth user", "auth_create_failed");
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        id: authUser.user.id,
        first_name: capitalizeName(body.first_name),
        last_name: capitalizeName(body.last_name),
        username,
        email: authEmail,
        role: body.role || "staff",
        work_days: body.work_days,
        is_active: true,
        must_change_password: true,
      })
      .select("*")
      .single();

    if (profileError) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      throw new AppError(400, profileError.message, "profile_create_failed");
    }

    invalidateCachePrefix("staff:");
    res.status(201).json({
      user: profile,
      login_instructions:
        "They can sign in with this username and the password you set, then must change it on first login.",
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.patch("/:id", requireRole("admin"), async (req, res) => {
  try {
    const body = updateStaffSchema.parse(req.body);
    const admin = getAdminClient();
    const updates: Record<string, unknown> = {};
    if (body.first_name !== undefined) updates.first_name = capitalizeName(body.first_name);
    if (body.last_name !== undefined) updates.last_name = capitalizeName(body.last_name);
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.role !== undefined) updates.role = body.role;
    if (body.work_days !== undefined) updates.work_days = body.work_days;

    if (body.password) {
      const { error: passwordError } = await admin.auth.admin.updateUserById(req.params.id, {
        password: body.password,
      });
      if (passwordError) {
        throw new AppError(400, passwordError.message, "password_update_failed");
      }
      updates.must_change_password = true;
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError(400, "No changes provided", "validation_error");
    }

    const { data, error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError(404, "Staff member not found", "not_found");
    if (body.work_days !== undefined) {
      await realignReceiverSchedules(req.params.id, body.work_days);
    }
    if (body.is_active === false) {
      await admin.auth.admin.updateUserById(req.params.id, { ban_duration: "876000h" });
    }
    if (body.is_active === true) {
      await admin.auth.admin.updateUserById(req.params.id, { ban_duration: "none" });
    }

    invalidateCachePrefix("staff:");
    res.json({ user: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/reset-password", requireRole("admin"), async (req: AuthedRequest, res) => {
  try {
    if (req.params.id === req.user!.id) {
      throw new AppError(
        400,
        "Use change password for your own account",
        "cannot_reset_self"
      );
    }

    const admin = getAdminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, username")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new AppError(404, "Team member not found", "not_found");

    const temporaryPassword = generateTemporaryPassword();
    const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, {
      password: temporaryPassword,
    });
    if (passwordError) {
      throw new AppError(400, passwordError.message, "password_update_failed");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", profile.id);
    if (profileError) throw profileError;

    res.json({
      username: profile.username,
      temporary_password: temporaryPassword,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/:id/tasks", requireRole("admin"), async (req, res) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(400, "Invalid member", "validation_error");
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .select("*")
      .or(`receiver_id.eq.${id.data},delegator_id.eq.${id.data}`)
      .or("lifecycle.neq.completed,cancelled_at.is.null")
      .order("deadline", { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
