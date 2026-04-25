import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { AttachmentType } from "@prisma/client";
import { asyncHandler } from "../common/http";
import { AttachmentService } from "./attachment.service";
import {
  AttachmentCreateSchema,
  AttachmentUpdateSchema,
} from "./attachment.schemas";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest } from "../auth/auth.middleware";

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: AuthRequest, _file: any, cb: any) => cb(null, UPLOAD_DIR),
    filename: (_req: AuthRequest, file: any, cb: any) => {
      const safeBase = path
        .basename(file.originalname)
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const ext = path.extname(safeBase);
      const base = path.basename(safeBase, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ---- Routes ----

/** GET /api/attachments */
router.get(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const filters: { articleId?: number; garantieId?: number } = {};
    if (req.query.articleId) filters.articleId = Number(req.query.articleId);
    if (req.query.garantieId) filters.garantieId = Number(req.query.garantieId);
    const attachments = await AttachmentService.list(req.user!.sub, filters);
    res.json(attachments);
  })
);

/**
 * GET /api/attachments/warranty/:garantieId
 * Must be declared BEFORE /:id so Express doesn't treat "warranty" as an id.
 */
router.get(
  "/warranty/:garantieId",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const garantieId = Number(req.params.garantieId);
    const attachments = await AttachmentService.getForWarranty(garantieId, req.user!.sub);
    res.json(attachments);
  })
);

/** GET /api/attachments/:id */
router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const attachment = await AttachmentService.get(id, req.user!.sub);
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });
    res.json(attachment);
  })
);

/** POST /api/attachments — create metadata record (no file) */
router.post(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const bodyData = AttachmentCreateSchema.omit({ ownerUserId: true }).parse(req.body);
    const data = { ...bodyData, ownerUserId: req.user!.sub };
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

/** POST /api/attachments/upload — multipart file upload */
router.post(
  "/upload",
  authGuard,
  upload.single("file"),
  asyncHandler(async (req: AuthRequest, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const type = String(req.body?.type || "OTHER").toUpperCase();
    if (!["INVOICE", "WARRANTY", "OTHER"].includes(type)) {
      return res.status(400).json({ error: "Invalid attachment type" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fileUrl = `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`;

    const created = await AttachmentService.create({
      type: type as AttachmentType,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileUrl,
      ownerUserId: req.user!.sub,
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

/** PUT /api/attachments/:id */
router.put(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const bodyData = AttachmentUpdateSchema.omit({ ownerUserId: true }).parse(req.body);
    const result = await AttachmentService.update(id, req.user!.sub, bodyData);
    const count = result?.count ?? 0;
    if (!count) return res.status(404).json({ error: "Attachment not found" });
    const updated = await AttachmentService.get(id, req.user!.sub);
    await auditAction(req, {
      action: "UPDATE",
      entity: "Attachment",
      entityId: id,
      metadata: { data: bodyData },
    });
    res.json(updated);
  })
);

/** DELETE /api/attachments/:id — optionally removes the file from disk */
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const removeFile =
      String(req.query?.removeFile || "false").toLowerCase() === "true";

    if (removeFile) {
      const attachment = await AttachmentService.get(id, req.user!.sub);
      if (attachment?.fileUrl) {
        try {
          const url = new URL(attachment.fileUrl);
          const pathname = decodeURIComponent(url.pathname);
          if (pathname.startsWith("/uploads/")) {
            const storedName = pathname.replace("/uploads/", "");
            const fullPath = path.resolve(UPLOAD_DIR, storedName);
            // Guard against path traversal: ensure fullPath stays inside UPLOAD_DIR.
            if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) {
              throw new Error("Invalid file path");
            }
            await fs.promises.unlink(fullPath);
          }
        } catch {
          // ignore parse/unlink errors (file may already be gone)
        }
      }
    }

    await AttachmentService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Attachment",
      entityId: id,
      metadata: removeFile ? { removeFile: true } : undefined,
    });
    res.json({ message: "Attachment deleted successfully" });
  })
);

export default router;
