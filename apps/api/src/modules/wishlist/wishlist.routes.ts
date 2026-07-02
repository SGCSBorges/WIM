/**
 * Wishlist routes — planned purchases. List/create/update are gated on the
 * `wishlist` feature (POWER_USER default); mark-purchased and delete stay on
 * authGuard only, per the "cleanup paths stay open" rule, so a downgraded
 * user can still wind their list down.
 */
import { Router } from "express";
import { security } from "../../config/security";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { WishlistService } from "./wishlist.service";
import { WishlistCreateSchema, WishlistUpdateSchema } from "./wishlist.schemas";
import { z } from "zod";

const router = Router();

// GET /api/wishlist
router.get(
  "/",
  authGuard,
  requireFeature("wishlist"),
  asyncHandler(async (req: AuthRequest, res) => {
    res.json({ items: await WishlistService.list(req.user!.sub) });
  })
);

// POST /api/wishlist
router.post(
  "/",
  security.createRateLimiter,
  authGuard,
  requireFeature("wishlist"),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = WishlistCreateSchema.parse(req.body);
    const item = await WishlistService.create(req.user!.sub, data);
    await auditAction(req, {
      action: "CREATE",
      entity: "WishlistItem",
      entityId: item.id,
      metadata: { name: item.name },
    });
    res.status(201).json(item);
  })
);

// PUT /api/wishlist/:id
router.put(
  "/:id",
  authGuard,
  requireFeature("wishlist"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = WishlistUpdateSchema.parse(req.body);
    const item = await WishlistService.update(id, req.user!.sub, data);
    await auditAction(req, {
      action: "UPDATE",
      entity: "WishlistItem",
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    res.json(item);
  })
);

// POST /api/wishlist/:id/purchased — toggle bought state (cleanup, ungated).
router.post(
  "/:id/purchased",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const { purchased } = z.object({ purchased: z.boolean() }).parse(req.body);
    const item = await WishlistService.setPurchased(
      id,
      req.user!.sub,
      purchased
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "WishlistItem",
      entityId: id,
      metadata: { purchased },
    });
    res.json(item);
  })
);

// DELETE /api/wishlist/:id (cleanup, ungated)
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await WishlistService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "WishlistItem",
      entityId: id,
    });
    res.status(204).end();
  })
);

export default router;
