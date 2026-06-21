/**
 * Reports surface — currently one endpoint, the insurance portfolio PDF.
 * Owner-scoped + auth-guarded; uses the destructiveRateLimiter so a hot
 * loop hitting it can't pull the whole inventory out repeatedly. Pulls the
 * caller's display currency from the User row so the PDF totals match
 * what the dashboard / claim PDF show.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { auditAction } from "../common/audit";
import { security } from "../../config/security";
import { prisma } from "../../libs/prisma";
import { ARTICLE_STATUSES } from "@wim/types";
import { streamPortfolioReportPdf } from "./report.pdf";

const PortfolioFiltersSchema = z.object({
  locationId: z.coerce.number().int().positive().optional(),
  tagId: z.coerce.number().int().positive().optional(),
  warrantyStatus: z
    .enum(["valid", "expiringSoon", "expired", "none"])
    .optional(),
  status: z.enum(ARTICLE_STATUSES).optional(),
});

const router = Router();

router.get(
  "/portfolio.pdf",
  authGuard,
  requireFeature("reports"),
  security.destructiveRateLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    const filters = PortfolioFiltersSchema.parse(req.query);
    const user = await prisma.user.findUnique({
      where: { userId: req.user!.sub },
      select: { currency: true },
    });
    await auditAction(req, {
      action: "DB_EXPORT",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { report: "portfolio", filters },
    });
    await streamPortfolioReportPdf(
      res,
      req.user!.sub,
      user?.currency ?? "USD",
      filters
    );
  })
);

export default router;
