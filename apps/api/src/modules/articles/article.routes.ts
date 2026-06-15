/**
 * Articles routes — CRUD + bulk + trash + share toggles + exports.
 *
 * Every mutating route audits via `auditAction`. Bulk endpoints cap at
 * 500 ids/request (`BulkIdsSchema`) so a runaway client can't ask us to
 * load 50k rows; the UI's "Select all" is page-scoped (50 by default).
 *
 * Soft-delete model: `DELETE /:id` flips `deletedAt`, `bulk-delete`
 * does the same; restored via `/:id/restore` or `bulk-restore`;
 * permanent purge is `/:id/purge` and `bulk-purge`. The trash worker
 * (`jobs/workers.ts`) hard-deletes anything older than
 * `ARTICLE_TRASH_RETENTION_DAYS`.
 *
 * `POST /:id/duplicate` deep-copies fields + locations + tags but
 * intentionally drops the warranty so a clone doesn't schedule a
 * second set of reminders for the same purchase.
 */
import { Router, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { ArticleService } from "./article.service";
import { importArticles } from "./article.import";
import { buildArticlesCsv } from "./article.csv";
import {
  streamArticleClaimPdf,
  streamInventoryPdf,
  streamLabelsPdf,
} from "./article.pdf";
import { prisma } from "../../libs/prisma";
import { ArticleCreateSchema, ArticleUpdateSchema } from "./article.schemas";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { idParam } from "../common/schemas";
import { security } from "../../config/security";

const router = Router();

// Cap the per-request bulk size so a runaway client can't ask us to load
// 50k rows into memory at once. The UI ships a single "Select all" that's
// scoped to the current page (50 articles by default), so 500 is a healthy
// safety margin without being a real limit users will hit organically.
const BulkIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

// CSV import: a batch of loosely-typed rows (resolved/validated server-side,
// per-row, in article.import). Capped to keep one request bounded.
const ImportSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        model: z.string().trim().min(1).max(100),
        description: z.string().trim().max(255).optional().nullable(),
        price: z.coerce.number().nonnegative().max(1e10).optional().nullable(),
        locations: z.array(z.string().trim().max(120)).default([]),
        tags: z.array(z.string().trim().max(40)).default([]),
      })
    )
    .min(1)
    .max(1000),
});

// Query schema for the list/search endpoint. All filters optional.
const ArticleListQuerySchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  tag: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  warrantyStatus: z
    .enum(["valid", "expiringSoon", "expired", "none"])
    .optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  // Inclusive createdAt date range. Coerce from YYYY-MM-DD strings the web
  // <input type="date"> emits — z.coerce.date() handles both ISO and date-only.
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  // Sort dimension + direction. The default (articleId desc) matches
  // existing behaviour so callers that don't opt in see no change.
  sort: z
    .enum(["articleId", "articleNom", "purchasePrice", "createdAt"])
    .optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

/** GET tous les articles — server-side search + filters, returns {items,total} */
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const q = ArticleListQuerySchema.parse(req.query);
    const result = await ArticleService.list(req.user!.sub, {
      locationId: q.locationId,
      tagId: q.tag,
      q: q.q,
      warrantyStatus: q.warrantyStatus,
      priceMin: q.priceMin,
      priceMax: q.priceMax,
      createdFrom: q.createdFrom,
      createdTo: q.createdTo,
      sort: q.sort,
      dir: q.dir,
      page: q.page,
      limit: q.limit,
    });
    res.json(result);
  })
);

/** GET soft-deleted articles for the current user (Trash view). Must precede
 *  the `/:id` GET so the static segment wins the matcher. */
router.get(
  "/trash",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const items = await ArticleService.listTrash(req.user!.sub);
    res.json({ items });
  })
);

/** POST bulk-restore soft-deleted articles. Reuses the round-7 BulkIdsSchema
 *  + destructiveRateLimiter. */
router.post(
  "/trash/bulk-restore",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { ids } = BulkIdsSchema.parse(req.body);
    const { count } = await ArticleService.bulkRestore(ids, req.user!.sub);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      metadata: {
        bulk: true,
        restored: true,
        requested: ids.length,
        restored_count: count,
      },
    });
    res.json({ count });
  })
);

/** POST bulk-purge: permanent removal of trashed articles. */
router.post(
  "/trash/bulk-purge",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { ids } = BulkIdsSchema.parse(req.body);
    const { count } = await ArticleService.bulkHardRemove(ids, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Article",
      metadata: {
        bulk: true,
        purge: true,
        requested: ids.length,
        deleted: count,
      },
    });
    res.json({ count });
  })
);

