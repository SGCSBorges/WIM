/**
 * Reports surface — currently one endpoint, the insurance portfolio PDF.
 * Owner-scoped + auth-guarded; uses the destructiveRateLimiter so a hot
 * loop hitting it can't pull the whole inventory out repeatedly. Pulls the
 * caller's language, currency and date format from the User row so the PDF
 * reads like the screen and its totals match the dashboard / claim PDF.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { auditAction } from "../common/audit";
import { security } from "../../config/security";
import { ARTICLE_STATUSES } from "@wim/types";
import { pdfLocale } from "../common/pdf.i18n";
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
    const loc = await pdfLocale(req.user!.sub);
    await auditAction(req, {
      action: "DB_EXPORT",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { report: "portfolio", filters },
    });
    await streamPortfolioReportPdf(res, req.user!.sub, loc, filters);
  })
);

export default router;
