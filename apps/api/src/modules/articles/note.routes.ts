import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";

const router = Router();

const NoteKindSchema = z.enum([
  "SERVICE",
  "WARRANTY_CLAIM",
  "MAINTENANCE",
  "OTHER",
]);

const NoteCreateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  kind: NoteKindSchema.optional(),
});

const NoteUpdateSchema = z
  .object({
    content: z.string().trim().min(1).max(2000).optional(),
    kind: NoteKindSchema.optional(),
  })
  .refine((d) => d.content !== undefined || d.kind !== undefined, {
    message: "Provide content or kind",
  });

// Confirm the article belongs to the caller before touching its notes.
async function assertArticleOwned(articleId: number, ownerUserId: number) {
  const owned = await prisma.article.findFirst({
    where: { articleId, ownerUserId },
    select: { articleId: true },
  });
  if (!owned) throw createHttpError(404, "Article not found");
}

router.get(
  "/:id/notes",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.id);
    await assertArticleOwned(articleId, req.user!.sub);
    const notes = await prisma.articleNote.findMany({
      where: { articleId },
      orderBy: { createdAt: "desc" },
    });
    res.json(notes);
  })
);

router.post(
  "/:id/notes",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.id);
    await assertArticleOwned(articleId, req.user!.sub);
    const body = NoteCreateSchema.parse(req.body);
    const note = await prisma.articleNote.create({
      data: {
        articleId,
        ownerUserId: req.user!.sub,
        content: body.content,
        ...(body.kind ? { kind: body.kind } : {}),
      },
    });
    await auditAction(req, {
      action: "CREATE",
      entity: "ArticleNote",
      entityId: note.noteId,
      metadata: { articleId, kind: note.kind },
    });
    res.status(201).json(note);
  })
);

router.patch(
  "/:id/notes/:noteId",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.id);
    const noteId = idParam.parse(req.params.noteId);
    const data = NoteUpdateSchema.parse(req.body);
    // Owner-scoped update via updateMany so a foreign id never escapes a 404.
    const result = await prisma.articleNote.updateMany({
      where: { noteId, articleId, ownerUserId: req.user!.sub },
      data,
    });
    if (result.count === 0) throw createHttpError(404, "Note not found");
    const updated = await prisma.articleNote.findUnique({ where: { noteId } });
    await auditAction(req, {
      action: "UPDATE",
      entity: "ArticleNote",
      entityId: noteId,
      metadata: { articleId, fields: Object.keys(data) },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id/notes/:noteId",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.id);
    const noteId = idParam.parse(req.params.noteId);
    // Owner-scoped delete; deleteMany so a foreign id is a silent no-op (404).
    const result = await prisma.articleNote.deleteMany({
      where: { noteId, articleId, ownerUserId: req.user!.sub },
    });
    if (result.count === 0) throw createHttpError(404, "Note not found");
    await auditAction(req, {
      action: "DELETE",
      entity: "ArticleNote",
      entityId: noteId,
      metadata: { articleId },
    });
    res.status(204).send();
  })
);

export default router;
