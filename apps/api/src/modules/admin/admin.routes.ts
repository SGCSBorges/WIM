/**
 * Admin-only routes — every handler sits behind `requireRole("ADMIN")`.
 *
 * Covers: user list/search, inline role edit (with last-admin protection
 * inside a serializable transaction), reset-password (bumps tokenVersion),
 * force-logout (bumps tokenVersion), delete user, audit log (cursor-
 * paginated, filterable by action/entity/date range), dashboard stats,
 * job queue snapshot + failed-job inspector, and full-DB backup/restore.
 */
import express, { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { asyncHandler } from "../common/http";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { roleAtLeast } from "../common/roles";
import { security } from "../../config/security";
import { createHttpError } from "../../utils/http-error";
import { idParam } from "../common/schemas";
import {
  alertQueue,
  maintenanceQueue,
  listFailedJobs,
} from "../../jobs/queues";
import { passwordSchema } from "../auth/auth.schemas";
import { ShareService } from "../shares/share.service";
import { AdminDbService, ImportPayloadSchema } from "./admin.db.service";
import {
  FeatureService,
  FEATURE_KEYS,
  type FeatureKey,
} from "../features/feature.service";

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
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.coerce.number().int().positive().optional(),
});

const InventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
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

const UserListQuerySchema = z.object({
  // Substring match on email (case-insensitive). Trim to keep accidental
  // whitespace from silently breaking the filter.
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["email", "role", "createdAt"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

/** GET /api/admin/users - List all users (Admin only) */
router.get(
  "/users",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    // Paginatable so instances with >500 users aren't silently truncated.
    // Defaults preserve the previous behaviour (first 500, newest first).
    const query = UserListQuerySchema.parse(req.query);
    const page = query.page ?? 1;
    const limit = Math.min(500, query.limit ?? 500);
    const sortField = query.sort ?? "createdAt";
    const sortDir = query.dir ?? "desc";
    const users = await prisma.user.findMany({
      where: query.q
        ? { email: { contains: query.q, mode: "insensitive" } }
        : undefined,
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { [sortField]: sortDir },
    });
    res.json(users);
  })
);

/** DELETE /api/admin/users/:id - Delete user and all their data (Admin only) */
router.delete(
  "/users/:id",
  security.destructiveRateLimiter,
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = idParam.parse(req.params.id);

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "User not found");

    // Wrap count-check and delete in a serializable transaction so two
    // concurrent admin-deletion requests cannot both bypass the last-admin guard.
    // The role is re-read inside the tx — the snapshot above is only for the
    // audit metadata and could be stale by the time the tx runs.
    await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { userId },
          select: { role: true },
        });
        if (!fresh) throw createHttpError(404, "User not found");
        if (fresh.role === "ADMIN") {
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
        // Re-read the role inside the tx — the snapshot above is for audit
        // metadata only; a concurrent role change between the outer read and
        // this tx would otherwise defeat the last-admin guard.
        const fresh = await tx.user.findUnique({
          where: { userId },
          select: { role: true },
        });
        if (!fresh) throw createHttpError(404, "User not found");

        if (
          fresh.role === "ADMIN" &&
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
            // Bump tokenVersion when email changes so all of the target user's
            // existing sessions are invalidated on their next request.
            ...(data.email !== undefined && data.email !== target.email
              ? { tokenVersion: { increment: 1 } }
              : {}),
          },
          select: {
            userId: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        // Clean up sharing whenever a share-capable role (POWER_USER or
        // ADMIN — ADMIN inherits sharing) is demoted to one that can't share
        // (USER). Covers POWER_USER→USER and ADMIN→USER; a POWER_USER↔ADMIN
        // move keeps shares since both can share.
        if (
          roleAtLeast(fresh.role, "POWER_USER") &&
          data.role !== undefined &&
          !roleAtLeast(data.role, "POWER_USER")
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
  security.destructiveRateLimiter,
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

    void prisma.userSession
      .updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => {});

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
    const where: Prisma.AuditLogWhereInput = {
      ...(q.userId !== undefined ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.createdFrom || q.createdTo
        ? {
            createdAt: {
              ...(q.createdFrom ? { gte: q.createdFrom } : {}),
              ...(q.createdTo ? { lte: q.createdTo } : {}),
            },
          }
        : {}),
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
    const { page, limit } = InventoryQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    // Resolve the three queries in parallel so a user with thousands of
    // articles doesn't add three sequential round-trips. The user lookup
    // is cheap; the relation lookups respect the page window.
    const [
      user,
      articlesOwned,
      warrantiesOwned,
      totalArticles,
      totalWarranties,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { userId },
        select: { userId: true, email: true },
      }),
      prisma.article.findMany({
        where: { ownerUserId: userId },
        orderBy: { articleId: "desc" },
        take: limit,
        skip,
        include: {
          garantie: {
            select: {
              garantieId: true,
              garantieNom: true,
              garantieIsValide: true,
            },
          },
        },
      }),
      prisma.garantie.findMany({
        where: { ownerUserId: userId },
        orderBy: { garantieId: "desc" },
        take: limit,
        skip,
        include: {
          article: {
            select: {
              articleNom: true,
              articleModele: true,
            },
          },
        },
      }),
      prisma.article.count({ where: { ownerUserId: userId } }),
      prisma.garantie.count({ where: { ownerUserId: userId } }),
    ]);

    if (!user) throw createHttpError(404, "User not found");

    res.json({
      userId: user.userId,
      email: user.email,
      articlesOwned,
      warrantiesOwned,
      pagination: {
        page,
        limit,
        totalArticles,
        totalWarranties,
      },
    });
  })
);

