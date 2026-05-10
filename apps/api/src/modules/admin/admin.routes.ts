import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../../libs/prisma";
import { asyncHandler } from "../common/http";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { createHttpError } from "../../utils/http-error";
import { idParam } from "../common/schemas";
import { passwordSchema } from "../auth/auth.schemas";
import { ShareService } from "../shares/share.service";

const router = Router();

const RoleSchema = z.enum(["USER", "POWER_USER", "ADMIN"]);

const CreateUserSchema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
  password: passwordSchema,
  role: RoleSchema.default("USER"),
});

const UpdateUserSchema = z
  .object({
    email: z
      .string()
      .email()
      .transform((s) => s.toLowerCase().trim())
      .optional(),
    role: RoleSchema.optional(),
  })
  .refine((d) => d.email !== undefined || d.role !== undefined, {
    message: "At least one of email or role must be provided",
  });

const ResetPasswordSchema = z.object({ password: passwordSchema });

const AuditLogQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).max(80).optional(),
  entity: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.coerce.number().int().positive().optional(),
});

/** GET /api/admin/db-stats - Database statistics (Admin only) */
router.get(
  "/db-stats",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const stats = {
      users: await prisma.user.count(),
      articles: await prisma.article.count(),
      warranties: await prisma.garantie.count(),
      auditLogs: await prisma.auditLog.count(),
      alerts: await prisma.alerte.count(),
    };

    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const recentArticles = await prisma.article.findMany({
      take: 5,
      orderBy: { articleId: "desc" },
      select: {
        articleId: true,
        articleNom: true,
        articleModele: true,
        owner: {
          select: {
            email: true,
          },
        },
      },
    });

    res.json({
      stats,
      recent: {
        users: recentUsers,
        articles: recentArticles,
      },
    });
  })
);

/** GET /api/admin/users - List all users (Admin only) */
router.get(
  "/users",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  })
);

/** DELETE /api/admin/users/:id - Delete user and all their data (Admin only) */
router.delete(
  "/users/:id",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = idParam.parse(req.params.id);

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "User not found");

    // Wrap count-check and delete in a serializable transaction so two
    // concurrent admin-deletion requests cannot both bypass the last-admin guard.
    await prisma.$transaction(
      async (tx) => {
        if (user.role === "ADMIN") {
          const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
          if (adminCount <= 1)
            throw createHttpError(400, "Cannot delete the last admin user");
        }
        await tx.user.delete({ where: { userId } });
      },
      { isolationLevel: "Serializable" }
    );

    await auditAction(req, {
      userId: req.user!.sub,
      action: "DELETE",
      entity: "User",
      entityId: userId,
      metadata: { deletedEmail: user.email, deletedRole: user.role },
    });

    res.status(204).send();
  })
);

/** POST /api/admin/users - Create a new user (Admin only) */
router.post(
  "/users",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = CreateUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
      select: { userId: true },
    });
    if (existing) throw createHttpError(409, "Email already registered");

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { email: data.email, password: hashed, role: data.role },
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await auditAction(req, {
      userId: req.user!.sub,
      action: "CREATE",
      entity: "User",
      entityId: user.userId,
      metadata: { createdEmail: user.email, createdRole: user.role },
    });

    res.status(201).json(user);
  })
);

