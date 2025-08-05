import { Router } from "express";
import { asyncHandler } from "../common/http";
import { authGuard } from "../auth/auth.middleware";
import { AlertService } from "./alert.service";
import { AlertListQuerySchema } from "./alert.schemas";

const router = Router();

// Debug/admin-friendly endpoint (scoped to authenticated owner by default)
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const q = AlertListQuerySchema.parse(req.query);
    const ownerUserId = q.ownerUserId ?? req.user.userId;
    res.json(await AlertService.list(ownerUserId, q.status));
  })
);

export default router;
