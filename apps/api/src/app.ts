/**
 * Express app factory. Wires the middleware stack and mounts every route
 * module. Boot order matters:
 *
 *   1. `trust proxy` so rate-limit + req.ip see the real client behind
 *      Render's load balancer.
 *   2. `startWorkersOnce()` brings up BullMQ workers in-process — running
 *      web + workers in the same dyno keeps the free tier within budget.
 *   3. Stripe webhook is mounted BEFORE `express.json()` because signature
 *      verification needs the raw body.
 *   4. Security middleware (helmet/CORS/rate-limit) → cookieParser → CSRF
 *      → JSON body parser → pino logging (with X-Request-Id correlation).
 *   5. `/health` and `/uploads/:name` (authenticated file serving) are
 *      mounted before the modular routers so they can't be shadowed.
 *
 * The `/uploads/*` handler implements share-aware file access — it can't
 * be `express.static` because we need the DB-row ownership check on the
 * bytes themselves (not just the JSON metadata under `/api/attachments`).
 */
import express, { Response } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import pinoHttp from "pino-http";
import { security } from "./config/security";
import { errorHandler } from "./middlewares/error";
import { csrfGuard } from "./middlewares/csrf";
import articleRoutes from "./modules/articles/article.routes";
import articleNoteRoutes from "./modules/articles/note.routes";
import articleShareRoutes from "./modules/articles/article.share.routes";
import articleTemplateRoutes from "./modules/articles/template.routes";
import transferRoutes from "./modules/articles/transfer.routes";
import warrantyRoutes from "./modules/warranties/warranty.routes";
import messageRoutes from "./modules/messages/message.routes";
import loanRoutes from "./modules/loans/loan.routes";
import authRoutes from "./modules/auth/auth.routes";
import auditRoutes from "./modules/audit/audit.routes";
import adminRoutes from "./modules/admin/admin.routes";
import attachmentRoutes from "./modules/attachments/attachment.routes";
import billingRoutes from "./modules/billing/billing.routes";
import billingWebhookRoutes from "./modules/billing/billing.webhook.routes";
import billingMeRoutes from "./modules/billing/billing.me.routes";
import shareRoutes from "./modules/shares/share.routes";
import locationRoutes from "./modules/locations/location.routes";
import tagRoutes from "./modules/tags/tag.routes";
import calendarRoutes from "./modules/calendar/calendar.routes";
import savedViewRoutes from "./modules/saved-views/saved-view.routes";
import pushRoutes from "./modules/push/push.routes";
import alertRoutes from "./modules/alerts/alert.routes";
import sharedRoutes from "./modules/shared/shared.routes";
import profileRoutes from "./modules/profile/profile.routes";
import reportRoutes from "./modules/reports/report.routes";
import featureRoutes from "./modules/features/feature.routes";
import statisticsRoutes from "./routes/statistics.routes";
import openapiRoutes from "./openapi/openapi.routes";
import path from "path";
import fs from "fs";
import { startWorkersOnce } from "./config/jobs";
import { prisma } from "./libs/prisma";
import { runHealthChecks } from "./health";
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
  // CSRF defence runs after cookieParser (it inspects req.cookies.wim_token)
  // and BEFORE every mutating route. Stripe webhook is already mounted
  // above so it isn't covered — it uses raw-body HMAC signature verification
  // instead of cookies.
  app.use(csrfGuard);
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      autoLogging: true,
      // Correlate each request's logs with the response: reuse an inbound
      // X-Request-Id when present, else mint one, and echo it back on the
      // response header so a client/support can quote it to find the logs.
      genReqId: (req, res) => {
        const inbound = req.headers["x-request-id"];
        const id =
          (Array.isArray(inbound) ? inbound[0] : inbound) || randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      // level: "info", // optionnel
    })
  );

  app.get("/health", async (_req, res) => {
    const report = await runHealthChecks();
    res.status(report.status === "error" ? 503 : 200).json(report);
  });

  // Friendly root — most people who hit https://wimapi.../ in a browser are
  // looking for the API docs, not a 404.
  app.get("/", (_req, res) => res.redirect(302, "/api/docs"));

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

      // Look up the attachment without an ownership filter so we can apply
      // share-aware access rules below. We need the article + warranty
      // refs to walk the share graph.
      const viewerId = req.user!.sub;
      const viewerRole = req.user!.role;
      // Match either the original (fileUrl) or its generated thumbnail
      // (thumbUrl) — thumbnails live in the same directory under a
      // `<name>-thumb.webp` filename and must inherit the same access rules.
      const suffix = `/uploads/${storedName}`;
      const attachment = await prisma.attachment.findFirst({
        where: {
          OR: [
            { fileUrl: { endsWith: suffix } },
            { thumbUrl: { endsWith: suffix } },
          ],
        },
        select: {
          thumbUrl: true,
          mimeType: true,
          fileName: true,
          ownerUserId: true,
          articleId: true,
          garantieId: true,
          article: {
            select: { sharedWithPowerUsers: true, ownerUserId: true },
          },
          garantie: {
            select: {
              ownerUserId: true,
              article: {
                select: {
                  sharedWithPowerUsers: true,
                  ownerUserId: true,
                },
              },
            },
          },
        },
      });
      if (!attachment) return res.status(404).json({ error: "Not found" });

      // Access rules, evaluated cheapest-first:
      //   1. Owner of the attachment always wins.
      //   2. If the attachment is linked to an article (directly, or via a
      //      warranty), the viewer inherits access whenever the article is
      //      publicly shared (and the viewer is at least POWER_USER) OR the
      //      article's owner has granted the viewer an active InventoryShare.
      //   3. Standalone attachments (no article, no warranty) stay
      //      owner-only — they have no inheritable parent.
      const article =
        attachment.article ?? attachment.garantie?.article ?? null;
      const articleOwnerId = article?.ownerUserId ?? null;
      const articleIsPublic = article?.sharedWithPowerUsers === true;

      let allowed = attachment.ownerUserId === viewerId;

      if (!allowed && articleOwnerId !== null) {
        if (
          articleIsPublic &&
          (viewerRole === "POWER_USER" || viewerRole === "ADMIN")
        ) {
          allowed = true;
        } else {
          const share = await prisma.inventoryShare.findFirst({
            where: {
              ownerUserId: articleOwnerId,
              targetUserId: viewerId,
              active: true,
            },
            select: { inventoryShareId: true },
          });
          if (share) allowed = true;
        }
      }

      if (!allowed) return res.status(404).json({ error: "Not found" });

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: "File missing on disk" });
      }
      // The row's mimeType describes the original; thumbnails are always
      // webp (sharp output) regardless of the source format.
      const isThumb = attachment.thumbUrl?.endsWith(suffix) === true;
      res.setHeader(
        "Content-Type",
        isThumb ? "image/webp" : attachment.mimeType
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Inline display for images and PDFs (the only allowed types); browsers
      // can render these safely with the explicit MIME type above.
      // Strip control characters (including \r\n) to prevent header injection;
      // then strip double-quotes so the filename value stays syntactically valid.
      const safeFileName = attachment.fileName
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, "")
        .replace(/"/g, "");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${safeFileName}"`
      );
      return res.sendFile(fullPath);
    }
  );

  // Routes
  // Order matters: the share/note routers carry literal single-segment paths
  // (`/shared-public`, `/unshare-all`) that would otherwise be swallowed by
  // articleRoutes' `GET /:id` (which coerces the segment to a number — e.g.
  // "shared-public" → NaN → a 400). Mount the specific routers before the
  // `/:id` catch-all.
  app.use("/api/articles", transferRoutes);
  app.use("/api/articles", articleShareRoutes);
  app.use("/api/articles", articleNoteRoutes);
  app.use("/api/articles", articleRoutes);
  app.use("/api/article-templates", articleTemplateRoutes);
  app.use("/api/warranties", warrantyRoutes);
  app.use("/api/auth", security.authRateLimiter, authRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/attachments", attachmentRoutes);
  app.use("/api/locations", locationRoutes);
  app.use("/api/tags", tagRoutes);
  app.use("/api/calendar", calendarRoutes);
  app.use("/api/saved-views", savedViewRoutes);
  app.use("/api/push", pushRoutes);
  app.use("/api/billing", billingRoutes);
  app.use("/api/billing", billingMeRoutes);
  app.use("/api/shares", shareRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/shared", sharedRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/loans", loanRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/features", featureRoutes);
  app.use("/api/statistics", statisticsRoutes);
  // OpenAPI spec + Swagger UI. Public — the document only describes the API
  // surface; it does not expose data.
  app.use("/api", openapiRoutes);

  // Error handler must be last
  app.use(errorHandler);

  return app;
}
