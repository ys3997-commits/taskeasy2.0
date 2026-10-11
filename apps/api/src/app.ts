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

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin.split(",").map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "rajshree-api" });
  });

  app.use("/auth", authRoutes);
  app.use("/staff", staffRoutes);
  app.use("/tasks", taskRoutes);
  app.use("/recurring", recurringRoutes);
  app.use("/cron", cronRoutes);
  app.use("/notifications", notificationRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found", code: "not_found" });
  });

  return app;
}
