import { Router } from "express";
import { AlerteStatus } from "@prisma/client";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { AlertService } from "./alert.service";
import {
  AlertCreateSchema,
  AlertListQuerySchema,
  AlertSnoozeSchema,
} from "./alert.schemas";
import { idParam, paginationQuery } from "../common/schemas";

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
    res.json(
      await AlertService.list(
        ownerUserId,
        q.status as AlerteStatus | undefined,
        page,
        limit
      )
    );
  })
);

// Create a custom (optionally recurring) alert.
router.post(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const body = AlertCreateSchema.parse(req.body);

    // If linked to an article, it must belong to the caller.
    if (body.alerteArticleId != null) {
      const owned = await prisma.article.findFirst({
        where: { articleId: body.alerteArticleId, ownerUserId: req.user!.sub },
        select: { articleId: true },
      });
      if (!owned)
        throw createHttpError(403, "Article not found or not owned by you");
    }

    const created = await AlertService.createCustom({
      ownerUserId: req.user!.sub,
      alerteNom: body.alerteNom,
      alerteDate: body.alerteDate,
      alerteDescription: body.alerteDescription,
      recurrenceMonths: body.recurrenceMonths,
      alerteArticleId: body.alerteArticleId,
    });
    await auditAction(req, {
      action: "CREATE",
      entity: "Alerte",
      entityId: created.alerteId,
      metadata: { kind: "CUSTOM", recurrenceMonths: body.recurrenceMonths },
    });
    res.status(201).json(created);
  })
);

// Snooze a scheduled alert by N days.
router.post(
  "/:id/snooze",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const { days } = AlertSnoozeSchema.parse(req.body);
    const updated = await AlertService.snooze(id, req.user!.sub, days);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Alerte",
      entityId: id,
      metadata: { snoozedDays: days },
    });
    res.json(updated);
  })
);

// Cancel a scheduled alert.
router.post(
  "/:id/cancel",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const updated = await AlertService.cancel(id, req.user!.sub);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Alerte",
      entityId: id,
      metadata: { cancelled: true },
    });
    res.json(updated);
  })
);

export default router;
