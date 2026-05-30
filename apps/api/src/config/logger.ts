/**
 * Pino logger singleton. JSON output in production (Render captures + ships
 * to log drains); pretty output via `pino-pretty` in development.
 */
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
});
