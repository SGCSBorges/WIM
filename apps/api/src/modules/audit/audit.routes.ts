import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { idParam } from "../common/schemas";

const AuditQuerySchema = z.object({
  limit:    idParam.optional(),
  userId:   idParam.optional(),
  entity:   z.enum(["User", "Article", "Garantie", "Location", "Attachment", "ShareInvite", "InventoryShare", "ArticleLocation"]).optional(),
  entityId: idParam.optional(),
});

const router = Router();

// GET /api/audit?limit=50&userId=...&entity=Article
router.get(
  "/",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: Request, res: Response) => {
    const query = AuditQuerySchema.parse(req.query);
    const limit = query.limit ? Math.min(query.limit, 200) : 50;
    const where: Prisma.AuditLogWhereInput = {};
    if (query.userId)   where.userId   = query.userId;
    if (query.entity)   where.entity   = query.entity;
    if (query.entityId) where.entityId = query.entityId;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { userId: true, email: true, role: true } } },
    });

    res.json(logs);
  })
);

export default router;