/** POST restore a soft-deleted article. */
router.post(
  "/:id/restore",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const restored = await ArticleService.restore(id, req.user!.sub);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: id,
      metadata: { restored: true },
    });
    res.json(restored);
  })
);

/** DELETE permanent removal (purge). Used by the Trash view to skip the
 *  retention window when the owner is sure. */
router.delete(
  "/:id/purge",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await ArticleService.hardRemove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Article",
      entityId: id,
      metadata: { purge: true },
    });
    res.status(204).send();
  })
);

/** GET un article par ID */
router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = idParam.parse(req.params.id);
    const article = await ArticleService.get(id, req.user!.sub);
    if (!article) return res.status(404).json({ error: "Article not found" });
    res.json(article);
  })
);

/** POST créer un article — 🔐 protégé */

router.post(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const bodyData = ArticleCreateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const data = { ...bodyData, ownerUserId: req.user!.sub };
    const created = await ArticleService.create(data);
    // Audit metadata: log structural facts (which fields were set, which
    // location ids, whether a warranty was attached) — NOT the free-text
    // user input. We don't want article names, descriptions, image URLs,
    // or warranty names accumulating in the audit log indefinitely.
    await auditAction(req, {
      action: "CREATE",
      entity: "Article",
      entityId: created.articleId,
      metadata: {
        locationIds: bodyData.locationIds,
        hasGarantie: Boolean(bodyData.garantie),
        hasImage: Boolean(bodyData.productImageUrl),
      },
    });
    res.status(201).json(created);
  })
);

/** PUT modifier un article — 🔐 protégé */

router.put(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    // Omit ownerUserId from the parsed body (mirror the create path): the
    // owner is always the authenticated caller, never client-supplied. Without
    // this, a client `ownerUserId` rides along in the patch and the service is
    // only saved from re-owning the row by object-key ordering — too fragile
    // to rely on.
    const data = ArticleUpdateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const updated = await ArticleService.update(id, req.user!.sub, data);
    // Log the *shape* of the change (which fields the caller touched),
    // not the values. Free-text payloads bloat the audit log and may
    // contain PII the operator doesn't want retained.
    const touchedFields = Object.keys(data).filter(
      (k) => (data as Record<string, unknown>)[k] !== undefined
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: id,
      metadata: {
        touchedFields,
        ...(data.locationIds !== undefined
          ? { locationIds: data.locationIds }
          : {}),
        ...(data.removeGarantie ? { removeGarantie: true } : {}),
      },
    });
    res.json(updated);
  })
);

/** POST duplicate an article — copies identity + locations + tags, but not
 *  warranty (1:1 unique) or attachments. */
router.post(
  "/:id/duplicate",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const created = await ArticleService.duplicate(id, req.user!.sub);
    await auditAction(req, {
      action: "CREATE",
      entity: "Article",
      entityId: created.articleId,
      metadata: { duplicatedFrom: id },
    });
    res.status(201).json(created);
  })
);

/** DELETE supprimer un article — 🔐 protégé */
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await ArticleService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Article",
      entityId: id,
    });
    res.status(204).send();
  })
);

/**
 * Bulk delete articles owned by the caller. Returns { count } of rows
 * actually removed (ids the user doesn't own are silently skipped).
 */
router.post(
  "/bulk-delete",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { ids } = BulkIdsSchema.parse(req.body);
    const { count } = await ArticleService.bulkRemove(ids, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Article",
      metadata: { bulk: true, requested: ids.length, deleted: count },
    });
    res.json({ count });
  })
);

/**
 * Bulk set `sharedWithPowerUsers` on every requested article the caller
 * owns. Power-user-only since public sharing is a power-user surface.
 * Accepts `{ ids: number[], shared: boolean }`.
 */
router.post(
  "/bulk-share",
  authGuard,
  requireFeature("sharing"),
  asyncHandler(async (req: AuthRequest, res) => {
    const schema = BulkIdsSchema.extend({ shared: z.boolean() });
    const { ids, shared } = schema.parse(req.body);
    const { count } = await ArticleService.bulkSetSharedWithPowerUsers(
      ids,
      req.user!.sub,
      shared
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      metadata: { bulk: true, shared, requested: ids.length, updated: count },
    });
    res.json({ count });
  })
);

/**
 * Bulk add locations and/or tags to every requested article the caller owns.
 * Additive only (existing assignments kept, duplicates skipped). Accepts
 * `{ ids: number[], addLocationIds?: number[], addTagIds?: number[] }`.
 */
