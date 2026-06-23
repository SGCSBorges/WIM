/**
 * Statistics endpoints used by the dashboard and Admin → Dashboard tab.
 *
 *   • GET /api/statistics/dashboard — owner-scoped aggregates +
 *     forecasting buckets (warranties expiring by month, articles
 *     added by month). Drives the user-facing dashboard.
 *   • GET /api/statistics/basic — lightweight counters used in the
 *     navbar / Profile summary.
 *   • GET /api/statistics/admin — platform-wide counters; ADMIN only.
 *
 * No caching; each request recomputes via a handful of grouped Prisma
 * queries. The shapes are pinned by `DashboardStatistics` in @wim/types.
 */
import { Router } from "express";
import {
  authGuard,
  requireRole,
  AuthRequest,
} from "../modules/auth/auth.middleware";
import { asyncHandler } from "../modules/common/http";
import { requireFeature } from "../modules/features/feature.service";
import {
  getDashboardStatistics,
  getBasicStatistics,
  getAdminStatistics,
  getPortfolioAnalytics,
  getBudgetStatus,
} from "../services/statistics.service";

const router = Router();

router.get(
  "/dashboard",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const statistics = await getDashboardStatistics({ userId, role });
    res.json(statistics);
  })
);

// Spending & value analytics — a paid (POWER_USER) BI surface beyond the
// free operational dashboard.
router.get(
  "/analytics",
  authGuard,
  requireFeature("analytics"),
  asyncHandler(async (req: AuthRequest, res) => {
    const analytics = await getPortfolioAnalytics({ userId: req.user!.sub });
    res.json(analytics);
  })
);

// Spend-against-budget for the current month/year. Free for all users.
router.get(
  "/budget",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const status = await getBudgetStatus(req.user!.sub);
    res.json(status);
  })
);

router.get(
  "/basic",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.sub;
    const statistics = await getBasicStatistics({ userId });
    res.json(statistics);
  })
);

router.get(
  "/admin",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const statistics = await getAdminStatistics();
    res.json(statistics);
  })
);

export default router;
