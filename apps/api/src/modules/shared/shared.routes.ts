import { Router } from "express";
import { z } from "zod";
import { Prisma, SharePermission } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { paginationQuery, idParam } from "../common/schemas";
import { auditAction } from "../common/audit";
import { createHttpError } from "../../utils/http-error";

const router = Router();

// Reduced article-update schema for non-owners with WRITE permission. We
// deliberately *don't* let shared editors touch warranty, locations, or
// owner-only fields — those are the article owner's responsibility.
const SharedArticleEditSchema = z.object({
  articleNom: z.string().min(1).max(120).optional(),
  articleModele: z.string().min(1).max(120).optional(),
  articleDescription: z.string().max(2000).nullable().optional(),
  productImageUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "productImageUrl must be an http(s) URL",
    })
    .max(500)
    .nullable()
    .optional(),
});

type SharedArticleInclude = Prisma.ArticleGetPayload<{
  include: {
    owner: { select: { userId: true; email: true } };
    garantie: true;
    locations: {
      select: { locationId: true; location: { select: { name: true } } };
    };
  };
}>;

/**
 * Shared (read/write) views for POWER_USER.
 *
 * Two paths to seeing someone else's article:
 *   - "global"  — owner flipped Article.sharedWithPowerUsers to true. Read
 *     only. Visible to every POWER_USER.
 *   - "user"    — owner created an InventoryShare with this viewer (via an
 *     accepted invite or direct share). Permission is READ or WRITE.
 *
 * The response merges both; if the same article is reachable via both
 * paths the per-user permission wins (so a WRITE share isn't downgraded
 * by also being globally shared).
 */

// GET /api/shared/articles - list articles shared *to* me from either path
router.get(
  "/articles",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const viewerUserId = req.user!.sub;
    const { page, limit } = paginationQuery.parse(req.query);

    // 1. Active per-user shares incoming to the viewer.
    const incomingShares = await prisma.inventoryShare.findMany({
      where: { targetUserId: viewerUserId, active: true },
      select: { ownerUserId: true, permission: true },
    });
    const sharerPermission = new Map<number, SharePermission>(
      incomingShares.map((s) => [s.ownerUserId, s.permission])
    );
    const sharerIds = Array.from(sharerPermission.keys());

    const articleInclude = {
      owner: { select: { userId: true, email: true } },
      garantie: true,
      locations: {
        select: {
          locationId: true,
          location: { select: { name: true } },
        },
      },
    } satisfies Prisma.ArticleInclude;

    // OR query: globally-shared articles + articles owned by users who
    // have shared their inventory with the viewer. Excludes the viewer's
    // own articles either way.
    const orClauses: Prisma.ArticleWhereInput[] = [
      { sharedWithPowerUsers: true },
    ];
    if (sharerIds.length > 0)
      orClauses.push({ ownerUserId: { in: sharerIds } });

    const articles: SharedArticleInclude[] = await prisma.article.findMany({
      where: {
        ownerUserId: { not: viewerUserId },
        deletedAt: null,
        OR: orClauses,
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { updatedAt: "desc" },
      include: articleInclude,
    });

    // Annotate each row with how it became visible. Per-user permission
    // wins because it's strictly more specific (and may grant WRITE).
    res.json(
      articles.map((a) => {
        const userPerm = sharerPermission.get(a.ownerUserId);
        const source: "user" | "global" = userPerm ? "user" : "global";
        const permission: "READ" | "WRITE" = userPerm ?? "READ";
        return {
          rowId: a.articleId,
          source,
          permission,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          owner: a.owner,
          article: a,
        };
      })
    );
  })
);

// PUT /api/shared/articles/:id — non-owner edit of an article they have
// WRITE permission on. Limited to the basic article fields; warranty,
// locations, and ownership stay with the article owner.
router.put(
  "/articles/:id",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const data = SharedArticleEditSchema.parse(req.body);

    const article = await prisma.article.findFirst({
      where: { articleId: id, deletedAt: null },
      select: { articleId: true, ownerUserId: true },
    });
    if (!article) throw createHttpError(404, "Article not found");
    if (article.ownerUserId === req.user!.sub)
      throw createHttpError(
        400,
        "Use the regular /api/articles endpoint for your own articles"
      );

    const writeShare = await prisma.inventoryShare.findFirst({
      where: {
        ownerUserId: article.ownerUserId,
        targetUserId: req.user!.sub,
        active: true,
        permission: "WRITE",
      },
      select: { inventoryShareId: true },
    });
    if (!writeShare)
      throw createHttpError(403, "You don't have WRITE access to this article");

    // Direct partial update — no warranty/locations side-effects, those
    // belong to the owner. Only the small subset whitelisted by the schema.
    const updated = await prisma.article.update({
      where: { articleId: id },
      data,
      include: {
        owner: { select: { userId: true, email: true } },
        garantie: true,
        locations: {
          select: {
            locationId: true,
            location: { select: { name: true } },
          },
        },
      },
    });

    await auditAction(req, {
      userId: req.user!.sub,
      action: "UPDATE",
      entity: "Article",
      entityId: id,
      metadata: {
        sharedEdit: true,
        ownerUserId: article.ownerUserId,
        fields: Object.keys(data),
      },
    });

    res.json(updated);
  })
);

export default router;
