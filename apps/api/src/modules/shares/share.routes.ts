import { Router } from "express";
import { authGuard, requireRole } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import {
  ShareInviteAcceptSchema,
  ShareInviteCreateSchema,
  ShareUpdateSchema,
} from "./share.schemas";
import { ShareService } from "./share.service";
import { auditAction } from "../common/audit";

const router = Router();

// émettre une invitation (POWER_USER ou OWNER)
router.post(
  "/invites",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const { email, permission, ttlDays } = ShareInviteCreateSchema.parse(
      req.body
    );
    const inv = await ShareService.createInvite(
      req.user.sub,
      email,
      permission,
      ttlDays
    );
    await auditAction(req, {
      action: "CREATE",
      entity: "ShareInvite",
      entityId: inv.inviteId,
      metadata: { email, permission },
    });
    res.status(201).json(inv);
  })
);

// accepter une invitation (token)
router.post(
  "/invites/accept",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const { token } = ShareInviteAcceptSchema.parse(req.body);
    const result = await ShareService.acceptInvite(token, req.user.sub);
    await auditAction(req, {
      action: "ACCEPT",
      entity: "InventoryShare",
      metadata: result,
    });
    res.json(result);
  })
);

// listes de partage
router.get(
  "/owned",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const rows = await ShareService.listSharesOwned(req.user.sub);
    res.json(rows);
  })
);

router.get(
  "/received",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const rows = await ShareService.listSharesReceived(req.user.sub);
    res.json(rows);
  })
);

// modification permission (owner only)
router.put(
  "/:targetUserId",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const { permission } = ShareUpdateSchema.parse(req.body);
    const targetUserId = Number(req.params.targetUserId);
    const updated = await ShareService.updateShare(
      req.user.sub,
      targetUserId,
      permission
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "InventoryShare",
      entityId: updated.shareId,
      metadata: { permission },
    });
    res.json(updated);
  })
);

// révocation partage (owner only)
router.delete(
  "/:targetUserId",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const targetUserId = Number(req.params.targetUserId);
    await ShareService.revokeShare(req.user.sub, targetUserId);
    await auditAction(req, {
      action: "DELETE",
      entity: "InventoryShare",
      metadata: { targetUserId },
    });
    res.status(204).send();
  })
);

export default router;