/**
 * GET /api/admin/db/export
 *
 * Streams the full database as a single JSON document for migration to
 * another provider. ADMIN only. Audited as DB_EXPORT.
 */
router.get(
  "/db/export",
  security.destructiveRateLimiter,
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const dump = await AdminDbService.exportAll();
    await auditAction(req, {
      userId: req.user!.sub,
      action: "DB_EXPORT",
      entity: "Database",
      metadata: { counts: dump.counts },
    });
    const filename = `wim-backup-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(dump));
  })
);

// Dedicated JSON parser for /db/import. The global parser caps at 1mb so
// every other endpoint stays cheap; a full-DB dump can easily exceed that.
const importBodyParser = express.json({ limit: "100mb" });

/**
 * POST /api/admin/db/import
 *
 * Replaces every row in the database with the contents of the uploaded
 * JSON dump. ADMIN only. Requires `confirm: "REPLACE"` to be set on the
 * payload (defence against accidental overwrite). The calling admin's
 * session is force-invalidated afterwards because their User row was
 * just replaced — they'll need to log back in.
 */
router.post(
  "/db/import",
  security.destructiveRateLimiter,
  authGuard,
  requireRole("ADMIN"),
  importBodyParser,
  asyncHandler(async (req: AuthRequest, res) => {
    const ConfirmedSchema = z.object({
      confirm: z.literal("REPLACE"),
      currentPassword: z.string().min(1),
      keepStripeIds: z.boolean().optional(),
      payload: ImportPayloadSchema,
    });
    const parsed = ConfirmedSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(
        400,
        `Invalid import payload: ${parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`
      );
    }

    // Re-prompt for the admin's own password before nuking the database.
    // Stops a stolen-but-still-valid session cookie from triggering a
    // full-DB rewrite without explicit re-authentication.
    const me = await prisma.user.findUnique({
      where: { userId: req.user!.sub },
      select: { password: true },
    });
    if (!me) throw createHttpError(401, "User no longer exists");
    const valid = await bcrypt.compare(
      parsed.data.currentPassword,
      me.password
    );
    if (!valid) throw createHttpError(401, "Invalid password");

    // Audit BEFORE the destructive write so a crash mid-import still leaves
    // a forensic trail in the (about-to-be-replaced) audit log. The row
    // itself doesn't survive the TRUNCATE — but a copy is also written to
    // the structured log via logger.info inside importAll, and the post-
    // import audit entry below records the outcome.
    await auditAction(req, {
      userId: req.user!.sub,
      action: "DB_IMPORT",
      entity: "Database",
      metadata: {
        stage: "pre-truncate",
        counts: {
          users: parsed.data.payload.tables.users.length,
          articles: parsed.data.payload.tables.articles.length,
          locations: parsed.data.payload.tables.locations.length,
          garanties: parsed.data.payload.tables.garanties.length,
          attachments: parsed.data.payload.tables.attachments.length,
          auditLogs: parsed.data.payload.tables.auditLogs.length,
        },
        keepStripeIds: parsed.data.keepStripeIds === true,
        exportedAt: parsed.data.payload.exportedAt ?? null,
      },
    });

    const result = await AdminDbService.importAll(parsed.data.payload, {
      keepStripeIds: parsed.data.keepStripeIds,
    });

    // Audit the outcome too. This row sits on top of the freshly-restored
    // log, so the chain reads pre-truncate → import succeeded.
    await auditAction(req, {
      userId: req.user!.sub,
      action: "DB_IMPORT",
      entity: "Database",
      metadata: { stage: "post-import", counts: result.counts },
    });

    res.json({
      ok: true,
      counts: result.counts,
      // Client should treat this as a hard logout — the user table has
      // been wiped and re-seeded, the caller's tokenVersion is no longer
      // authoritative.
      sessionInvalidated: true,
    });
  })
);

/**
 * GET /api/admin/jobs
 *
 * Per-queue counts (waiting / active / delayed / completed / failed) for the
 * two BullMQ queues + the next-scheduled timestamp for the audit-prune
 * repeatable. ADMIN-only. The endpoint is a thin read; if Redis is down the
 * counters return null so the UI can render "degraded" instead of erroring.
 */
router.get(
  "/jobs",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const [alertCounts, maintenanceCounts, repeatables] = await Promise.all([
      alertQueue.getJobCounts().catch(() => null),
      maintenanceQueue.getJobCounts().catch(() => null),
      maintenanceQueue.getRepeatableJobs().catch(() => []),
    ]);
    const auditPrune = repeatables.find((r) => r.id === "audit-prune-daily");
    res.json({
      alerts: alertCounts,
      maintenance: maintenanceCounts,
      auditPruneNextRun: auditPrune?.next ?? null,
    });
  })
);

/** GET the last N (capped 100) failed jobs across both queues. Used by the
 *  Admin Jobs tab's "Recent failures" expander. */
router.get(
  "/failed-jobs",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const items = await listFailedJobs(50);
    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

const FeatureFlagBodySchema = z.object({
  requiredRole: z.enum(["USER", "POWER_USER", "ADMIN"]),
});

const FeatureTempGrantBodySchema = z.object({
  featureKey: z.enum([...FEATURE_KEYS] as [FeatureKey, ...FeatureKey[]]),
  expiresAt: z.coerce.date(),
  note: z.string().max(255).optional(),
});

/** GET /api/admin/features — current state of all feature flags + active grants. */
router.get(
  "/features",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const [flags, grants] = await Promise.all([
      FeatureService.getAllFlags(),
      FeatureService.getActiveGrants(),
    ]);
    res.json({ flags, grants });
  })
);

/** PUT /api/admin/features/:key — update the required role for a feature. */
router.put(
  "/features/:key",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!(FEATURE_KEYS as readonly string[]).includes(key)) {
      throw createHttpError(400, `Unknown feature key: ${key}`);
    }
    const { requiredRole } = FeatureFlagBodySchema.parse(req.body);
    await FeatureService.setFlag(key as FeatureKey, requiredRole);
    res.json({ featureKey: key, requiredRole });
  })
);

/** POST /api/admin/features/grants — create a temporary access grant. */
router.post(
  "/features/grants",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { featureKey, expiresAt, note } = FeatureTempGrantBodySchema.parse(req.body);
    if (expiresAt <= new Date()) {
      throw createHttpError(400, "expiresAt must be in the future");
    }
    const grant = await FeatureService.createGrant(featureKey, expiresAt, note);
    res.status(201).json(grant);
  })
);

/** DELETE /api/admin/features/grants/:id — revoke a temporary grant. */
router.delete(
  "/features/grants/:id",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw createHttpError(400, "Invalid grant id");
    }
    await FeatureService.deleteGrant(id).catch(() => {
      throw createHttpError(404, "Grant not found");
    });
    res.status(204).end();
  })
);

export default router;
