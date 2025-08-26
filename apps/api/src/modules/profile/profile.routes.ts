import { Router, Response } from "express";
import { authGuard } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import {
  DeleteAccountSchema,
  UpdateEmailSchema,
  UpdatePasswordSchema,
} from "./profile.schemas";
import { ProfileService } from "./profile.service";

const router = Router();

router.get(
  "/me",
  authGuard,
  asyncHandler(async (req: any, res: Response) => {
    const me = await ProfileService.get(Number(req.user.sub));
    res.json(me);
  })
);

router.put(
  "/me/email",
  authGuard,
  asyncHandler(async (req: any, res: Response) => {
    const { email, currentPassword } = UpdateEmailSchema.parse(req.body);
    const updated = await ProfileService.updateEmail(
      Number(req.user.sub),
      email,
      currentPassword
    );

    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: Number(req.user.sub),
      metadata: { field: "email" },
    });

    res.json(updated);
  })
);

router.put(
  "/me/password",
  authGuard,
  asyncHandler(async (req: any, res: Response) => {
    const { currentPassword, newPassword } = UpdatePasswordSchema.parse(
      req.body
    );
    const updated = await ProfileService.updatePassword(
      Number(req.user.sub),
      currentPassword,
      newPassword
    );

    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: Number(req.user.sub),
      metadata: { field: "password" },
    });

    res.json(updated);
  })
);

router.delete(
  "/me",
  authGuard,
  asyncHandler(async (req: any, res: Response) => {
    const { currentPassword } = DeleteAccountSchema.parse(req.body);
    await ProfileService.deleteAccount(Number(req.user.sub), currentPassword);

    await auditAction(req, {
      action: "DELETE",
      entity: "User",
      entityId: Number(req.user.sub),
    });

    res.status(204).send();
  })
);

export default router;
