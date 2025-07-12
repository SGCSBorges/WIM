import { prisma } from "../../libs/prisma";
import { addMonths } from "../common/date";
import {
  WarrantyCreateInput,
  WarrantyUpdateInput,
} from "../warranties/warranty.schemas";
import { AlertService } from "../alerts/alert.service";

export const WarrantyService = {
  // […]
  create: async (data: WarrantyCreateInput) => {
    const fin = addMonths(
      new Date(data.garantieDateAchat),
      data.garantieDuration
    );

    const existing = await prisma.garantie.findUnique({
      where: { garantieArticleId: data.garantieArticleId },
    });
    if (existing) {
      const err: any = new Error("Une garantie existe déjà pour cet article");
      err.status = 409;
      throw err;
    }

    const created = await prisma.garantie.create({
      data: { ...data, garantieFin: fin, garantieIsValide: true },
    });

    await AlertService.scheduleForWarranty(
      created.garantieId,
      new Date(data.garantieDateAchat),
      data.garantieDuration
    );

    return created;
  },
  // […]
};
