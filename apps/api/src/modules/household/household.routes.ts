/**
 * Household routes. Create/invite/accept are gated on the `household`
 * feature (POWER_USER default); GET, leave, remove-member, and
 * revoke-invite stay on authGuard only — per the "cleanup paths stay open"
 * rule, a downgraded user can still see their membership and wind it down.
 */
import { Router } from "express";
import { z } from "zod";
import { security } from "../../config/security";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { idParam, normalizedEmail } from "../common/schemas";
import { HouseholdService } from "./household.service";

const router = Router();

const CreateSchema = z.object({ name: z.string().trim().min(1).max(120) });
const InviteSchema = z.object({ email: normalizedEmail });
const AcceptSchema = z.object({
  token: z.string().trim().min(32).max(128),
});

// GET /api/household — the caller's household (or { household: null }).
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json({ household: await HouseholdService.get(req.user!.sub) });
  })
);

// POST /api/household — create one (caller becomes OWNER).
router.post(
  "/",
  security.createRateLimiter,
  authGuard,
  requireFeature("household"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { name } = CreateSchema.parse(req.body);
    const household = await HouseholdService.create(req.user!.sub, name);
    await auditAction(req, {
      action: "CREATE",
      entity: "Household",
      entityId: household.id,
      metadata: { name },
    });
    res.status(201).json(household);
  })
);

// POST /api/household/invites — OWNER invites a Power User by email.
router.post(
  "/invites",
  security.createRateLimiter,
  authGuard,
  requireFeature("household"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { email } = InviteSchema.parse(req.body);
    const invite = await HouseholdService.invite(req.user!.sub, email);
    await auditAction(req, {
      action: "CREATE",
      entity: "Household",
      entityId: invite.householdId,
      metadata: { invite: invite.id },
    });
    res.status(201).json({
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt,
    });
  })
);

// POST /api/household/invites/accept — join via emailed token.
router.post(
  "/invites/accept",
  authGuard,
  requireFeature("household"),
  asyncHandler(async (req: AuthRequest, res) => {
    const { token } = AcceptSchema.parse(req.body);
    const result = await HouseholdService.accept(token, req.user!.sub);
    await auditAction(req, {
      action: "ACCEPT",
      entity: "Household",
      entityId: result.householdId,
    });
    res.json(result);
  })
);

// DELETE /api/household/invites/:id — OWNER revokes a pending invite (open).
router.delete(
  "/invites/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await HouseholdService.revokeInvite(req.user!.sub, id);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Household",
      metadata: { inviteRevoked: id },
    });
    res.status(204).end();
  })
);

// POST /api/household/leave — leave your household (open).
router.post(
  "/leave",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const result = await HouseholdService.leave(req.user!.sub);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Household",
      entityId: result.householdId,
      metadata: { left: true },
    });
    res.status(204).end();
  })
);

// DELETE /api/household/members/:userId — OWNER removes a member (open).
router.delete(
  "/members/:userId",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const targetUserId = idParam.parse(req.params.userId);
    const result = await HouseholdService.removeMember(
      req.user!.sub,
      targetUserId
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "Household",
      entityId: result.householdId,
      metadata: { memberRemoved: targetUserId },
    });
    res.status(204).end();
  })
);

export default router;
