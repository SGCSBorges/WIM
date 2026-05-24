import { Router } from "express";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { TagCreateSchema } from "./tag.schemas";
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
