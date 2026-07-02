/**
 * Wishlist / planned purchases — owner-scoped CRUD over WishlistItem.
 * Marking an item purchased stamps purchasedAt (kept, struck through in the
 * UI) rather than deleting, so the history survives; the toggle is an atomic
 * updateMany with the ownership precondition in the WHERE per the codebase
 * convention.
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import type {
  WishlistCreateInput,
  WishlistUpdateInput,
} from "./wishlist.schemas";

export const WishlistService = {
  list(ownerUserId: number) {
    return prisma.wishlistItem.findMany({
      where: { ownerUserId },
      // Open wishes first (newest on top), purchased history after.
      orderBy: [
        { purchasedAt: { sort: "asc", nulls: "first" } },
        { createdAt: "desc" },
      ],
    });
  },

  create(ownerUserId: number, data: WishlistCreateInput) {
    return prisma.wishlistItem.create({
      data: {
        ownerUserId,
        name: data.name,
        url: data.url ?? null,
        targetPrice: data.targetPrice ?? null,
        note: data.note ?? null,
      },
    });
  },

  async update(id: number, ownerUserId: number, data: WishlistUpdateInput) {
    const { count } = await prisma.wishlistItem.updateMany({
      where: { id, ownerUserId },
      data,
    });
    if (count === 0) throw createHttpError(404, "Wishlist item not found");
    return prisma.wishlistItem.findUniqueOrThrow({ where: { id } });
  },

  async setPurchased(id: number, ownerUserId: number, purchased: boolean) {
    const { count } = await prisma.wishlistItem.updateMany({
      where: { id, ownerUserId },
      data: { purchasedAt: purchased ? new Date() : null },
    });
    if (count === 0) throw createHttpError(404, "Wishlist item not found");
    return prisma.wishlistItem.findUniqueOrThrow({ where: { id } });
  },

  async remove(id: number, ownerUserId: number) {
    const { count } = await prisma.wishlistItem.deleteMany({
      where: { id, ownerUserId },
    });
    if (count === 0) throw createHttpError(404, "Wishlist item not found");
  },
};
