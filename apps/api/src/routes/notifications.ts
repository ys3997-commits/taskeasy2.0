import { Router } from "express";
import { getAdminClient } from "../lib/supabase";
import { sendError } from "../lib/errors";
import { AuthedRequest, requireAuth, requirePasswordChanged } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requirePasswordChanged);

router.get("/", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", req.user!.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/read", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("user_id", req.user!.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    res.json({ notification: data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/read-all", async (req: AuthedRequest, res) => {
  try {
    const admin = getAdminClient();
    const { error } = await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", req.user!.id)
      .is("read_at", null);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
