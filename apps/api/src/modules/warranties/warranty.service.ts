import { prisma } from "../../libs/prisma";
import { addMonths } from "../common/date";
import { WarrantyCreateInput, WarrantyUpdateInput } from "./warranty.schemas";
import { AlertService } from "../alerts/alert.service";

export const WarrantyService = {
  list: () => prisma.garantie.findMany({ orderBy: { garantieId: "desc" } }),
  get: (id: number) =>
    prisma.garantie.findUnique({ where: { garantieId: id } }),

  create: async (data: WarrantyCreateInput) => {
    // ownerUserId is injected by route middleware (auth)
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
      data: {
        garantieArticleId: data.garantieArticleId,
        garantieNom: data.garantieNom,
        garantieDateAchat: data.garantieDateAchat,
        garantieDuration: data.garantieDuration,
        garantieFin: fin,
        garantieIsValide: true,
        ownerUserId: data.ownerUserId,
      },
    });

    // Planifier 3 rappels (J-30 / J-7 / J-1)
    await AlertService.scheduleForWarranty({
      ownerUserId: created.ownerUserId,
      garantieId: created.garantieId,
      articleId: created.garantieArticleId,
      garantieFin: created.garantieFin,
    });

    return created;
  },

  update: async (id: number, data: WarrantyUpdateInput) => {
    const current = await prisma.garantie.findUnique({
      where: { garantieId: id },
    });
    if (!current) {
      const err: any = new Error("Garantie non trouvée");
      err.status = 404;
      throw err;
    }

    const patch: any = { ...data };
    // Recalculate fin if either dateAchat or duration changes (use current for missing)
    if (data.garantieDateAchat || data.garantieDuration) {
      const dateAchat = data.garantieDateAchat
        ? new Date(data.garantieDateAchat)
        : new Date(current.garantieDateAchat);
      const duration =
        data.garantieDuration != null
          ? data.garantieDuration
          : current.garantieDuration;
      patch.garantieFin = addMonths(dateAchat, duration);
    }

    const updated = await prisma.garantie.update({
      where: { garantieId: id },
      data: patch,
    });

    // Reschedule reminders if fin changed (or if update could affect fin)
    if (patch.garantieFin) {
      await AlertService.rescheduleForWarranty({
        ownerUserId: updated.ownerUserId,
        garantieId: updated.garantieId,
        articleId: updated.garantieArticleId,
        garantieFin: updated.garantieFin,
      });
    }

    return updated;
  },

  remove: async (id: number) => {
    const current = await prisma.garantie.findUnique({
      where: { garantieId: id },
    });
    if (current) {
      await AlertService.cancelForWarranty({
        ownerUserId: current.ownerUserId,
        garantieId: current.garantieId,
      });
    }
    return prisma.garantie.delete({ where: { garantieId: id } });
  },
};
