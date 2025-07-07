import { prisma } from "../../libs/prisma";
import { addMonths } from "../common/date";
import { WarrantyCreateInput, WarrantyUpdateInput } from "./warranty.schemas";
import { AlertService } from "../alerts/alert.service";
import { jobsEnabled } from "../../config/jobs";

export const WarrantyService = {
  list: () => prisma.garantie.findMany({ orderBy: { garantieId: "desc" } }),
  get: (id: number) =>
    prisma.garantie.findUnique({ where: { garantieId: id } }),

  create: async (data: WarrantyCreateInput & { ownerUserId: number }) => {
    const fin = addMonths(
      new Date(data.garantieDateAchat),
      data.garantieDuration
    );

    // 1–1 : vérifier qu'il n'existe pas déjà une garantie pour l'article
    const existing = await prisma.garantie.findUnique({
      where: { garantieArticleId: data.garantieArticleId },
    });
    if (existing) {
      const err: any = new Error("Une garantie existe déjà pour cet article");
      err.status = 409;
      throw err;
    }

    // Créer la garantie une seule fois
    const created = await prisma.garantie.create({
      data: { ...data, garantieFin: fin, garantieIsValide: true },
    });

    // Planifier 3 rappels (J-30 / J-7 / J-1) - only if jobs are enabled
    if (jobsEnabled) {
      await AlertService.scheduleForWarranty(
        created.garantieId,
        new Date(data.garantieDateAchat),
        data.garantieDuration
      );
    }

    return created;
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
