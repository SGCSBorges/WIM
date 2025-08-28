import { prisma } from "../../libs/prisma";
import bcrypt from "bcrypt";

export const ProfileService = {
  async get(userId: number) {
    return prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });
  },

  async updateEmail(userId: number, email: string, currentPassword: string) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      const err: any = new Error("Utilisateur introuvable");
      err.status = 404;
      throw err;
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      const err: any = new Error("Mot de passe invalide");
      err.status = 401;
      throw err;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.userId !== userId) {
      const err: any = new Error("Email déjà enregistré");
      err.status = 409;
      throw err;
    }

    return prisma.user.update({
      where: { userId },
      data: { email },
      select: { userId: true, email: true, role: true },
    });
  },

  async updatePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      const err: any = new Error("Utilisateur introuvable");
      err.status = 404;
      throw err;
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      const err: any = new Error("Mot de passe invalide");
      err.status = 401;
      throw err;
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    return prisma.user.update({
      where: { userId },
      data: { password: hashed },
      select: { userId: true, email: true, role: true },
    });
  },

  async deleteAccount(userId: number, currentPassword: string) {
    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) {
      const err: any = new Error("Utilisateur introuvable");
      err.status = 404;
      throw err;
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      const err: any = new Error("Mot de passe invalide");
      err.status = 401;
      throw err;
    }

    await prisma.article.deleteMany({ where: { ownerUserId: userId } });
    await prisma.garantie.deleteMany({ where: { ownerUserId: userId } });
    await prisma.attachment.deleteMany({ where: { ownerUserId: userId } });

    await prisma.user.delete({ where: { userId } });

    return { ok: true };
  },
};
