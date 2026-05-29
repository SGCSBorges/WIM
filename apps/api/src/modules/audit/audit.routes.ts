import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@wim/types";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { idParam } from "../common/schemas";

const AuditQuerySchema = z.object({
  limit: idParam.optional(),
  userId: idParam.optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  entity: z.enum(AUDIT_ENTITIES).optional(),
  entityId: idParam.optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
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
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: query.createdFrom } : {}),
        ...(query.createdTo ? { lte: query.createdTo } : {}),
      };
    }

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
