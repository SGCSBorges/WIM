import { Router, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { ArticleService } from "./article.service";
import { ArticleCreateSchema, ArticleUpdateSchema } from "./article.schemas";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest, requireRole } from "../auth/auth.middleware";
import { idParam, paginationQuery } from "../common/schemas";
import { security } from "../../config/security";

const router = Router();

// Cap the per-request bulk size so a runaway client can't ask us to load
// 50k rows into memory at once. The UI ships a single "Select all" that's
// scoped to the current page (50 articles by default), so 500 is a healthy
// safety margin without being a real limit users will hit organically.
const BulkIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

/** GET tous les articles */
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const locationIdRaw = req.query.locationId;
    const locationId = locationIdRaw
      ? z.coerce.number().int().positive().parse(locationIdRaw)
      : undefined;
    const tagIdRaw = req.query.tag;
    const tagId = tagIdRaw
      ? z.coerce.number().int().positive().parse(tagIdRaw)
      : undefined;
    const { page, limit } = paginationQuery.parse(req.query);
    const articles = await ArticleService.list(
      req.user!.sub,
      locationId,
      page,
      limit,
      tagId
    );
    res.json(articles);
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
    const data = ArticleUpdateSchema.parse(req.body);
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
  requireRole("POWER_USER"),
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

export default router;
