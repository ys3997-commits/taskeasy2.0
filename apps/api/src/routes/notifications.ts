import { Router } from "express";
import { clearAllNotifications } from "../lib/activity";
import { sendError } from "../lib/errors";
import {
  AuthedRequest,
  requireAuth,
  requirePasswordChanged,
  requireRole,
} from "../middleware/auth";

const router = Router();

router.use(requireAuth, requirePasswordChanged);

router.get("/unread-count", async (_req: AuthedRequest, res) => {
  // Task notifications are disabled.
  res.json({ count: 0 });
});

router.get("/", async (_req: AuthedRequest, res) => {
  // Task notifications are disabled — always return an empty inbox.
  res.json({ data: [] });
});

router.post("/clear-all", requireRole("admin"), async (_req, res) => {
  try {
    const deleted = await clearAllNotifications();
    res.json({ deleted });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/:id/read", async (_req: AuthedRequest, res) => {
  res.json({ notification: null });
});

router.post("/read-all", async (_req: AuthedRequest, res) => {
  res.json({ ok: true });
});

export default router;
