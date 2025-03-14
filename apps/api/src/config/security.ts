import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

const origin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());

export const security = {
  helmet: helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
  cors: cors({
    origin: origin && origin.length > 0 ? origin : true, // true = tout (à restreindre en prod)
    credentials: true,
  }),
  rateLimiter: rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de requêtes, réessayez plus tard." },
  }),
};
