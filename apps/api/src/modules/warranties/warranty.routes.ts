import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { WarrantyService } from "./warranty.service";
import { WarrantyCreateSchema, WarrantyUpdateSchema } from "./warranty.schemas";
import { auditAction } from "../common/audit";
import { authGuard } from "../auth/auth.middleware";

const router = Router();

router.get(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    res.json(await WarrantyService.list(req.user.sub));
  })
);

router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const g = await WarrantyService.get(id, req.user.sub);
    if (!g) return res.status(404).json({ error: "Garantie non trouvée" });
    res.json(g);
  })
);

router.post(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const body = WarrantyCreateSchema.parse(req.body);
    const data = { ...body, ownerUserId: req.user.sub };
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
  asyncHandler(async (req: any, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const data = WarrantyUpdateSchema.parse(req.body);
    const updated = await WarrantyService.update(id, req.user.sub, data);
    res.json(updated);
  })
);

router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    await WarrantyService.remove(id, req.user.sub);
    res.status(204).end();
  })
);

export default router;
