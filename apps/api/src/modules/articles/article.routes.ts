import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { ArticleService } from "./article.service";
import { ArticleCreateSchema, ArticleUpdateSchema } from "./article.schemas";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ArticleService.list());
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const item = await ArticleService.get(id);
    if (!item) return res.status(404).json({ error: "Article non trouvé" });
    res.json(item);
  })
);

router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const data = ArticleCreateSchema.parse(req.body);
    const created = await ArticleService.create(data);
    res.status(201).json(created);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const data = ArticleUpdateSchema.parse(req.body);
    const updated = await ArticleService.update(id, data);
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = z.coerce.number().int().parse(req.params.id);
    await ArticleService.remove(id);
    res.status(204).end();
  })
);

export default router;
