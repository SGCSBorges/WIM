/**
 * OpenAPI 3.1 document + Swagger UI. /api/openapi.json serves the doc,
 * /api/docs serves the interactive UI. The doc itself is hand-maintained
 * in openapi/document.ts and should be updated when routes / shapes change.
 */
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./document";

const router = Router();

// Build once at module load. The document is pure-JS construction off the
// already-imported Zod schemas, so cost is paid once per process.
const document = buildOpenApiDocument();

router.get("/openapi.json", (_req, res) => {
  res.type("application/json").send(document);
});

router.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(document, { explorer: true })
);

export default router;
