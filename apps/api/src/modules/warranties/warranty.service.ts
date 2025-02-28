import { prisma } from "../../libs/prisma";
import { addMonths } from "../common/date";
import { WarrantyCreateInput, WarrantyUpdateInput } from "./warranty.schemas";

export const WarrantyService = {
  list: () => prisma.garantie.findMany({ orderBy: { garantieId: "desc" } }),
  get: (id: number) =>
    prisma.garantie.findUnique({ where: { garantieId: id } }),

  create: async (data: WarrantyCreateInput) => {
    const fin = addMonths(
      new Date(data.garantieDateAchat),
      data.garantieDuration
    );
    // 1–1: vérifier qu'il n'y a pas déjà une garantie pour l'article
    const existing = await prisma.garantie.findUnique({
      where: { garantieArticleId: data.garantieArticleId },
    });
    if (existing) {
      const err: any = new Error("Une garantie existe déjà pour cet article");
      err.status = 409;
      throw err;
    }
    return prisma.garantie.create({
      data: { ...data, garantieFin: fin, garantieIsValide: true },
    });
  },

  update: (id: number, data: WarrantyUpdateInput) => {
    let patch: any = { ...data };
    if (data.garantieDateAchat && data.garantieDuration) {
      patch.garantieFin = addMonths(
        new Date(data.garantieDateAchat),
        data.garantieDuration
      );
    }
    return prisma.garantie.update({ where: { garantieId: id }, data: patch });
  },

  remove: (id: number) => prisma.garantie.delete({ where: { garantieId: id } }),
};
