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
