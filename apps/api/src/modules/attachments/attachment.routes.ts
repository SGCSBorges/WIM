import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { asyncHandler } from "../common/http";
import { AttachmentService } from "./attachment.service";
import {
  AttachmentCreateSchema,
  AttachmentUpdateSchema,
} from "./attachment.schemas";
import { auditAction } from "../common/audit";
import { authGuard } from "../auth/auth.middleware";

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, UPLOAD_DIR),
    filename: (_req: any, file: any, cb: any) => {
      const safeBase = path
        .basename(file.originalname)
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const ext = path.extname(safeBase);
      const base = path.basename(safeBase, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

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

/** POST upload attachment file (multipart/form-data) */
router.post(
  "/upload",
  authGuard,
  upload.single("file"),
  asyncHandler(async (req: any, res) => {
    const file = req.file as any;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const type = String(req.body?.type || "OTHER").toUpperCase();
    if (!["INVOICE", "WARRANTY", "OTHER"].includes(type)) {
      return res.status(400).json({ error: "Invalid attachment type" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fileUrl = `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`;

    const created = await AttachmentService.create({
      type: type as any,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileUrl,
      ownerUserId: req.user.sub,
    });

    await auditAction(req, {
      action: "CREATE",
      entity: "Attachment",
      entityId: created.attachmentId,
      metadata: {
        upload: {
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: file.mimetype,
          fileSize: file.size,
          type,
        },
      },
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
