import { Router } from "express";
import { authGuard, requireRole, AuthRequest } from "../modules/auth/auth.middleware";
import { asyncHandler } from "../modules/common/http";
import { logger } from "../config/logger";
import {
  getDashboardStatistics,
  getBasicStatistics,
  getAdminStatistics,
} from "../services/statistics.service";

const router = Router();

router.get(
  "/dashboard",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = Number(req.user!.sub);
    const role = req.user!.role;
    const statistics = await getDashboardStatistics({ userId, role });
    res.json(statistics);
  })
);

router.get(
  "/basic",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = Number(req.user!.sub);
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
