import { Router } from "express";
import { changePasswordSchema, loginSchema } from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { config } from "../config";
import { createClient } from "@supabase/supabase-js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const admin = getAdminClient();
    let email = body.identifier.trim();

    if (!email.includes("@")) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email, is_active")
        .eq("username", email.toLowerCase())
        .maybeSingle();
      if (!profile) throw new AppError(401, "Invalid credentials", "invalid_credentials");
      if (!profile.is_active) {
        throw new AppError(403, "Account is deactivated", "account_inactive");
      }
      email = profile.email;
    }

    const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({
      email,
      password: body.password,
    });
    if (error || !data.session) {
      throw new AppError(401, "Invalid credentials", "invalid_credentials");
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      throw new AppError(403, "Account is deactivated", "account_inactive");
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: profile,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

router.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const admin = getAdminClient();
    const userId = req.user!.id;

    if (req.user!.must_change_password && !body.currentPassword) {
      // First-time forced change allowed without current password when flagged
    } else if (body.currentPassword) {
      const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await anon.auth.signInWithPassword({
        email: req.user!.email,
        password: body.currentPassword,
      });
      if (error) throw new AppError(400, "Current password is incorrect", "bad_password");
    } else {
      throw new AppError(400, "Current password is required", "validation_error");
    }

    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: body.newPassword,
    });
    if (error) throw new AppError(400, error.message, "password_update_failed");

    await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", userId);

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
