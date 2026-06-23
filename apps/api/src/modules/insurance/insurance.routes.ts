/**
 * Insurance policy routes — owner-scoped CRUD plus article link/unlink. All
 * gated by `authGuard` + service-level ownership checks. Creating/linking is
 * rate-limited (writes a row + may schedule a reminder).
 */
import { Router } from "express";
import { z } from "zod";
import { security } from "../../config/security";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { InsuranceService } from "./insurance.service";
import {
  PolicyCreateSchema,
  PolicyUpdateSchema,
  LinkSchema,
} from "./insurance.schemas";

const router = Router();

const ListQuery = z.object({
  articleId: z.coerce.number().int().positive().optional(),
});

// GET /api/insurance?articleId=42
router.get(
  "/",
  authGuard,
  requireFeature("insurance"),
  asyncHandler(async (req: AuthRequest, res) => {
    const q = ListQuery.parse(req.query);
    const items = q.articleId
      ? await InsuranceService.listForArticle(req.user!.sub, q.articleId)
      : await InsuranceService.list(req.user!.sub);
    res.json({ items });
  })
);

// POST /api/insurance — add a policy.
router.post(
  "/",
  security.createRateLimiter,
  authGuard,
  requireFeature("insurance"),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = PolicyCreateSchema.parse(req.body);
    const policy = await InsuranceService.create(req.user!.sub, data);
    await auditAction(req, {
      action: "CREATE",
      entity: "InsurancePolicy",
      entityId: policy.policyId as number,
    });
    res.status(201).json(policy);
  })
);

// PATCH /api/insurance/:id
router.patch(
  "/:id",
  authGuard,
  requireFeature("insurance"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = PolicyUpdateSchema.parse(req.body);
    const policy = await InsuranceService.update(id, req.user!.sub, data);
    await auditAction(req, {
      action: "UPDATE",
      entity: "InsurancePolicy",
      entityId: id,
    });
    res.json(policy);
  })
);

// DELETE /api/insurance/:id
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await InsuranceService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "InsurancePolicy",
      entityId: id,
    });
    res.status(204).end();
  })
);

// POST /api/insurance/:id/articles — cover an article under this policy.
router.post(
  "/:id/articles",
  security.createRateLimiter,
  authGuard,
  requireFeature("insurance"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const { articleId } = LinkSchema.parse(req.body);
    await InsuranceService.linkArticle(id, req.user!.sub, articleId);
    await auditAction(req, {
      action: "UPDATE",
      entity: "InsurancePolicy",
      entityId: id,
      metadata: { linkedArticleId: articleId },
    });
    res.status(204).end();
  })
);

// DELETE /api/insurance/:id/articles/:articleId — stop covering an article.
router.delete(
  "/:id/articles/:articleId",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const articleId = idParam.parse(req.params.articleId);
    await InsuranceService.unlinkArticle(id, req.user!.sub, articleId);
    await auditAction(req, {
      action: "UPDATE",
      entity: "InsurancePolicy",
      entityId: id,
      metadata: { unlinkedArticleId: articleId },
    });
    res.status(204).end();
  })
);

export default router;
