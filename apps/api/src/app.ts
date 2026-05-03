import express, { Response } from "express";
import cookieParser from "cookie-parser";
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
import openapiRoutes from "./openapi/openapi.routes";
import path from "path";
import fs from "fs";
import { startWorkersOnce } from "./config/jobs";
import { prisma } from "./libs/prisma";
import { authGuard, AuthRequest } from "./modules/auth/auth.middleware";

export function createApp() {
  const app = express();

  // Trust the first proxy hop (Render, nginx, etc.) so req.ip and
  // rate-limiter see the real client IP, not the proxy address.
  app.set("trust proxy", 1);

  // Run BullMQ workers in the same process (as requested)
  startWorkersOnce();

  // Stripe webhook requires raw body for signature verification.
  // Mount BEFORE express.json().
  app.use("/api/billing", billingWebhookRoutes);

  // Sécurité / CORS / Rate limit
  app.use(security.helmet);
  app.use(security.cors);
  app.use(security.rateLimiter);

  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      autoLogging: true,
      // level: "info", // optionnel
    })
  );

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "error", reason: "database unavailable" });
    }
  });

  // Authenticated file download. We do NOT serve `uploads/` with
  // express.static because filenames leak through Referer headers, browser
  // history and copy-paste, and we want the DB row's ownership rules to
  // apply to the bytes too — not just the metadata under /api/attachments.
  const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
  app.get(
    "/uploads/:storedName",
    authGuard,
    async (req: AuthRequest, res: Response) => {
      const { storedName } = req.params;
      // The Multer pipeline produces 24 hex chars + a sanitized extension.
      // Reject anything that doesn't look like our own filenames so we never
      // even hit the filesystem with arbitrary input.
      if (!/^[a-zA-Z0-9._-]+$/.test(storedName)) {
        return res.status(400).json({ error: "Invalid file name" });
      }
      const fullPath = path.resolve(UPLOAD_DIR, storedName);
      if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) {
        return res.status(400).json({ error: "Invalid file path" });
      }

      const attachment = await prisma.attachment.findFirst({
        where: {
          ownerUserId: req.user!.sub,
          fileUrl: { endsWith: `/uploads/${storedName}` },
        },
        select: { mimeType: true, fileName: true },
      });
      if (!attachment) return res.status(404).json({ error: "Not found" });

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: "File missing on disk" });
      }
      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Inline display for images and PDFs (the only allowed types); browsers
      // can render these safely with the explicit MIME type above.
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${attachment.fileName.replace(/"/g, "")}"`
      );
      return res.sendFile(fullPath);
    }
  );

  // Routes
  app.use("/api/articles", articleRoutes);
  app.use("/api/articles", articleShareRoutes);
  app.use("/api/warranties", warrantyRoutes);
  app.use("/api/auth", security.authRateLimiter, authRoutes);
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
  // OpenAPI spec + Swagger UI. Public — the document only describes the API
  // surface; it does not expose data.
  app.use("/api", openapiRoutes);

  // Error handler must be last
  app.use(errorHandler);

  return app;
}
