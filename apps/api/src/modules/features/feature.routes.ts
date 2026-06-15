/**
 * GET /api/features — returns a { [featureKey]: boolean } access map for the
 * authenticated user. The client caches this on login and re-fetches when the
 * admin changes flags. No payload; auth is via the standard httpOnly cookie.
 */
import { Router } from "express";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { FeatureService } from "./feature.service";

const router = Router();

router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const role = req.user!.role as "USER" | "POWER_USER" | "ADMIN";
    const map = await FeatureService.getAccessMap(role);
    res.json(map);
  })
);

export default router;
