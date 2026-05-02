import { Router, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { ArticleService } from "./article.service";
import { ArticleCreateSchema, ArticleUpdateSchema } from "./article.schemas";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { idParam, paginationQuery } from "../common/schemas";

const router = Router();

/** GET tous les articles */
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const locationIdRaw = req.query.locationId;
    const locationId = locationIdRaw
      ? z.coerce.number().int().positive().parse(locationIdRaw)
      : undefined;
    const { page, limit } = paginationQuery.parse(req.query);
    const articles = await ArticleService.list(req.user!.sub, locationId, page, limit);
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
    await auditAction(req, {
      action: "CREATE",
      entity: "Article",
      entityId: created.articleId,
      metadata: { data },
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
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: id,
      metadata: { data },
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

export default router;
