/**
 * Calendar feed routes. /api/calendar/me (auth-required) returns the
 * current user's feed URL + token; /api/calendar/feed/<token>.ics is
 * PUBLIC (token-authenticated, no cookie) so external calendar clients
 * can subscribe without OAuth.
 */
import { Router } from "express";
import { asyncHandler } from "../common/http";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { CalendarService } from "./calendar.service";

const router = Router();

// Current feed status. Open to any authenticated caller (not gated on
// `calendar_feed`) so a user whose access was later restricted can still see
// — and disable — an already-issued feed, mirroring the DELETE below.
router.get(
  "/token",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const path = await CalendarService.getStatus(req.user!.sub);
    res.json({ enabled: path !== null, path });
  })
);

// Generate (or rotate) the caller's calendar feed token. Gated on
// `calendar_feed`; the DELETE (disable) and the public ICS feed stay open so
// a user can always turn off — and external clients keep reading — an
// already-issued feed even if access is later restricted.
router.post(
  "/token",
  authGuard,
  requireFeature("calendar_feed"),
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
