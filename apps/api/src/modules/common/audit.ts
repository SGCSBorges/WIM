import { Request } from "express";
import { AuditService } from "../audit/audit.service";

export function extractClient(req: Request) {
  const ip =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    null;
  const ua = req.headers["user-agent"] || null;
  return { ip, ua: ua as string | null };
}

export async function auditAction(
  req: Request,
  params: {
    userId?: number | null;
    action: string;
    entity: string;
    entityId?: number | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { ip, ua } = extractClient(req);
  await AuditService.log({
    userId: params.userId ?? (req as any).user?.sub ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    metadata: params.metadata,
    ip,
    ua,
  });
}
