/**
 * Attachment routes — owner-scoped file CRUD. Uploads via Multer to local
 * disk (10 MB cap), `verifyFileSignature` reads magic bytes to catch
 * MIME-type spoofing, and image uploads get a thumbnail via sharp.
 * Bulk-delete (round 10) silently skips foreign ids and best-effort
 * unlinks files via `unlinkAttachmentFiles`.
 */
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { createHttpError } from "../../utils/http-error";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { AttachmentType } from "@prisma/client";
import { asyncHandler } from "../common/http";
import { AttachmentService } from "./attachment.service";
import {
  AttachmentCreateSchema,
  AttachmentUpdateSchema,
} from "./attachment.schemas";
import { auditAction } from "../common/audit";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { idParam, paginationQuery } from "../common/schemas";
import { logger } from "../../config/logger";
import { verifyFileSignature } from "../../utils/file-signature";
import { makeImageThumbnail, thumbnailName } from "./attachment.thumbnail";
import { unlinkAttachmentFiles } from "./attachment.fs";
import {
  storageEnabled,
  putObjectFromFile,
  deleteObject,
} from "../../libs/object-storage";
import { security } from "../../config/security";
const AttachmentTypeSchema = z.enum(["INVOICE", "WARRANTY", "OTHER"]);

