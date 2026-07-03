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
  // Owner's tags with how many LIVE articles carry each one — an
  // unfiltered count would keep counting trashed articles the filtered
  // article list no longer shows.
  list: async (ownerUserId: number) => {
    const tags = await prisma.tag.findMany({
      where: { ownerUserId },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { articles: { where: { article: { deletedAt: null } } } },
        },
      },
    });
    return tags.map((t) => ({
      tagId: t.tagId,
      name: t.name,
      color: t.color,
      articleCount: t._count.articles,
    }));
  },

  create: (ownerUserId: number, name: string, color?: string | null) =>
    // The unique (ownerUserId, name) constraint guards duplicates; a P2002 is
    // mapped to 409 by the global error handler.
    prisma.tag.create({
      data: { ownerUserId, name, ...(color !== undefined ? { color } : {}) },
      select: { tagId: true, name: true, color: true },
    }),

  // Patch a tag's name and/or color. Both are optional — an absent key leaves
  // that field unchanged; `color: null` clears the color to the default tone.
  update: async (
    tagId: number,
    ownerUserId: number,
    patch: { name?: string; color?: string | null }
  ) => {
    const existing = await prisma.tag.findFirst({
      where: { tagId, ownerUserId },
      select: { tagId: true },
    });
    if (!existing) throw createHttpError(404, "Tag not found");
    // The (ownerUserId, name) unique constraint guards collisions; a P2002 is
    // mapped to 409 ("Tag already exists") by the global error handler.
    return prisma.tag.update({
      where: { tagId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
      },
      select: { tagId: true, name: true, color: true },
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
      // One set-based statement (not read-then-IN-delete): a concurrent tag
      // assign between a read and the delete would make the repoint hit the
      // PK and surface as a misleading 409, and a large tag would blow the
      // 65k bind-parameter cap.
      await tx.articleTag.deleteMany({
        where: {
          tagId: fromId,
          article: { tags: { some: { tagId: intoId } } },
        },
      });
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
