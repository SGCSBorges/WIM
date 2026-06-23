/**
 * Service / maintenance log routes — owner-scoped, gated by `authGuard` plus
 * service-level ownership checks. Listing requires an `articleId`; creating is
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
import { ServiceRecordService } from "./service-record.service";
import { ServiceCreateSchema } from "./service-record.schemas";

const router = Router();

const ListQuery = z.object({
  articleId: z.coerce.number().int().positive(),
});

// GET /api/service-records/due — services coming due (or overdue) across all
// of the caller's articles. Registered before "/" stays unambiguous (distinct
// literal path). Gated like the rest of the maintenance feature.
router.get(
  "/due",
  authGuard,
  requireFeature("maintenance"),
  asyncHandler(async (req: AuthRequest, res) => {
    const items = await ServiceRecordService.listDue(req.user!.sub);
    res.json({ items });
  })
);

// GET /api/service-records?articleId=42
router.get(
  "/",
  authGuard,
  requireFeature("maintenance"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { articleId } = ListQuery.parse(req.query);
    const items = await ServiceRecordService.list(req.user!.sub, articleId);
    res.json({ items });
  })
);

// POST /api/service-records — log a service entry.
router.post(
  "/",
  security.createRateLimiter,
  authGuard,
  requireFeature("maintenance"),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = ServiceCreateSchema.parse(req.body);
    const record = await ServiceRecordService.create(req.user!.sub, data);
    await auditAction(req, {
      action: "CREATE",
      entity: "ServiceRecord",
      entityId: record.serviceId,
      metadata: { articleId: data.articleId },
    });
    res.status(201).json(record);
  })
);

// DELETE /api/service-records/:id
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await ServiceRecordService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "ServiceRecord",
      entityId: id,
    });
    res.status(204).end();
  })
);

export default router;
