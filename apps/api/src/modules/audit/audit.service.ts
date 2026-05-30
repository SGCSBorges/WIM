/**
 * Audit log writer + retention pruner. Every mutating route calls
 * `auditAction` via the `common/audit.ts` wrapper. The `action` and
 * `entity` types come from @wim/types' const tuples — adding a new value
 * means updating the tuple AND any admin-dropdown that filters by it.
 *
 * `pruneOlderThan` is the daily-maintenance entry point (see
 * jobs/workers.ts). Deletion is chunked-safe via a single
 * `deleteMany({ where: { createdAt: { lt: cutoff } } })`.
 */
import { Prisma } from "@prisma/client";
import type { AuditAction, AuditEntity } from "@wim/types";
import { prisma } from "../../libs/prisma";

export type AuditInput = {
  userId?: number | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  ua?: string | null;
};

export const AuditService = {
  async log(input: AuditInput) {
    const { userId, action, entity, entityId, metadata, ip, ua } = input;
    return prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
        ip: ip ?? null,
        userAgent: ua ?? null,
      },
    });
  },

  /**
   * Delete audit log rows older than the cutoff in chunks so a one-off
   * prune doesn't lock the table or time out a single mega-transaction.
   * Returns the total number of rows removed.
   *
   * Run via `npm --workspace apps/api run prune:audit -- 180` (180 = days)
   * or invoke programmatically.
   */
  async pruneOlderThan(days: number): Promise<{ deleted: number }> {
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error(`pruneOlderThan: days must be > 0 (got ${days})`);
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const BATCH = 1000;
    let total = 0;
    // Loop until a batch comes back empty. Each pass uses a fresh
    // findMany→deleteMany so we never hold one huge transaction open.
    for (;;) {
      const ids = await prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH,
      });
      if (ids.length === 0) break;
      const r = await prisma.auditLog.deleteMany({
        where: { id: { in: ids.map((x) => x.id) } },
      });
      total += r.count;
      if (ids.length < BATCH) break;
    }
    return { deleted: total };
  },
};
