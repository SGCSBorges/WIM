/**
 * Tag service. Standard owner-scoped CRUD plus `merge(fromId, intoId)` —
 * the non-obvious one: a single transaction rewires every ArticleTag row
 * from `from` to `into`, deduplicating any articles that already carried
 * `into`, then deletes the source. Rename collisions surface as a 409
 * via the P2002 mapping in the global error handler.
 */
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

  rename: async (tagId: number, ownerUserId: number, name: string) => {
    const existing = await prisma.tag.findFirst({
      where: { tagId, ownerUserId },
      select: { tagId: true },
    });
    if (!existing) throw createHttpError(404, "Tag not found");
    // The (ownerUserId, name) unique constraint guards collisions; a P2002 is
    // mapped to 409 ("Tag already exists") by the global error handler.
    return prisma.tag.update({
      where: { tagId },
      data: { name },
      select: { tagId: true, name: true },
    });
  },

  // Fold `fromId` into `intoId`: every article tagged with `from` ends up
  // tagged with `into`, then `from` is deleted. Both must belong to the caller.
  merge: async (fromId: number, intoId: number, ownerUserId: number) => {
    if (fromId === intoId)
      throw createHttpError(400, "Cannot merge a tag into itself");

    return prisma.$transaction(async (tx) => {
      const owned = await tx.tag.findMany({
        where: { tagId: { in: [fromId, intoId] }, ownerUserId },
        select: { tagId: true },
      });
      if (owned.length !== 2)
        throw createHttpError(404, "One or both tags were not found");

      // Articles already carrying `into` would collide on the (articleId,
      // tagId) PK when we repoint `from` — drop those duplicate links first.
      const intoLinks = await tx.articleTag.findMany({
        where: { tagId: intoId },
        select: { articleId: true },
      });
      const intoArticleIds = intoLinks.map((l) => l.articleId);
      if (intoArticleIds.length > 0) {
        await tx.articleTag.deleteMany({
          where: { tagId: fromId, articleId: { in: intoArticleIds } },
        });
      }
      const moved = await tx.articleTag.updateMany({
        where: { tagId: fromId },
        data: { tagId: intoId },
      });
      await tx.tag.delete({ where: { tagId: fromId } });
      return { articlesAffected: moved.count };
    });
  },

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
