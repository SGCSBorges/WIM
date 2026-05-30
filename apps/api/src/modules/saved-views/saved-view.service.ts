/**
 * Saved-view service. Per-user named filter views for the Articles list —
 * the `query` field holds a URL search-string the UI re-applies via
 * setSearchParams. Owner-scoped CRUD; nothing fancier.
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";

export const SavedViewService = {
  list: (ownerUserId: number) =>
    prisma.savedView.findMany({
      where: { ownerUserId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, query: true },
    }),

  // Unique (ownerUserId, name) → a duplicate surfaces as 409 via the global
  // Prisma error handler.
  create: (ownerUserId: number, name: string, query: string) =>
    prisma.savedView.create({
      data: { ownerUserId, name, query },
      select: { id: true, name: true, query: true },
    }),

  remove: async (id: number, ownerUserId: number) => {
    const result = await prisma.savedView.deleteMany({
      where: { id, ownerUserId },
    });
    if (result.count === 0) throw createHttpError(404, "Saved view not found");
  },
};
