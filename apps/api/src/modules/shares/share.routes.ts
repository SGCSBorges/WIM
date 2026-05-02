import { Router } from "express";
import { z } from "zod";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import {
  ShareInviteAcceptSchema,
  ShareInviteCreateSchema,
  ShareUpdateSchema,
} from "./share.schemas";
import { ShareService } from "./share.service";
import { auditAction } from "../common/audit";
import { paginationQuery } from "../common/schemas";

const router = Router();

// émettre une invitation (POWER_USER ou OWNER)
router.post(
  "/invites",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const bodyData = ShareInviteCreateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const data = { ...bodyData, ownerUserId: req.user!.sub };
    const inv = await ShareService.createInvite(data);
    await auditAction(req, {
      action: "CREATE",
      entity: "ShareInvite",
      entityId: inv.shareInviteId,
      metadata: { email: data.email, permission: data.permission },
    });
    res.status(201).json(inv);
  })
);

// accepter une invitation (token)
router.post(
  "/invites/accept",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { token } = ShareInviteAcceptSchema.parse(req.body);
    const result = await ShareService.acceptInvite(token, req.user!.sub);
    await auditAction(req, {
      action: "ACCEPT",
      entity: "InventoryShare",
      metadata: result,
    });
    res.json(result);
  })
);

// liste les invitations envoyées par le user courant
router.get(
  "/invites/sent",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { page, limit } = paginationQuery.parse(req.query);
    const rows = await ShareService.listSentInvites(req.user!.sub, page, limit);
    res.json(rows);
  })
);

// révoquer une invitation envoyée
router.delete(
  "/invites/:inviteId",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const inviteId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.inviteId);
    await ShareService.revokeInvite(inviteId, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "ShareInvite",
      entityId: inviteId,
    });
    res.status(204).send();
  })
);

// listes de partage
router.get(
  "/owned",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { page, limit } = paginationQuery.parse(req.query);
    const rows = await ShareService.listSharesOwned(req.user!.sub, page, limit);
    res.json(rows);
  })
);

router.get(
  "/received",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { page, limit } = paginationQuery.parse(req.query);
    const rows = await ShareService.listSharesReceived(
      req.user!.sub,
      page,
      limit
    );
    res.json(rows);
  })
);

// modification permission (owner only)
router.put(
  "/:targetUserId",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { permission } = ShareUpdateSchema.parse(req.body);
    const targetUserId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.targetUserId);
    const updated = await ShareService.updateShare(
      req.user!.sub,
      targetUserId,
      permission
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "InventoryShare",
      entityId: updated.inventoryShareId,
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
  asyncHandler(async (req: AuthRequest, res) => {
    const targetUserId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.targetUserId);
    await ShareService.revokeShare(req.user!.sub, targetUserId);
    await auditAction(req, {
      action: "DELETE",
      entity: "InventoryShare",
      metadata: { targetUserId },
    });
    res.status(204).send();
  })
);

export default router;
