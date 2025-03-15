import { prisma } from "../../libs/prisma";

export type AuditInput = {
  userId?: number | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | string;
  entity: "Article" | "Garantie" | "Alerte" | "User" | string;
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
        metadata: metadata ? (metadata as any) : undefined,
        ip: ip ?? null,
        userAgent: ua ?? null,
      },
    });
  },
};
