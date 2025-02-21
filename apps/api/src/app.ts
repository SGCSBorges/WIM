import express from "express";
import articleRoutes from "./modules/articles/article.routes";
import { errorMiddleware } from "./modules/common/http";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "WIM API" })
  );

  app.use("/api/articles", articleRoutes);

  app.use(errorMiddleware);
  return app;
}
