import { Router } from "express";
import {
  baseUsername,
  createStaffSchema,
  nextUniqueUsername,
  updateStaffSchema,
} from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";
import { generateTemporaryPassword } from "../lib/password";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("admin"), async (_req, res) => {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("*")
      .order("last_name", { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/active", requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, first_name, last_name, username, role, is_active")
      .eq("is_active", true)
      .order("first_name", { ascending: true });
    if (error) throw error;
    res.json({ data });
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
    const tempPassword = generateTemporaryPassword();

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: body.email.toLowerCase(),
      password: tempPassword,
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
        first_name: body.first_name.trim(),
        last_name: body.last_name.trim(),
        username,
        email: body.email.toLowerCase(),
        role: body.role || "staff",
        is_active: true,
        must_change_password: true,
      })
      .select("*")
      .single();

    if (profileError) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      throw new AppError(400, profileError.message, "profile_create_failed");
    }

    res.status(201).json({
      user: profile,
      temporary_password: tempPassword,
      login_instructions:
        "Share the username and temporary password securely. The user must change their password on first login.",
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
    if (body.first_name !== undefined) updates.first_name = body.first_name.trim();
    if (body.last_name !== undefined) updates.last_name = body.last_name.trim();
    if (body.email !== undefined) updates.email = body.email.toLowerCase();
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.role !== undefined) updates.role = body.role;

    const { data, error } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", req.params.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError(404, "Staff member not found", "not_found");

    if (body.email) {
      await admin.auth.admin.updateUserById(req.params.id, {
        email: body.email.toLowerCase(),
      });
    }
    if (body.is_active === false) {
      await admin.auth.admin.updateUserById(req.params.id, { ban_duration: "876000h" });
    }
    if (body.is_active === true) {
      await admin.auth.admin.updateUserById(req.params.id, { ban_duration: "none" });
    }

    res.json({ user: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/:id/tasks", requireRole("admin"), async (req, res) => {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .select("*")
      .or(`receiver_id.eq.${req.params.id},delegator_id.eq.${req.params.id}`)
      .order("deadline", { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