/** PATCH /api/admin/users/:id - Update user role and/or email (Admin only) */
router.patch(
  "/users/:id",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = idParam.parse(req.params.id);
    const data = UpdateUserSchema.parse(req.body);

    const target = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });
    if (!target) throw createHttpError(404, "User not found");

    // Last-admin protection: if we're demoting an ADMIN, make sure another
    // ADMIN exists. Wrap in a serializable transaction so two concurrent
    // demotion requests can't both pass the check.
    //
    // We also clean up sharing artefacts when a POWER_USER drops to a
    // non-POWER role — orphaned shares would otherwise keep publishing
    // the demoted user's inventory to others.
    let downgradeCleanupCounts: Awaited<
      ReturnType<typeof ShareService.cleanupSharingForUser>
    > | null = null;
    const updated = await prisma.$transaction(
      async (tx) => {
        if (
          target.role === "ADMIN" &&
          data.role !== undefined &&
          data.role !== "ADMIN"
        ) {
          const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
          if (adminCount <= 1)
            throw createHttpError(400, "Cannot demote the last admin user");
        }

        if (data.email && data.email !== target.email) {
          const conflict = await tx.user.findUnique({
            where: { email: data.email },
            select: { userId: true },
          });
          if (conflict && conflict.userId !== userId)
            throw createHttpError(409, "Email already registered");
        }

        const result = await tx.user.update({
          where: { userId },
          data: {
            ...(data.email !== undefined ? { email: data.email } : {}),
            ...(data.role !== undefined ? { role: data.role } : {}),
          },
          select: {
            userId: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (
          target.role === "POWER_USER" &&
          data.role !== undefined &&
          data.role !== "POWER_USER"
        ) {
          downgradeCleanupCounts = await ShareService.cleanupSharingForUser(
            userId,
            tx
          );
        }

        return result;
      },
      { isolationLevel: "Serializable" }
    );

    await auditAction(req, {
      userId: req.user!.sub,
      action: "UPDATE",
      entity: "User",
      entityId: userId,
      metadata: {
        before: { email: target.email, role: target.role },
        after: { email: updated.email, role: updated.role },
        ...(downgradeCleanupCounts
          ? { downgradeCleanup: downgradeCleanupCounts }
          : {}),
      },
    });

    res.json(updated);
  })
);

/** POST /api/admin/users/:id/reset-password - Set a new password (Admin only) */
router.post(
  "/users/:id/reset-password",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = idParam.parse(req.params.id);
    const { password } = ResetPasswordSchema.parse(req.body);

    const target = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true },
    });
    if (!target) throw createHttpError(404, "User not found");

    const hashed = await bcrypt.hash(password, 10);
    // Bumping tokenVersion invalidates any session minted before the reset.
    await prisma.user.update({
      where: { userId },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });

    await auditAction(req, {
      userId: req.user!.sub,
      action: "UPDATE",
      entity: "User",
      entityId: userId,
      metadata: { resetPasswordFor: target.email },
    });

    res.status(204).send();
  })
);

/** POST /api/admin/users/:id/force-logout - Invalidate all of a user's sessions */
router.post(
  "/users/:id/force-logout",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = idParam.parse(req.params.id);

    const target = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true },
    });
    if (!target) throw createHttpError(404, "User not found");

    await prisma.user.update({
      where: { userId },
      data: { tokenVersion: { increment: 1 } },
    });

    await auditAction(req, {
      userId: req.user!.sub,
      action: "FORCE_LOGOUT",
      entity: "User",
      entityId: userId,
      metadata: { email: target.email },
    });

    res.status(204).send();
  })
);

/** GET /api/admin/audit-log - Paginated audit log (Admin only) */
router.get(
  "/audit-log",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const q = AuditLogQuerySchema.parse(req.query);
    const where = {
      ...(q.userId !== undefined ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
    };

    // Cursor pagination on `id` desc — stable + index-friendly.
    const entries = await prisma.auditLog.findMany({
      where,
      take: q.limit + 1,
      orderBy: { id: "desc" },
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        action: true,
        entity: true,
        entityId: true,
        method: true,
        path: true,
        status: true,
        metadata: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });

    const hasMore = entries.length > q.limit;
    const page = hasMore ? entries.slice(0, q.limit) : entries;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    res.json({ entries: page, nextCursor });
  })
);

/** GET /api/admin/users/:id/inventory - Get user's inventory details (Admin only) */
router.get(
  "/users/:id/inventory",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const userId = idParam.parse(req.params.id);

    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        articlesOwned: {
          take: 500,
          include: {
            garantie: {
              select: {
                garantieId: true,
                garantieNom: true,
                garantieIsValide: true,
              },
            },
          },
        },
        warrantiesOwned: {
          take: 500,
          include: {
            article: {
              select: {
                articleNom: true,
                articleModele: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw createHttpError(404, "User not found");

    res.json({
      userId: user.userId,
      email: user.email,
      articlesOwned: user.articlesOwned,
      warrantiesOwned: user.warrantiesOwned,
    });
  })
);

export default router;
