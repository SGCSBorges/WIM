/**
 * Tag routes. CRUD + rename + merge. POST is rate-limited by
 * `createRateLimiter` so a script can't spam thousands of junk rows;
 * merge inherits the transactional dedup from the service layer.
 */
import { Router } from "express";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { security } from "../../config/security";
import {
  TagCreateSchema,
  TagMergeSchema,
  TagRenameSchema,
} from "./tag.schemas";
import { TagService } from "./tag.service";

const router = Router();

router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await TagService.list(req.user!.sub));
  })
);

router.post(
  "/",
  security.createRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { name } = TagCreateSchema.parse(req.body);
    const created = await TagService.create(req.user!.sub, name);
    await auditAction(req, {
      action: "CREATE",
      entity: "Tag",
      entityId: created.tagId,
      metadata: { name },
    });
    res.status(201).json(created);
  })
);

router.put(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const { name } = TagRenameSchema.parse(req.body);
    const updated = await TagService.rename(id, req.user!.sub, name);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Tag",
      entityId: id,
      metadata: { name },
    });
    res.json(updated);
  })
);

router.post(
  "/merge",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { fromId, intoId } = TagMergeSchema.parse(req.body);
    const result = await TagService.merge(fromId, intoId, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Tag",
      entityId: fromId,
      metadata: { merge: true, intoId, ...result },
    });
    res.json(result);
  })
);

router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await TagService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Tag",
      entityId: id,
    });
    res.status(204).send();
  })
);

export default router;
