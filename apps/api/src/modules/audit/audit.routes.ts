import { Router, Request, Response } from "express";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";

const router = Router();

// GET /api/audit?limit=50&userId=...&entity=Article
router.get(
  "/",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const where: any = {};
    if (req.query.userId) where.userId = Number(req.query.userId);
    if (req.query.entity) where.entity = String(req.query.entity);
    if (req.query.entityId) where.entityId = Number(req.query.entityId);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      take: limit,
      include: { user: { select: { userId: true, email: true, role: true } } },
    });

    res.json(logs);
  })
);

export default router;
