/**
 * Warranty service. Owner-scoped CRUD over the `Garantie` table plus the
 * claim workflow (NONE → OPEN → APPROVED/REJECTED → RESOLVED). A 1:1
 * unique constraint on `garantieArticleId` enforces "one warranty per
 * article"; the P2002 fast-path surfaces as a 409 instead of a generic
 * 500. Round-9 added the provider contact metadata
 * (providerName/Phone/Url) printed on the claim PDF.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { addMonths } from "../common/date";
import {
  ClaimUpdateInput,
  WarrantyCreateInput,
  WarrantyUpdateInput,
} from "./warranty.schemas";
import { AlertService } from "../alerts/alert.service";
import { createHttpError } from "../../utils/http-error";

export const WarrantyService = {
  list: (ownerUserId: number, page = 1, limit = 50) =>
    prisma.garantie.findMany({
      where: { ownerUserId },
      take: limit,
      skip: (page - 1) * limit,
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
        where: {
          articleId: data.garantieArticleId,
          ownerUserId: data.ownerUserId,
          deletedAt: null,
        },
      });
      if (!article)
        throw createHttpError(403, "Article not found or not owned by you");
    }

    // 1–1 : vérifier qu'il n'existe pas déjà une garantie pour l'article
    const existing = await prisma.garantie.findUnique({
      where: { garantieArticleId: data.garantieArticleId },
    });
    if (existing)
      throw createHttpError(409, "A warranty already exists for this article");

    // Créer la garantie une seule fois. The unique constraint on
    // garantieArticleId is the real guard — if two requests race past the
    // findUnique above, the loser hits P2002, which we surface as the same
    // 409 instead of a generic 500.
    let created;
    try {
      created = await prisma.garantie.create({
        data: {
          garantieArticleId: data.garantieArticleId,
          garantieNom: data.garantieNom,
          garantieDateAchat: data.garantieDateAchat,
          garantieDuration: data.garantieDuration,
          garantieFin: fin,
          garantieIsValide: true,
          ownerUserId: data.ownerUserId,
          ...(data.providerName !== undefined
            ? { providerName: data.providerName }
            : {}),
          ...(data.providerPhone !== undefined
            ? { providerPhone: data.providerPhone }
            : {}),
          ...(data.providerUrl !== undefined
            ? { providerUrl: data.providerUrl }
            : {}),
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw createHttpError(
          409,
          "A warranty already exists for this article"
        );
      throw e;
    }

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
    if (!current) throw createHttpError(404, "Warranty not found");

    if (
      data.garantieArticleId != null &&
      data.garantieArticleId !== current.garantieArticleId
    ) {
      const article = await prisma.article.findFirst({
        where: {
          articleId: data.garantieArticleId,
          ownerUserId,
          deletedAt: null,
        },
      });
      if (!article)
        throw createHttpError(403, "Article not found or not owned by you");

      const conflict = await prisma.garantie.findUnique({
        where: { garantieArticleId: data.garantieArticleId },
      });
      if (conflict)
        throw createHttpError(
          409,
          "A warranty already exists for this article"
        );
    }

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

  // Update the claim workflow on a warranty (owner-scoped). Stamps
  // claimUpdatedAt whenever the status moves off NONE; clearing back to NONE
  // resets the note + timestamp.
  updateClaim: async (
    id: number,
    ownerUserId: number,
    data: ClaimUpdateInput
  ) => {
    const current = await prisma.garantie.findFirst({
      where: { garantieId: id, ownerUserId },
      select: { garantieId: true },
    });
    if (!current) throw createHttpError(404, "Warranty not found");

    const isNone = data.status === "NONE";
    return prisma.garantie.update({
      where: { garantieId: id },
      data: {
        claimStatus: data.status,
        claimNote: isNone ? null : (data.note ?? null),
        claimUpdatedAt: isNone ? null : new Date(),
      },
    });
  },

  remove: async (id: number, ownerUserId: number) => {
    const current = await prisma.garantie.findFirst({
      where: { garantieId: id, ownerUserId },
    });
    if (!current) throw createHttpError(404, "Warranty not found");
    await AlertService.cancelForWarranty({
      ownerUserId: current.ownerUserId,
      garantieId: current.garantieId,
    });
    return prisma.garantie.delete({ where: { garantieId: id } });
  },
};
