import express from "express";
import { PrismaClient } from "@prisma/client";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });
const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3000;

app.get("/health", async (_req, res) => {
  try {
    // simple ping DB
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "WIM API", db: "up" });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ status: "error", service: "WIM API", db: "down" });
  }
});

app.listen(port, () => {
  logger.info(`[WIM API] running on http://localhost:${port}`);
});
