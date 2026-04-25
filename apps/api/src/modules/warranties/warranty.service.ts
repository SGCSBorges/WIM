import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { addMonths } from "../common/date";
import { WarrantyCreateInput, WarrantyUpdateInput } from "./warranty.schemas";
import { AlertService } from "../alerts/alert.service";
import { createHttpError } from "../../utils/http-error";

export const WarrantyService = {
  list: (ownerUserId: number) =>
    prisma.garantie.findMany({
      where: { ownerUserId },
      orderBy: { garantieId: "desc" },
    }),
  get: (id: number, ownerUserId: number) =>
    prisma.garantie.findFirst({ where: { garantieId: id, ownerUserId } }),

  create: async (data: WarrantyCreateInput) => {
    // ownerUserId is injected by route middleware (auth)
    const fin = addMonths(
      new Date(data.garantieDateAchat),
      data.garantieDuration
    );

    // Ensure the article belongs to the requesting user before attaching a warranty.
    if (data.garantieArticleId != null) {
      const article = await prisma.article.findFirst({
        where: { articleId: data.garantieArticleId, ownerUserId: data.ownerUserId },
      });
      if (!article) throw createHttpError(403, "Article not found or not owned by you");
    }

    // 1–1 : vérifier qu'il n'existe pas déjà une garantie pour l'article
    const existing = await prisma.garantie.findUnique({
      where: { garantieArticleId: data.garantieArticleId },
    });
    if (existing)
      throw createHttpError(409, "Une garantie existe déjà pour cet article");

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

  update: async (
    id: number,
    ownerUserId: number,
    data: WarrantyUpdateInput
  ) => {
    const current = await prisma.garantie.findFirst({
      where: { garantieId: id, ownerUserId },
    });
    if (!current) throw createHttpError(404, "Garantie non trouvée");

    const patch: Prisma.GarantieUpdateInput = { ...data };
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

  remove: async (id: number, ownerUserId: number) => {
    const current = await prisma.garantie.findFirst({
      where: { garantieId: id, ownerUserId },
    });
    if (!current) throw createHttpError(404, "Garantie non trouvée");
    await AlertService.cancelForWarranty({
      ownerUserId: current.ownerUserId,
      garantieId: current.garantieId,
    });
    return prisma.garantie.delete({ where: { garantieId: id } });
  },
};
