/** Saved-view routes — per-user CRUD over the Articles-list filter views. */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { security } from "../../config/security";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { SavedViewService } from "./saved-view.service";

const router = Router();

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  // The Articles filter querystring (without a leading "?").
  query: z.string().trim().max(500),
});

router.get(
  "/",
  authGuard,
  requireFeature("saved_views"),
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await SavedViewService.list(req.user!.sub));
  })
);

router.post(
  "/",
  authGuard,
  requireFeature("saved_views"),
  // Same creation limiter tags + locations apply — names are unique per
  // owner, so a loop with random names could insert unbounded rows.
  security.createRateLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    const { name, query } = CreateSchema.parse(req.body);
    const created = await SavedViewService.create(req.user!.sub, name, query);
    await auditAction(req, {
      action: "CREATE",
      entity: "SavedView",
      entityId: created.id,
      metadata: { name },
    });
    res.status(201).json(created);
  })
);

router.delete(
  "/:id",
  authGuard,
  requireFeature("saved_views"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await SavedViewService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "SavedView",
      entityId: id,
    });
    res.status(204).send();
  })
);

export default router;
