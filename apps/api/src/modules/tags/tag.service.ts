import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";

export const TagService = {
  // Owner's tags with how many articles carry each one.
  list: async (ownerUserId: number) => {
    const tags = await prisma.tag.findMany({
      where: { ownerUserId },
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: true } } },
    });
    return tags.map((t) => ({
      tagId: t.tagId,
      name: t.name,
      articleCount: t._count.articles,
    }));
  },

  create: (ownerUserId: number, name: string) =>
    // The unique (ownerUserId, name) constraint guards duplicates; a P2002 is
    // mapped to 409 by the global error handler.
    prisma.tag.create({
      data: { ownerUserId, name },
      select: { tagId: true, name: true },
    }),

  remove: async (tagId: number, ownerUserId: number) => {
    const existing = await prisma.tag.findFirst({
      where: { tagId, ownerUserId },
      select: { tagId: true },
    });
    if (!existing) throw createHttpError(404, "Tag not found");
    // ArticleTag rows cascade-delete via the FK.
    await prisma.tag.delete({ where: { tagId } });
  },
};
