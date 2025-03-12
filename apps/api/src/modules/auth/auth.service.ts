import { prisma } from "../../libs/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { RegisterInput, LoginInput } from "./auth.schemas";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES = "7d";

export const AuthService = {
  async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      const err: any = new Error("Email déjà enregistré");
      err.status = 409;
      throw err;
    }
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { email: data.email, password: hashed, role: data.role },
    });
    const token = jwt.sign({ sub: user.userId, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES,
    });
    return {
      user: { userId: user.userId, email: user.email, role: user.role },
      token,
    };
  },

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      const err: any = new Error("Utilisateur introuvable");
      err.status = 404;
      throw err;
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      const err: any = new Error("Mot de passe invalide");
      err.status = 401;
      throw err;
    }
    const token = jwt.sign({ sub: user.userId, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES,
    });
    return {
      user: { userId: user.userId, email: user.email, role: user.role },
      token,
    };
  },

  async profile(userId: number) {
    return prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });
  },
};
