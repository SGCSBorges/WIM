import { Router } from "express";
import { asyncHandler } from "../common/http";
import { WarrantyService } from "./warranty.service";
import { WarrantyCreateSchema, WarrantyUpdateSchema } from "./warranty.schemas";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { idParam } from "../common/schemas";

const router = Router();

router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json(await WarrantyService.list(req.user!.sub));
  })
);

router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const g = await WarrantyService.get(id, req.user!.sub);
    if (!g) return res.status(404).json({ error: "Warranty not found" });
    res.json(g);
  })
);

router.post(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const body = WarrantyCreateSchema.parse(req.body);
    const data = { ...body, ownerUserId: req.user!.sub };
    const created = await WarrantyService.create(data);
    await auditAction(req, {
      action: "CREATE",
      entity: "Garantie",
      entityId: created.garantieId,
      metadata: { data },
    });
    res.status(201).json(created);
  })
);

router.put(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = WarrantyUpdateSchema.parse(req.body);
    const updated = await WarrantyService.update(id, req.user!.sub, data);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Garantie",
      entityId: id,
      metadata: { data },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await WarrantyService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Garantie",
      entityId: id,
    });
    res.status(204).send();
  })
);

export default router;
