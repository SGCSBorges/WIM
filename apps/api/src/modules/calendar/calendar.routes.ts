import { Router } from "express";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { CalendarService } from "./calendar.service";

const router = Router();

// Generate (or rotate) the caller's calendar feed token.
router.post(
  "/token",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const token = await CalendarService.generateToken(req.user!.sub);
    res.json({ token, path: `/api/calendar/feed/${token}.ics` });
  })
);

// Disable the feed.
router.delete(
  "/token",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    await CalendarService.disableToken(req.user!.sub);
    res.status(204).send();
  })
);

// Public, token-gated iCalendar feed. No cookie auth — the token IS the
// capability (calendar clients can't send our auth cookie). The param pattern
// is pinned so the trailing ".ics" isn't swallowed into the token.
router.get(
  "/feed/:token([a-f0-9]{64}).ics",
  asyncHandler(async (req, res) => {
    const ics = await CalendarService.feedForToken(req.params.token);
    if (ics === null) return res.status(404).send("Not found");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="wim-calendar.ics"');
    res.send(ics);
  })
);

export default router;
