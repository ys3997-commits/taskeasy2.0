import { Router } from "express";
import { sendError } from "../lib/errors";
import { requireCron } from "../middleware/auth";
import { generateDueOccurrences } from "../services/recurring";

const router = Router();

router.post("/generate-occurrences", requireCron, async (_req, res) => {
  try {
    const result = await generateDueOccurrences();
    res.json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

// Vercel Cron uses GET by default
router.get("/generate-occurrences", requireCron, async (_req, res) => {
  try {
    const result = await generateDueOccurrences();
    res.json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
