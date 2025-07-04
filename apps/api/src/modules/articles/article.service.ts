import { prisma } from "../../libs/prisma";
import { ArticleCreateInput, ArticleUpdateInput } from "./article.schemas";

export const ArticleService = {
  list: () =>
    prisma.article.findMany({
      orderBy: { articleId: "desc" },
      include: { owner: { select: { userId: true, email: true } } },
    }),
  get: (id: number) =>
    prisma.article.findUnique({
      where: { articleId: id },
      include: { owner: { select: { userId: true, email: true } } },
    }),
  create: (data: ArticleCreateInput & { ownerUserId: number }) =>
    prisma.article.create({
      data,
      include: { owner: { select: { userId: true, email: true } } },
    }),
  update: (id: number, data: ArticleUpdateInput) =>
    prisma.article.update({
      where: { articleId: id },
      data,
      include: { owner: { select: { userId: true, email: true } } },
    }),
  remove: (id: number) => prisma.article.delete({ where: { articleId: id } }),
};
