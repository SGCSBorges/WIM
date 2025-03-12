import { Router, Request, Response } from "express";
import { asyncHandler } from "../common/http";
import { ArticleService } from "./article.service";
import { ArticleCreateSchema, ArticleUpdateSchema } from "./article.schemas";
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
  authGuard, // ✅ protection JWT
  asyncHandler(async (req: Request, res: Response) => {
    const data = ArticleCreateSchema.parse(req.body);
    const article = await ArticleService.create(data);
    res.status(201).json(article);
  })
);

/** PUT modifier un article — 🔐 protégé */
router.put(
  "/:id",
  authGuard, // ✅ protection JWT
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const data = ArticleUpdateSchema.parse(req.body);
    const article = await ArticleService.update(id, data);
    res.json(article);
  })
);

/** DELETE supprimer un article — 🔐 protégé */
router.delete(
  "/:id",
  authGuard, // ✅ protection JWT
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    await ArticleService.remove(id);
    res.status(204).send();
  })
);

export default router;
