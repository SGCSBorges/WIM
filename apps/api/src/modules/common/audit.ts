import { Request } from "express";
import { AuthRequest } from "../auth/auth.middleware";
import { AuditService, AuditInput } from "../audit/audit.service";

export function extractClient(req: Request) {
  const ip =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    null;
  const ua = req.headers["user-agent"] || null;
  return { ip, ua: ua as string | null };
}

/**
 * Writes an audit log entry, automatically extracting IP and user-agent from the request.
 * Falls back to `(req as AuthRequest).user?.sub` when `params.userId` is not provided.
 */
export async function auditAction(
  req: Request,
  params: Pick<AuditInput, "userId" | "action" | "entity" | "entityId" | "metadata">
) {
  const { ip, ua } = extractClient(req);
  await AuditService.log({
    userId: params.userId ?? (req as AuthRequest).user?.sub ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    metadata: params.metadata,
    ip,
    ua,
  });
}
