/**
 * The shared Prisma client. Single instance; every service/route imports
 * this. The graceful-shutdown helper calls `prisma.$disconnect()` on
 * SIGTERM so in-flight queries land before the process exits.
 */
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
