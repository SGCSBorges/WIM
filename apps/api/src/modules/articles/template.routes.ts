/**
 * Article-template CRUD routes. Mounted under /api/article-templates.
 * Payloads are schemaless JSON; we run a soft Zod validation to clamp
 * obviously bad shapes (strings too long, prices outside sane bounds)
 * without locking down what callers can store.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { ArticleTemplateService } from "./template.service";

const PayloadSchema = z
  .object({
    articleNom: z.string().trim().max(100).optional(),
    articleModele: z.string().trim().max(100).optional(),
    articleDescription: z.string().trim().max(255).optional().nullable(),
    brand: z.string().trim().max(120).optional().nullable(),
    serialNumber: z.string().trim().max(120).optional().nullable(),
    productImageUrl: z.string().trim().max(500).optional().nullable(),
    purchasePrice: z.number().nonnegative().optional().nullable(),
    depreciationRate: z.number().min(0).max(100).optional().nullable(),
    locationNames: z
      .array(z.string().trim().min(1).max(120))
      .max(50)
      .optional(),
    tagNames: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .strict();

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  payload: PayloadSchema,
});
const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  payload: PayloadSchema.optional(),
});

const router = Router();

router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await ArticleTemplateService.list(req.user!.sub));
  })
);

router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    res.json(await ArticleTemplateService.get(id, req.user!.sub));
  })
);

router.post(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const data = CreateSchema.parse(req.body);
    const created = await ArticleTemplateService.create(
      req.user!.sub,
      data.name,
      data.payload
    );
    await auditAction(req, {
      action: "CREATE",
      entity: "Article",
      entityId: created.id,
      metadata: { kind: "template", name: data.name },
    });
    res.status(201).json(created);
  })
);

router.put(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = UpdateSchema.parse(req.body);
    const updated = await ArticleTemplateService.update(
      id,
      req.user!.sub,
      data
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: id,
      metadata: { kind: "template", keys: Object.keys(data) },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await ArticleTemplateService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Article",
      entityId: id,
      metadata: { kind: "template" },
    });
    res.status(204).send();
  })
);

export default router;
