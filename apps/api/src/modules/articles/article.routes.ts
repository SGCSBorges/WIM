import { Router, Request, Response } from "express";
import { asyncHandler } from "../common/http";
import { ArticleService } from "./article.service";
import { ArticleCreateSchema, ArticleUpdateSchema } from "./article.schemas";
import { auditAction } from "../common/audit";
import { authGuard } from "../auth/auth.middleware";

const router = Router();

/** GET tous les articles */
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const articles = await ArticleService.list();
    res.json(articles);
  })
);

/** GET un article par ID */
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const article = await ArticleService.get(id);
    if (!article) return res.status(404).json({ error: "Article non trouvé" });
    res.json(article);
  })
);

/** POST créer un article — 🔐 protégé */

router.post(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const data = ArticleCreateSchema.parse(req.body);
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
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const data = ArticleUpdateSchema.parse(req.body);
    const updated = await ArticleService.update(id, data);
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
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    await ArticleService.remove(id);
    await auditAction(req, {
      action: "DELETE",
      entity: "Article",
      entityId: id,
    });
    res.status(204).send();
  })
);

export default router;
