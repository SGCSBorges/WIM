import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

const rawOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());
const allowedOrigins =
  rawOrigin && rawOrigin.length > 0
    ? rawOrigin
    : process.env.NODE_ENV !== "production"
      ? true // dev convenience: allow all origins when CORS_ORIGIN not set
      : []; // production: block all cross-origin requests if not configured

export const security = {
  helmet: helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // The API serves JSON and (for /uploads/*) image/PDF bytes — never HTML
    // pages. Lock down everything that would allow scripts or inline content
    // in case a response is ever rendered in a browser tab directly.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "img-src": ["'self'", "data:"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"],
      },
    },
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
    message: { error: "Too many requests, please try again later." },
  }),
  // Tighter limit for auth endpoints to slow brute-force attacks.
  authRateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many authentication attempts, please try again later.",
    },
  }),
};
