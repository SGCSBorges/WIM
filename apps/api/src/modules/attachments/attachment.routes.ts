import { Router } from "express";
import { asyncHandler } from "../common/http";
import { AttachmentService } from "./attachment.service";
import {
  AttachmentCreateSchema,
  AttachmentUpdateSchema,
} from "./attachment.schemas";
import { auditAction } from "../common/audit";
import { authGuard } from "../auth/auth.middleware";

const router = Router();

/** GET all user attachments */
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const attachments = await AttachmentService.list(req.user.sub);
    res.json(attachments);
  })
);

/** GET attachment by ID */
router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const attachment = await AttachmentService.get(id, req.user.sub);
    if (!attachment)
      return res.status(404).json({ error: "Attachment not found" });
    res.json(attachment);
  })
);

/** POST create attachment */
router.post(
  "/",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const bodyData = AttachmentCreateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const data = { ...bodyData, ownerUserId: req.user.sub };
    const created = await AttachmentService.create(data);
    await auditAction(req, {
      action: "CREATE",
      entity: "Attachment",
      entityId: created.attachmentId,
      metadata: { data },
    });
    res.status(201).json(created);
  })
);

/** PUT update attachment */
router.put(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    const bodyData = AttachmentUpdateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const updated = await AttachmentService.update(id, req.user.sub, bodyData);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Attachment",
      entityId: id,
      metadata: { data: bodyData },
    });
    res.json(updated);
  })
);

/** DELETE attachment */
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const id = Number(req.params.id);
    await AttachmentService.remove(id, req.user.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Attachment",
      entityId: id,
    });
    res.json({ message: "Attachment deleted successfully" });
  })
);

/** GET attachments for article */
router.get(
  "/article/:articleId",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const articleId = Number(req.params.articleId);
    const attachments = await AttachmentService.getForArticle(
      articleId,
      req.user.sub
    );
    res.json(attachments);
  })
);

/** GET attachments for warranty */
router.get(
  "/warranty/:garantieId",
  authGuard,
  asyncHandler(async (req: any, res) => {
    const garantieId = Number(req.params.garantieId);
    const attachments = await AttachmentService.getForWarranty(
      garantieId,
      req.user.sub
    );
    res.json(attachments);
  })
);

export default router;
