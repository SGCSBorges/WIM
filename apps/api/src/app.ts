import express from "express";
import pinoHttp from "pino-http";
import { security } from "./config/security";
import { errorHandler } from "./middlewares/error";
import articleRoutes from "./modules/articles/article.routes";
import articleShareRoutes from "./modules/articles/article.share.routes";
import warrantyRoutes from "./modules/warranties/warranty.routes";
import authRoutes from "./modules/auth/auth.routes";
import auditRoutes from "./modules/audit/audit.routes";
import adminRoutes from "./modules/admin/admin.routes";
import attachmentRoutes from "./modules/attachments/attachment.routes";
import billingRoutes from "./modules/billing/billing.routes";
import billingWebhookRoutes from "./modules/billing/billing.webhook.routes";
import billingMeRoutes from "./modules/billing/billing.me.routes";
import shareRoutes from "./modules/shares/share.routes";
import locationRoutes from "./modules/locations/location.routes";
import alertRoutes from "./modules/alerts/alert.routes";
import sharedRoutes from "./modules/shared/shared.routes";
import profileRoutes from "./modules/profile/profile.routes";
import statisticsRoutes from "./routes/statistics.routes";
import path from "path";
import { startWorkersOnce } from "./config/jobs";

export function createApp() {
  const app = express();

  // Run BullMQ workers in the same process (as requested)
  startWorkersOnce();

  // Stripe webhook requires raw body for signature verification.
  // Mount BEFORE express.json().
  app.use("/api/billing", billingWebhookRoutes);

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

  // Static hosting for uploaded files (local dev)
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Routes
  app.use("/api/articles", articleRoutes);
  app.use("/api/articles", articleShareRoutes);
  app.use("/api/warranties", warrantyRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/attachments", attachmentRoutes);
  app.use("/api/locations", locationRoutes);
  app.use("/api/billing", billingRoutes);
  app.use("/api/billing", billingMeRoutes);
  app.use("/api/shares", shareRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/shared", sharedRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/statistics", statisticsRoutes);

  // Handler d’erreurs (toujours en dernier)
  app.use(errorHandler);

  return app;
}
