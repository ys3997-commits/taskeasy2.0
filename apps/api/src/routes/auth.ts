import { Router } from "express";
import { changePasswordSchema, loginSchema } from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { clearCachedAuthProfile, setCachedAuthProfile } from "../lib/auth-cache";
import { config } from "../config";
import { recordLogin } from "../lib/sessions";
import { createClient } from "@supabase/supabase-js";
import type { Profile } from "@rajshree/shared";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const admin = getAdminClient();
    const username = body.username.trim().toLowerCase();

    const { data: loginProfile } = await admin
      .from("profiles")
      .select("email, is_active")
      .eq("username", username)
      .maybeSingle();
    if (!loginProfile) throw new AppError(401, "Invalid credentials", "invalid_credentials");
    if (!loginProfile.is_active) {
      throw new AppError(403, "Account is deactivated", "account_inactive");
    }

    const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({
      email: loginProfile.email,
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

    await recordLogin(profile.id);
    setCachedAuthProfile(data.session.access_token, profile as Profile);

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

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken =
      typeof req.body?.refresh_token === "string" ? req.body.refresh_token.trim() : "";
    if (!refreshToken) {
      throw new AppError(400, "refresh_token is required", "validation_error");
    }

    const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      throw new AppError(401, "Session expired. Please sign in again.", "unauthorized");
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", data.session.user.id)
      .maybeSingle();
    if (!profile || !profile.is_active) {
      throw new AppError(403, "Account is deactivated", "account_inactive");
    }

    setCachedAuthProfile(data.session.access_token, profile as Profile);

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

    if (req.accessToken && req.user) {
      setCachedAuthProfile(req.accessToken, {
        ...req.user,
        must_change_password: false,
      });
    } else {
      clearCachedAuthProfile(req.accessToken);
    }

    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