router.post(
  "/bulk-assign",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const schema = BulkIdsSchema.extend({
      addLocationIds: z
        .array(z.number().int().positive())
        .max(50)
        .optional()
        .default([]),
      addTagIds: z
        .array(z.number().int().positive())
        .max(50)
        .optional()
        .default([]),
    });
    const { ids, addLocationIds, addTagIds } = schema.parse(req.body);
    const { count } = await ArticleService.bulkAssign(
      ids,
      req.user!.sub,
      addLocationIds,
      addTagIds
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      metadata: {
        bulk: true,
        assign: true,
        requested: ids.length,
        updated: count,
        addLocationIds,
        addTagIds,
      },
    });
    res.json({ count });
  })
);

// Bulk-update scalar fields across a selection. Mirrors `bulkAssign` but
// for price/depreciationRate/brand/serialNumber. `null` clears a field,
// missing keys leave it alone.
router.post(
  "/bulk-update",
  authGuard,
  requireFeature("bulk_edit"),
  asyncHandler(async (req: AuthRequest, res) => {
    const schema = BulkIdsSchema.extend({
      fields: z
        .object({
          purchasePrice: z.number().nonnegative().nullable().optional(),
          depreciationRate: z.number().min(0).max(100).nullable().optional(),
          brand: z.string().trim().max(120).nullable().optional(),
          serialNumber: z.string().trim().max(120).nullable().optional(),
        })
        .refine((v) => Object.keys(v).length > 0, {
          message: "at least one field is required",
        }),
    });
    const { ids, fields } = schema.parse(req.body);
    const { count } = await ArticleService.bulkUpdate(
      ids,
      req.user!.sub,
      fields
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      metadata: {
        bulk: true,
        update: true,
        requested: ids.length,
        updated: count,
        keys: Object.keys(fields),
      },
    });
    res.json({ count });
  })
);

/**
 * POST import articles from parsed CSV rows (partial success report).
 * `?dryRun=1` validates + caps without writing, for a server-checked preview.
 */
router.post(
  "/import",
  authGuard,
  requireFeature("csv_import"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { rows } = ImportSchema.parse(req.body);
    const dryRun = ["1", "true"].includes(
      String(req.query.dryRun ?? "").toLowerCase()
    );
    const result = await importArticles(req.user!.sub, rows, { dryRun });
    // A dry run writes nothing, so it's not worth an audit entry.
    if (!dryRun) {
      await auditAction(req, {
        action: "CREATE",
        entity: "Article",
        metadata: {
          import: true,
          requested: rows.length,
          created: result.created,
          failed: result.errors.length,
        },
      });
    }
    res.json(result);
  })
);

async function userCurrency(userId: number): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { userId },
    select: { currency: true },
  });
  return u?.currency ?? "USD";
}

/** GET CSV export of all matching articles (same filter vocabulary as list).
 *  Path mirrors the existing inventory.pdf route. */
router.get(
  "/export/inventory.csv",
  authGuard,
  requireFeature("csv_export"),
  security.destructiveRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const q = ArticleListQuerySchema.parse(req.query);
    const rows = await ArticleService.listAll(req.user!.sub, {
      locationId: q.locationId,
      tagId: q.tag,
      q: q.q,
      warrantyStatus: q.warrantyStatus,
      priceMin: q.priceMin,
      priceMax: q.priceMax,
      createdFrom: q.createdFrom,
      createdTo: q.createdTo,
      sort: q.sort,
      dir: q.dir,
    });
    await auditAction(req, {
      action: "DB_EXPORT",
      entity: "Article",
      metadata: { report: "inventory.csv", rows: rows.length },
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="wim-inventory-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(buildArticlesCsv(rows));
  })
);

/** GET full-inventory manifest PDF (declared before /:id/* article routes). */
router.get(
  "/export/inventory.pdf",
  authGuard,
  security.destructiveRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const currency = await userCurrency(req.user!.sub);
    await auditAction(req, {
      action: "DB_EXPORT",
      entity: "Article",
      metadata: { report: "inventory.pdf" },
    });
    await streamInventoryPdf(res, req.user!.sub, currency);
  })
);

/** GET printable QR-label sheet (one label per article, deep-linking back). */
router.get(
  "/export/labels.pdf",
  authGuard,
  security.destructiveRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const appBaseUrl =
      process.env.APP_URL?.replace(/\/$/, "") ??
      `${req.protocol}://${req.get("host")}`;
    await auditAction(req, {
      action: "DB_EXPORT",
      entity: "Article",
      metadata: { report: "labels.pdf" },
    });
    await streamLabelsPdf(res, req.user!.sub, appBaseUrl);
  })
);

/** GET single-article insurance/claim PDF. */
router.get(
  "/:id/claim.pdf",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = idParam.parse(req.params.id);
    const currency = await userCurrency(req.user!.sub);
    await streamArticleClaimPdf(res, id, req.user!.sub, currency);
  })
);

export default router;
