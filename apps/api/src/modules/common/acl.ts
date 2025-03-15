import { prisma } from "../../libs/prisma";

export async function canReadInventory(
  requesterUserId: number,
  ownerUserId: number
) {
  if (requesterUserId === ownerUserId) return true;
  const share = await prisma.inventoryShare.findFirst({
    where: {
      ownerUserId: ownerUserId,
      targetUserId: requesterUserId,
    },
    select: { permission: true },
  });
  return !!share; // RO ou RW
}

export async function canWriteInventory(
  requesterUserId: number,
  ownerUserId: number
) {
  if (requesterUserId === ownerUserId) return true;
  const share = await prisma.inventoryShare.findFirst({
    where: {
      ownerUserId: ownerUserId,
      targetUserId: requesterUserId,
    },
    select: { permission: true },
  });
  return !!share && share.permission === "RW";
}
