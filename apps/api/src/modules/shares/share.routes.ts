/**
 * Per-user inventory sharing — invite create/accept/revoke flows + the
 * owner's view of their outgoing shares. Every route here requires
 * POWER_USER on both ends; the `requireFeature("sharing")` guard pairs
 * with `ShareService.createInvite` which double-checks the invitee
 * actually exists as a POWER_USER (so a downgrade-then-re-upgrade race
 * can't accept a stale invite). Invite mutations are rate-limited per
 * IP so a compromised account can't weaponize the email pipe.
 */
import { Router } from "express";
import { z } from "zod";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import {
  ShareInviteAcceptSchema,
  ShareInviteCreateSchema,
  ShareUpdateSchema,
} from "./share.schemas";
import { ShareService } from "./share.service";
import { auditAction } from "../common/audit";
import { paginationQuery } from "../common/schemas";
import { security } from "../../config/security";

const router = Router();

// émettre une invitation (POWER_USER ou OWNER)
router.post(
  "/invites",
  // Per-IP cap so a compromised POWER_USER account can't be weaponized
  // to spam invite emails (and phishing links) to a wide audience.
  security.destructiveRateLimiter,
  authGuard,
  requireFeature("sharing"),
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

// accepter une invitation (token). Inventory shares are POWER_USER-only
// on both sides — the createInvite path enforces it for the recipient at
// invite time, but a previously-power-user could lose the role between
// invite and accept; the route guard catches that.
router.post(
  "/invites/accept",
  authGuard,
  requireFeature("sharing"),
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
  requireFeature("sharing"),
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
  requireFeature("sharing"),
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
