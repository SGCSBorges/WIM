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
  asyncHandler(async (_req, res) => {
    res.json(await WarrantyService.list());
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const g = await WarrantyService.get(id);
    if (!g) return res.status(404).json({ error: "Garantie non trouvée" });
    res.json(g);
  })
);

router.post(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const data = WarrantyCreateSchema.parse(req.body);
    const created = await WarrantyService.create({
      ...data,
      ownerUserId: req.user.userId,
    });
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
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    const data = WarrantyUpdateSchema.parse(req.body);
    const updated = await WarrantyService.update(id, data);
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().parse(req.params.id);
    await WarrantyService.remove(id);
    res.status(204).end();
  })
);

export default router;
