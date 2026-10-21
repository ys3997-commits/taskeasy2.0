import { Router } from "express";
import { istDateString } from "@rajshree/shared";
import { getAdminClient } from "../lib/supabase";
import { AppError, sendError } from "../lib/errors";
import { AuthedRequest, requireAuth, requirePasswordChanged } from "../middleware/auth";

type SessionRow = { id: string; user_id: string; logged_in_at: string };

/** Earliest sign-in for each member on each IST calendar day. */
function firstLoginPerDay(sessions: SessionRow[]): SessionRow[] {
  const earliest = new Map<string, SessionRow>();
  for (const session of sessions) {
    const key = `${session.user_id}:${istDateString(new Date(session.logged_in_at))}`;
    const current = earliest.get(key);
    if (
      !current ||
      new Date(session.logged_in_at).getTime() < new Date(current.logged_in_at).getTime()
    ) {
      earliest.set(key, session);
    }
  }
  return [...earliest.values()].sort((a, b) => b.logged_in_at.localeCompare(a.logged_in_at));
}

const router = Router();

router.use(requireAuth, requirePasswordChanged);

router.get("/", async (req: AuthedRequest, res) => {
  try {
    const isAdmin = req.user!.role === "admin";
    const requested = typeof req.query.user_id === "string" ? req.query.user_id : "";
    if (
      requested &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested)
    ) {
      throw new AppError(400, "Invalid member", "validation_error");
    }
    if (!isAdmin && requested && requested !== req.user!.id) {
      throw new AppError(403, "You can only view your own time tracking", "forbidden");
    }
    const userId = isAdmin ? requested : req.user!.id;

    const admin = getAdminClient();
    const sessions: SessionRow[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 10; page += 1) {
      let query = admin
        .from("login_sessions")
        .select("id, user_id, logged_in_at")
        .order("logged_in_at", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error) {
        console.error(error);
        const missingTable =
          error.code === "PGRST205" || error.message.includes("login_sessions");
        throw new AppError(
          500,
          missingTable
            ? "Time tracking is not set up yet. Apply the latest database migration, then sign in again."
            : "Could not load time tracking",
          missingTable ? "misconfigured" : "query_failed"
        );
      }
      sessions.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    const firstLogins = firstLoginPerDay(sessions);

    const ids = [...new Set(firstLogins.map((session) => session.user_id))];
    const profilesById = new Map<
      string,
      { id: string; first_name: string; last_name: string; username: string }
    >();
    if (ids.length) {
      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("id, first_name, last_name, username")
        .in("id", ids);
      if (profileError) {
        console.error(profileError);
        throw new AppError(500, "Could not load time tracking", "query_failed");
      }
      for (const profile of profiles || []) profilesById.set(profile.id, profile);
    }

    res.json({
      data: firstLogins.map((session) => ({
        ...session,
        user: profilesById.get(session.user_id) ?? null,
      })),
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
