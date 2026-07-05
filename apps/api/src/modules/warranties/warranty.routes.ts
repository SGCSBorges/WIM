/**
 * Warranty routes. CRUD + the claim status PUT. Round-3 added the iCal
 * "claim" event; round-9 added the provider metadata fields.
 */
import { Router } from "express";
import { asyncHandler } from "../common/http";
import { WarrantyService } from "./warranty.service";
import {
  ClaimUpdateSchema,
  WarrantyCreateSchema,
  WarrantyExtendSchema,
  WarrantyRenewSchema,
  WarrantyUpdateSchema,
} from "./warranty.schemas";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { idParam, paginationQuery } from "../common/schemas";

const router = Router();

router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { page, limit } = paginationQuery.parse(req.query);
    res.json(await WarrantyService.list(req.user!.sub, page, limit));
  })
);

// Distinct provider name/phone/url the caller has used (for form autofill).
// Static path — must precede `/:id` so the segment wins the matcher.
router.get(
  "/providers",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const items = await WarrantyService.distinctProviders(req.user!.sub);
    res.json({ items });
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

router.patch(
  "/:id/claim",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = ClaimUpdateSchema.parse(req.body);
    const updated = await WarrantyService.updateClaim(id, req.user!.sub, data);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Garantie",
      entityId: id,
      metadata: { field: "claim", status: data.status },
    });
    res.json(updated);
  })
);

router.post(
  "/:id/renew",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = WarrantyRenewSchema.parse(req.body);
    const updated = await WarrantyService.renew(id, req.user!.sub, data);
    await auditAction(req, {
      action: "WARRANTY_RENEW",
      entity: "Garantie",
      entityId: id,
      metadata: {
        newDateAchat: data.garantieDateAchat,
        newDuration: data.garantieDuration,
      },
    });
    res.json(updated);
  })
);

router.post(
  "/:id/extend",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = WarrantyExtendSchema.parse(req.body);
    const updated = await WarrantyService.extend(id, req.user!.sub, data);
    await auditAction(req, {
      action: "WARRANTY_EXTEND",
      entity: "Garantie",
      entityId: id,
      metadata: { months: data.months },
    });
    res.json(updated);
  })
);

router.get(
  "/:id/history",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    res.json(await WarrantyService.getHistory(id, req.user!.sub));
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
