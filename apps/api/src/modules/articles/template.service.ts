/**
 * Article-template CRUD. Templates are an owner-scoped JSON snapshot of
 * identity fields + optional default location/tag names — the form picker
 * decodes them into a fresh `ArticleCreateInput` at use time. We keep the
 * payload schemaless on the DB side so adding fields later (custom fields,
 * default warranty, …) doesn't require a migration.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";

export interface ArticleTemplatePayload {
  articleNom?: string;
  articleModele?: string;
  articleDescription?: string | null;
  brand?: string | null;
  serialNumber?: string | null;
  productImageUrl?: string | null;
  purchasePrice?: number | null;
  depreciationRate?: number | null;
  /** Default locations resolved by name at use time. */
  locationNames?: string[];
  /** Default tags resolved by name at use time. */
  tagNames?: string[];
}

export const ArticleTemplateService = {
  list: (ownerUserId: number) =>
    prisma.articleTemplate.findMany({
      where: { ownerUserId },
      orderBy: { updatedAt: "desc" },
    }),

  get: async (id: number, ownerUserId: number) => {
    const row = await prisma.articleTemplate.findFirst({
      where: { id, ownerUserId },
    });
    if (!row) throw createHttpError(404, "Template not found");
    return row;
  },

  create: (
    ownerUserId: number,
    name: string,
    payload: ArticleTemplatePayload
  ) =>
    prisma.articleTemplate.create({
      data: { ownerUserId, name, payload: payload as Prisma.InputJsonValue },
    }),

  update: async (
    id: number,
    ownerUserId: number,
    data: { name?: string; payload?: ArticleTemplatePayload }
  ) => {
    const exists = await prisma.articleTemplate.findFirst({
      where: { id, ownerUserId },
      select: { id: true },
    });
    if (!exists) throw createHttpError(404, "Template not found");
    return prisma.articleTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.payload !== undefined
          ? { payload: data.payload as Prisma.InputJsonValue }
          : {}),
      },
    });
  },

  remove: async (id: number, ownerUserId: number) => {
    const result = await prisma.articleTemplate.deleteMany({
      where: { id, ownerUserId },
    });
    if (result.count === 0) throw createHttpError(404, "Template not found");
  },
};
