import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import authRoutes from "./routes/auth";
import staffRoutes from "./routes/staff";
import taskRoutes from "./routes/tasks";
import recurringRoutes from "./routes/recurring";
import cronRoutes from "./routes/cron";
import notificationRoutes from "./routes/notifications";
import timeTrackingRoutes from "./routes/time-tracking";

function createApiRouter() {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "rajshree-api" });
  });

  router.use("/auth", authRoutes);
  router.use("/staff", staffRoutes);
  router.use("/tasks", taskRoutes);
  router.use("/recurring", recurringRoutes);
  router.use("/cron", cronRoutes);
  router.use("/notifications", notificationRoutes);
  router.use("/time-tracking", timeTrackingRoutes);

  return router;
}

export function createApp() {
  const app = express();

  app.use(helmet());
  const allowedOrigins = [
    ...new Set(
      [...config.corsOrigin.split(","), "http://localhost:3000", "http://localhost:3001"]
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  ];

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  // Local `npm run dev` + internal service bindings use root paths (/auth, /tasks, …).
  app.use(createApiRouter());
  // Public Vercel rewrite keeps the /api prefix, so also mount under /api.
  app.use("/api", createApiRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found", code: "not_found" });
  });

  return app;
}
