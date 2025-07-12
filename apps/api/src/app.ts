import express from "express";
import pinoHttp from "pino-http";
import { security } from "./config/security";
import { errorHandler } from "./middlewares/error";
import articleRoutes from "./modules/articles/article.routes";
import warrantyRoutes from "./modules/warranties/warranty.routes";
import authRoutes from "./modules/auth/auth.routes";
import auditRoutes from "./modules/audit/audit.routes";
import adminRoutes from "./modules/admin/admin.routes";
import attachmentRoutes from "./modules/attachments/attachment.routes";
import statisticsRoutes from "./routes/statistics.routes";

export function createApp() {
  const app = express();

  // Sécurité / CORS / Rate limit
  app.use(security.helmet);
  app.use(security.cors);
  app.use(security.rateLimiter);

  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      autoLogging: true,
      // level: "info", // optionnel
    })
  );

  // Santé
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Routes
  app.use("/api/articles", articleRoutes);
  app.use("/api/warranties", warrantyRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/attachments", attachmentRoutes);
  app.use("/api/statistics", statisticsRoutes);

  // Handler d’erreurs (toujours en dernier)
  app.use(errorHandler);

  return app;
}
