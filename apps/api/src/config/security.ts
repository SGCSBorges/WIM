import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

const rawOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());
const allowedOrigins =
  rawOrigin && rawOrigin.length > 0
    ? rawOrigin
    : process.env.NODE_ENV !== "production"
      ? true // dev convenience: allow all origins when CORS_ORIGIN not set
      : [];  // production: block all cross-origin requests if not configured

export const security = {
  helmet: helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
  cors: cors({
    origin: allowedOrigins,
    credentials: true,
  }),
  rateLimiter: rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de requêtes, réessayez plus tard." },
  }),
  // Tighter limit for auth endpoints to slow brute-force attacks.
  authRateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts, please try again later." },
  }),
};
