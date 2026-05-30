/**
 * ACL helpers for inventory shares.
 *
 * `canReadInventory` / `canWriteInventory` answer "is the requester
 * allowed to see / edit articles owned by `ownerUserId`?". Owner always
 * passes without a DB lookup; for non-owners we consult `InventoryShare`.
 *
 * NOTE: these helpers are kept ready for future use. The current sharing
 * routes (`shared/shared.routes.ts`) inline the same lookup with their own
 * `active: true` filter — see those routes for the canonical pattern.
 * Anything reusing the helpers must be aware they honour the `active`
 * flag (so revoked shares are excluded; see acl.test.ts).
 */
import { prisma } from "../../libs/prisma";

export async function canReadInventory(
  requesterUserId: number,
  ownerUserId: number
) {
  if (requesterUserId === ownerUserId) return true;
  const share = await prisma.inventoryShare.findFirst({
    where: { ownerUserId, targetUserId: requesterUserId },
    select: { permission: true },
  });
  return !!share; // READ or WRITE
}

export async function canWriteInventory(
  requesterUserId: number,
  ownerUserId: number
) {
  if (requesterUserId === ownerUserId) return true;
  const share = await prisma.inventoryShare.findFirst({
    where: { ownerUserId, targetUserId: requesterUserId },
    select: { permission: true },
  });
  return !!share && (share.permission as string) === "WRITE";
}
