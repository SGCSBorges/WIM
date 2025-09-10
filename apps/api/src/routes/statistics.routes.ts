/**
 * Statistics Routes
 * API endpoints for dashboard statistics and analytics
 */

import { Router } from "express";
import { authGuard, requireRole } from "../modules/auth/auth.middleware";
import {
  getDashboardStatistics,
  getBasicStatistics,
  getAdminStatistics,
} from "../services/statistics.service";

const router = Router();

/**
 * GET /api/statistics/dashboard
 * Get comprehensive dashboard statistics
 */
router.get("/dashboard", authGuard, async (req, res) => {
  try {
    const userId = Number((req as any).user?.sub);
    const role = String((req as any).user?.role || "USER");
    const statistics = await getDashboardStatistics({ userId, role });
    res.json(statistics);
  } catch (error) {
    console.error(
      "[Statistics API] Error fetching dashboard statistics:",
      error
    );
    res.status(500).json({ error: "Failed to fetch dashboard statistics" });
  }
});

/**
 * GET /api/statistics/basic
 * Get basic statistics for quick overview
 */
router.get("/basic", authGuard, async (req, res) => {
  try {
    const userId = Number((req as any).user?.sub);
    const statistics = await getBasicStatistics({ userId });
    res.json(statistics);
  } catch (error) {
    console.error("[Statistics API] Error fetching basic statistics:", error);
    res.status(500).json({ error: "Failed to fetch basic statistics" });
  }
});

/**
 * GET /api/statistics/admin
 * Get admin dashboard statistics (global totals, Admin only)
 */
router.get("/admin", authGuard, requireRole("ADMIN"), async (req, res) => {
  try {
    const statistics = await getAdminStatistics();
    res.json(statistics);
  } catch (error) {
    console.error("[Statistics API] Error fetching admin statistics:", error);
    res.status(500).json({ error: "Failed to fetch admin statistics" });
  }
});

export default router;
