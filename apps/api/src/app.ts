import express from "express";
import articleRoutes from "./modules/articles/article.routes";
import warrantyRoutes from "./modules/warranties/warranty.routes";
import { errorMiddleware } from "./modules/common/http";
import authRoutes from "./modules/auth/auth.routes";
import auditRoutes from "./modules/audit/audit.routes";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "WIM API" })
  );

  app.use("/api/articles", articleRoutes);
  app.use("/api/warranties", warrantyRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/audit", auditRoutes);

  app.use(errorMiddleware);
  return app;
}
