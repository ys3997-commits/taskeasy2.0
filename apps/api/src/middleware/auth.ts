import { NextFunction, Request, Response } from "express";
import type { Profile, UserRole } from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";

export interface AuthedRequest extends Request {
  user?: Profile;
  accessToken?: string;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "Missing authorization token", "unauthorized");
    }
    const token = header.slice(7);
    const admin = getAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) {
      throw new AppError(401, "Invalid or expired token", "unauthorized");
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      throw new AppError(401, "Profile not found", "unauthorized");
    }
    if (!profile.is_active) {
      throw new AppError(403, "Account is deactivated", "account_inactive");
    }

    req.user = profile as Profile;
    req.accessToken = token;
    next();
  } catch (err) {
    sendError(res, err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new AppError(401, "Unauthorized", "unauthorized");
      if (!roles.includes(req.user.role)) {
        throw new AppError(403, "Insufficient permissions", "forbidden");
      }
      next();
    } catch (err) {
      sendError(res, err);
    }
  };
}

export function requireCron(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      throw new AppError(500, "CRON_SECRET not configured", "misconfigured");
    }
    const header = req.headers.authorization;
    const querySecret =
      typeof req.query.secret === "string" ? req.query.secret : undefined;
    if (header === `Bearer ${secret}` || querySecret === secret) {
      next();
      return;
    }
    throw new AppError(401, "Invalid cron credentials", "unauthorized");
  } catch (err) {
    sendError(res, err);
  }
}
