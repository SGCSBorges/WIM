import { Router } from "express";
import { AlerteStatus } from "@prisma/client";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { AlertService } from "./alert.service";
import { AlertListQuerySchema } from "./alert.schemas";
import { paginationQuery } from "../common/schemas";

const router = Router();

// Alerts endpoint - only admins can view alerts for other users
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const q = AlertListQuerySchema.parse(req.query);

    // Only admins can specify ownerUserId to view other users' alerts
    let ownerUserId = req.user!.sub;
    if (q.ownerUserId) {
      if (req.user!.role !== "ADMIN") {
        return res.status(403).json({
          error: "Only administrators can view alerts for other users",
        });
      }
      ownerUserId = q.ownerUserId;
    }

    const { page, limit } = paginationQuery.parse(req.query);
    res.json(await AlertService.list(ownerUserId, q.status as AlerteStatus | undefined, page, limit));
  })
);

export default router;
