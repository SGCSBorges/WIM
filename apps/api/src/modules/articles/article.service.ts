import { prisma } from "../../libs/prisma";
import { ArticleCreateInput, ArticleUpdateInput } from "./article.schemas";

export const ArticleService = {
  list: () => prisma.article.findMany({ orderBy: { articleId: "desc" } }),
  get: (id: number) => prisma.article.findUnique({ where: { articleId: id } }),
  create: (data: ArticleCreateInput) => prisma.article.create({ data }),
  update: (id: number, data: ArticleUpdateInput) =>
    prisma.article.update({ where: { articleId: id }, data }),
  remove: (id: number) => prisma.article.delete({ where: { articleId: id } }),
};
