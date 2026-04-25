import { prisma } from "../../libs/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { RegisterInput, LoginInput } from "./auth.schemas";
import { createHttpError } from "../../utils/http-error";

// JWT_SECRET is guaranteed present by validateEnv() called at startup.
const JWT_EXPIRES = "7d";

export const AuthService = {
  async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw createHttpError(409, "Email déjà enregistré");
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { email: data.email, password: hashed, role: data.role },
    });
    const token = jwt.sign(
      { sub: user.userId, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: JWT_EXPIRES }
    );
    return {
      user: { userId: user.userId, email: user.email, role: user.role },
      token,
    };
  },

  async login(data: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    // Always run bcrypt to prevent timing-based user enumeration.
    const DUMMY = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const valid = await bcrypt.compare(data.password, user?.password ?? DUMMY);
    if (!user || !valid) throw createHttpError(401, "Invalid credentials");
    const token = jwt.sign(
      { sub: user.userId, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: JWT_EXPIRES }
    );
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
