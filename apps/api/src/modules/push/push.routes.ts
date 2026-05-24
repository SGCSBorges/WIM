import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { PushService } from "./push.service";

const router = Router();

// Public VAPID key for the client to subscribe. 404 when push isn't configured
// so the web app can hide the toggle.
router.get(
  "/public-key",
  asyncHandler(async (_req, res) => {
    if (!PushService.isConfigured())
      return res.status(404).json({ error: "Push not configured" });
    res.json({ publicKey: PushService.publicKey() });
  })
);

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

router.post(
  "/subscribe",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { endpoint, keys } = SubscribeSchema.parse(req.body);
    await PushService.subscribe(req.user!.sub, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    res.status(201).json({ ok: true });
  })
);

const UnsubscribeSchema = z.object({ endpoint: z.string().url().max(500) });

router.post(
  "/unsubscribe",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const { endpoint } = UnsubscribeSchema.parse(req.body);
    await PushService.unsubscribe(req.user!.sub, endpoint);
    res.status(204).send();
  })
);

export default router;