// Cap mirrors article.bulk-delete — a single "select all" UI today is
// scoped to the current page (50 attachments), 500 is generous safety.
const BulkIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

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
    destination: (
      _req: AuthRequest,
      _file: Express.Multer.File,
      cb: (err: Error | null, dest: string) => void
    ) => cb(null, UPLOAD_DIR),
    filename: (
      _req: AuthRequest,
      file: Express.Multer.File,
      cb: (err: Error | null, name: string) => void
    ) => {
      const ext = path.extname(
        path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_")
      );
      cb(null, `${crypto.randomBytes(12).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      // Carry a 415 so the global error middleware returns a clean status +
      // helpful message; a plain Error would fall through to a 500 and log as
      // [UnhandledError].
      cb(createHttpError(415, `Unsupported file type: ${file.mimetype}`));
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
    if (req.query.articleId)
      filters.articleId = idParam.parse(req.query.articleId);
    if (req.query.garantieId)
      filters.garantieId = idParam.parse(req.query.garantieId);
    const { page, limit } = paginationQuery.parse(req.query);
    const attachments = await AttachmentService.list(
      req.user!.sub,
      filters,
      page,
      limit
    );
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
    const garantieId = idParam.parse(req.params.garantieId);
    const attachments = await AttachmentService.getForWarranty(
      garantieId,
      req.user!.sub
    );
    res.json(attachments);
  })
);

/** GET /api/attachments/:id */
router.get(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const attachment = await AttachmentService.get(id, req.user!.sub);
    if (!attachment)
      return res.status(404).json({ error: "Attachment not found" });
    res.json(attachment);
  })
);

/** POST /api/attachments — create metadata record (no file) */
router.post(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const bodyData = AttachmentCreateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
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
    if (!file) throw createHttpError(400, "Missing file");

    // Defense-in-depth: the Multer fileFilter trusts the request's
    // Content-Type header. Re-verify by reading the first bytes off disk and
    // matching the declared mime's known signature. Mismatch → unlink + 415.
    const ok = await verifyFileSignature(file.path, file.mimetype);
    if (!ok) {
      try {
        await fs.promises.unlink(file.path);
      } catch (fsErr) {
        logger.warn(
          { err: fsErr, filePath: file.path },
          "[attachment] failed to unlink rejected upload"
        );
      }
      throw createHttpError(
        415,
        `File contents do not match declared type: ${file.mimetype}`
      );
    }

    const { type, articleId } = z
      .object({
        type: AttachmentTypeSchema.optional(),
        // Optional link to an article (e.g. the photo gallery). Ownership is
        // enforced in AttachmentService.create.
        articleId: z.coerce.number().int().positive().optional(),
      })
      .parse(req.body);
    const attachmentType: AttachmentType = type ?? "OTHER";

    const baseUrl =
      process.env.APP_URL?.replace(/\/$/, "") ??
      `${req.protocol}://${req.get("host")}`;
    const fileUrl = `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`;

    // Generate a downscaled preview for images (best-effort; null for PDFs or
    // on resize failure, in which case callers fall back to the original).
    const thumbUrl = await makeImageThumbnail({
      sourcePath: file.path,
      uploadDir: UPLOAD_DIR,
      storedName: file.filename,
      mimeType: file.mimetype,
      baseUrl,
    });

    // Object storage configured → local files are only a staging area
    // (multer + the signature check + sharp need a real path). Push the
    // original + thumbnail to the bucket, then drop the staging copies; the
    // URL shape and the ACL'd /uploads/:name serving route stay identical.
    const localThumbPath = thumbUrl
      ? path.join(UPLOAD_DIR, thumbnailName(file.filename))
      : null;
    if (storageEnabled()) {
      try {
        await putObjectFromFile(file.filename, file.path, file.mimetype);
        if (localThumbPath)
          await putObjectFromFile(
            thumbnailName(file.filename),
            localThumbPath,
            "image/webp"
          );
      } catch (err) {
        // A failed store IS a failed upload: without the bucket copy the DB
        // row would point at bytes that vanish on the next deploy.
        logger.error({ err }, "[attachment] object-storage upload failed");
        for (const p of [file.path, localThumbPath]) {
          if (p) await fs.promises.unlink(p).catch(() => {});
        }
        throw createHttpError(502, "File storage is unavailable, try again");
      }
      for (const p of [file.path, localThumbPath]) {
        if (p) await fs.promises.unlink(p).catch(() => {});
      }
    }

    let created;
    try {
      created = await AttachmentService.create({
        type: attachmentType,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileUrl,
        thumbUrl,
        ...(articleId !== undefined ? { articleId } : {}),
        ownerUserId: req.user!.sub,
      });
    } catch (err) {
      if (storageEnabled()) {
        await deleteObject(file.filename);
        if (thumbUrl) await deleteObject(thumbnailName(file.filename));
      } else {
        const orphans = [file.path];
        if (localThumbPath) orphans.push(localThumbPath);
        for (const p of orphans) {
          try {
            await fs.promises.unlink(p);
          } catch (fsErr) {
            logger.warn(
              { err: fsErr, filePath: p },
              "[attachment] failed to unlink orphaned file after DB error"
            );
          }
        }
      }
      throw err;
    }

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
          type: attachmentType,
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
    const id = idParam.parse(req.params.id);
    const bodyData = AttachmentUpdateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
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

/**
 * Bulk delete attachments owned by the caller. Returns { count } of rows
 * actually removed (ids the user doesn't own are silently skipped — same
 * model as article.bulk-delete). On-disk files are best-effort unlinked.
 */
router.post(
  "/bulk-delete",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { ids } = BulkIdsSchema.parse(req.body);
    const { count } = await AttachmentService.bulkRemove(ids, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Attachment",
      metadata: { bulk: true, requested: ids.length, deleted: count },
    });
    res.json({ count });
  })
);

/** DELETE /api/attachments/:id — optionally removes the file from disk
 *  via the `?removeFile=true` query (default false). Always cascade-deletes
 *  the DB row; the file flag is opt-in for callers that want to keep the
 *  blob around (e.g. when re-pointing the attachment at a different row). */
router.delete(
  "/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = idParam.parse(req.params.id);
    const removeFile =
      String(req.query?.removeFile || "false").toLowerCase() === "true";

    // Always fetch first — establishes ownership and gives us the fileUrl.
    const attachment = await AttachmentService.get(id, req.user!.sub);
    if (!attachment)
      return res.status(404).json({ error: "Attachment not found" });

    if (removeFile) {
      await unlinkAttachmentFiles(attachment);
    }

    await AttachmentService.remove(id, req.user!.sub);
    await auditAction(req, {
      action: "DELETE",
      entity: "Attachment",
      entityId: id,
      metadata: removeFile ? { removeFile: true } : undefined,
    });
    res.status(204).send();
  })
);

export default router;
