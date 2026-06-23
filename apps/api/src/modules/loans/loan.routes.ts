/**
 * Loan/borrow routes — track who has an item and when it's due back. All
 * owner-scoped via `authGuard` + service-level ownership checks. Creating a
 * loan is rate-limited (it writes a row + may schedule a reminder).
 */
import { Router } from "express";
import { z } from "zod";
import { security } from "../../config/security";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { LoanService } from "./loan.service";
import { LoanCreateSchema } from "./loan.schemas";

const router = Router();

const ListQuery = z.object({
  active: z.coerce.boolean().optional(),
  articleId: z.coerce.number().int().positive().optional(),
});

// GET /api/loans?active=1&articleId=42
router.get(
  "/",
  authGuard,
  requireFeature("loans"),
  asyncHandler(async (req: AuthRequest, res) => {
    const q = ListQuery.parse(req.query);
    const items = await LoanService.list(req.user!.sub, {
      activeOnly: q.active,
      articleId: q.articleId,
    });
    res.json({ items });
  })
);

// POST /api/loans — lend an item out.
router.post(
  "/",
  security.createRateLimiter,
  authGuard,
  requireFeature("loans"),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = LoanCreateSchema.parse(req.body);
    const loan = await LoanService.create(req.user!.sub, data);
    await auditAction(req, {
      action: "CREATE",
      entity: "Loan",
      entityId: loan.loanId,
      metadata: { articleId: data.articleId, dueAt: data.dueAt ?? null },
    });
    res.status(201).json(loan);
  })
);

// POST /api/loans/:id/return — mark an item returned.
router.post(
  "/:id/return",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const loan = await LoanService.markReturned(id, req.user!.sub);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Loan",
      entityId: id,
      metadata: { returned: true },
    });
    res.json(loan);
  })
);

// DELETE /api/loans/:id
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    await LoanService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Loan",
      entityId: id,
    });
    res.status(204).end();
  })
);

export default router;
