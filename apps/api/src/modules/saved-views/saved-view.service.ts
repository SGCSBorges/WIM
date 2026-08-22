/**
 * Saved-view service. Per-user named filter views for the Articles list —
 * the `query` field holds a URL search-string the UI re-applies via
 * setSearchParams. Owner-scoped CRUD; nothing fancier.
 *
 * Two opt-in extras: one view can be the owner's default
 * (auto-applied on the Articles page), and a view can be shared read-only
 * with the owner's household members.
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";

const viewSelect = {
  id: true,
  name: true,
  query: true,
  isDefault: true,
  sharedWithHousehold: true,
} as const;

// The other members of the caller's household (empty if none). Used to scope
// the shared-view read without exposing which household a view belongs to.
async function householdPeers(userId: number): Promise<number[]> {
  const me = await prisma.householdMember.findUnique({
    where: { userId },
    select: { householdId: true },
  });
  if (!me) return [];
  const rows = await prisma.householdMember.findMany({
    where: { householdId: me.householdId, userId: { not: userId } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export const SavedViewService = {
  list: (ownerUserId: number) =>
    prisma.savedView.findMany({
      where: { ownerUserId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: viewSelect,
    }),

  // Views other household members have opted into sharing. Read-only for the
  // caller; carries the owner's email as `ownerName` so the UI can attribute
  // it. Empty when the caller isn't in a household.
  listShared: async (userId: number) => {
    const peers = await householdPeers(userId);
    if (peers.length === 0) return [];
    const rows = await prisma.savedView.findMany({
      where: { ownerUserId: { in: peers }, sharedWithHousehold: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        query: true,
        owner: { select: { email: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      query: r.query,
      ownerName: r.owner.email,
    }));
  },

  // Unique (ownerUserId, name) → a duplicate surfaces as 409 via the global
  // Prisma error handler.
  create: (ownerUserId: number, name: string, query: string) =>
    prisma.savedView.create({
      data: { ownerUserId, name, query },
      select: viewSelect,
    }),

  // At most one default per owner. Clearing + setting run in one transaction
  // so a crash can't leave two defaults. `makeDefault:false` just clears this
  // row's flag.
  setDefault: async (id: number, ownerUserId: number, makeDefault: boolean) => {
    const owned = await prisma.savedView.findFirst({
      where: { id, ownerUserId },
      select: { id: true },
    });
    if (!owned) throw createHttpError(404, "Saved view not found");
    await prisma.$transaction(async (tx) => {
      if (makeDefault)
        await tx.savedView.updateMany({
          where: { ownerUserId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      await tx.savedView.update({
        where: { id },
        data: { isDefault: makeDefault },
      });
    });
    return prisma.savedView.findFirstOrThrow({
      where: { id, ownerUserId },
      select: viewSelect,
    });
  },

  setShared: async (id: number, ownerUserId: number, shared: boolean) => {
    const result = await prisma.savedView.updateMany({
      where: { id, ownerUserId },
      data: { sharedWithHousehold: shared },
    });
    if (result.count === 0) throw createHttpError(404, "Saved view not found");
    return prisma.savedView.findFirstOrThrow({
      where: { id, ownerUserId },
      select: viewSelect,
    });
  },

  remove: async (id: number, ownerUserId: number) => {
    const result = await prisma.savedView.deleteMany({
      where: { id, ownerUserId },
    });
    if (result.count === 0) throw createHttpError(404, "Saved view not found");
  },
};
