import { Router } from "express";
import { asyncHandler } from "../common/http";
import { authGuard } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import {
  LocationAssignArticleSchema,
  LocationCreateSchema,
  LocationUpdateSchema,
} from "./location.schemas";
import { LocationService } from "./location.service";

const router = Router();

router.get(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const locations = await LocationService.list(req.user.sub);
    res.json(locations);
  })
);

router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const location = await LocationService.get(id, req.user.sub);
    if (!location) return res.status(404).json({ error: "Location not found" });
    res.json(location);
  })
);

router.post(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const bodyData = LocationCreateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const created = await LocationService.create({
      ...bodyData,
      ownerUserId: req.user.sub,
    });
    await auditAction(req, {
      action: "CREATE",
      entity: "Location",
      entityId: created.locationId,
      metadata: { data: bodyData },
    });
    res.status(201).json(created);
  })
);

router.put(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const bodyData = LocationUpdateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const updated = await LocationService.update(id, req.user.sub, bodyData);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Location",
      entityId: id,
      metadata: { data: bodyData },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    await LocationService.remove(id, req.user.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Location",
      entityId: id,
    });
    res.status(204).end();
  })
);

// List articles in a location
router.get(
  "/:id/articles",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const articles = await LocationService.listArticles(id, req.user.sub);
    res.json(articles);
  })
);

// Add article to a location
router.post(
  "/:id/articles",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const body = LocationAssignArticleSchema.parse(req.body);
    const row = await LocationService.addArticle(
      id,
      req.user.sub,
      body.articleId
    );
    await auditAction(req, {
      action: "CREATE",
      entity: "ArticleLocation",
      entityId: undefined,
      metadata: { locationId: id, articleId: body.articleId },
    });
    res.status(201).json(row);
  })
);

// Remove article from a location
router.delete(
  "/:id/articles/:articleId",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const articleId = Number(req.params.articleId);
    await LocationService.removeArticle(id, req.user.sub, articleId);
    await auditAction(req, {
      action: "DELETE",
      entity: "ArticleLocation",
      entityId: undefined,
      metadata: { locationId: id, articleId },
    });
    res.status(204).end();
  })
);

export default router;
