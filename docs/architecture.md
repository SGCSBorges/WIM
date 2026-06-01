# WIM architecture

A map of how the pieces fit together. This is the "how it all flows" view —
the canonical detail lives elsewhere and is linked from here:

- [`CLAUDE.md`](../CLAUDE.md) — conventions, deploy quirks, the sharing model
  and billing in depth (canonical when this doc and it disagree).
- [`docs/api.md`](./api.md) — the auth model, the attachments gotcha, and a
  triage section for common confusions.
- [`docs/uml/`](./uml/) — PlantUML diagrams (in French) for the use cases,
  class model, core flows, and state machines.

## Monorepo shape

npm workspaces, three packages:

- **`apps/api`** — Node 22, Express + TypeScript, Prisma over PostgreSQL,
  BullMQ over Redis, Stripe, JWT in an httpOnly cookie. Entry
  `src/index.ts`; the app is assembled in `src/app.ts`.
- **`apps/web`** — Vite + React 19 + React Router v7 + Tailwind. PWA-
  installable. Entry `src/main.tsx`; routes in `src/App.tsx`; the API client
  is `src/services/api.ts`.
- **`packages/types`** — framework-free shared interfaces (no Zod, Prisma, or
  React) so both runtimes import the same response shapes. The string unions
  shared by API logging and web dropdowns (`AUDIT_ACTIONS`,
  `ATTACHMENT_TYPES`, `INVITE_STATUSES`, …) are `as const` tuples here — the
  single source of truth.

## Request lifecycle

A typical authenticated call from the web app walks this path
(wiring in [`apps/api/src/app.ts`](../apps/api/src/app.ts)):

1. **Web** issues `fetch(url, { credentials: "include" })` so the httpOnly
   `wim_token` cookie rides along (the client never handles the token —
   `services/api.ts` does this for every call).
2. **Security middleware** — `helmet`, CORS (against `CORS_ORIGIN`), and the
   global rate limiter (`config/security.ts`).
3. **`csrfGuard`** ([`middlewares/csrf.ts`](../apps/api/src/middlewares/csrf.ts))
   — on mutating methods (POST/PUT/PATCH/DELETE) that carry the cookie, it
   requires an `Origin`/`Referer` from the allowlist. Browsers attach these
   automatically; a cross-site script can't forge them. Safe methods and
   cookie-less requests are skipped.
4. **`authGuard`**
   ([`modules/auth/auth.middleware.ts`](../apps/api/src/modules/auth/auth.middleware.ts))
   — verifies the JWT signature → checks the Redis denylist for the token's
   `jti` (logout/reset revoke here) → re-reads `tokenVersion` and `role` from
   the DB in one small select. Bumping `tokenVersion` invalidates every token
   issued before it (logout, password reset, admin force-logout); a role
   change propagates immediately, no re-login.
5. **Route handler**, wrapped in `asyncHandler` so a thrown/rejected error
   lands in the global handler instead of hanging the request.
6. **`errorHandler`** ([`middlewares/error.ts`](../apps/api/src/middlewares/error.ts))
   — maps `ZodError → 400`, Prisma `P2002 → 409`, `createHttpError(status,…)`
   to its status, Multer upload errors to 413, and everything else to 500.
   5xx responses carry a `requestId` so support can quote it.

The Stripe webhook is the one exception: it's mounted **before**
`express.json()` (signature verification needs the raw body) and so sits
outside the cookie/CSRF path — it authenticates with an HMAC signature
instead.

## Core data flow: article → warranty → reminder

This is the spine of the product (see UML `02` activity and `04` sequence):

1. **Create an article** (`POST /api/articles`). Locations and tags are
   attached by id; ownership of each is checked before the FK write.
2. **Optional warranty**, submitted in the same request body. The server
   computes `garantieFin = garantieDateAchat + garantieDuration` months — the
   client never sends the end date.
3. **`AlertService` schedules reminders** — J-30 / J-7 / J-1 before
   `garantieFin`, enqueued as BullMQ jobs on the `wim-alerts` queue (past
   dates are skipped).
4. **The reminder processor delivers** when a job fires
   ([`jobs/processors/reminder.processor.ts`](../apps/api/src/jobs/processors/reminder.processor.ts)):
   load context → **push (awaited; throws on hard failure so BullMQ retries)**
   → **email (best-effort; never throws)** → **mark the alert `SENT`**. This
   order matters — a failed push must not mark the alert sent and lose the
   notification (fixed in round 10). Recurring custom alerts reschedule the
   next occurrence here too.

Push needs VAPID keys and email needs `RESEND_API_KEY` + `MAIL_FROM`; without
them each leg is a logged no-op, and the rest of the flow is unaffected.

## Two sharing models

Both are POWER_USER-only to share; canonical detail is in
[`CLAUDE.md`](../CLAUDE.md#sharing-model-two-flavors-both-power_user-only-to-share).
See UML `06` for the per-user sequence.

- **Public** — `Article.sharedWithPowerUsers` (a bool). Always read-only,
  visible to every POWER_USER. Owner kill-switch:
  `POST /api/articles/unshare-all`.
- **Per-user** — an `InventoryShare` (`READ`|`WRITE`, `active` flag), created
  by accepting a token-based `ShareInvite` (POWER_USER → POWER_USER, gated on
  both ends). WRITE recipients edit basic fields via
  `PUT /api/shared/articles/:id`.

On every POWER_USER → USER downgrade (Stripe cancel webhook, manual
`/api/billing/sync`, admin demote), `ShareService.cleanupSharingForUser`
flips public articles back, deactivates outgoing shares, and revokes pending
invites — **inside the same transaction as the role change**.

## Background jobs

Workers run **in the same process** as the API (cheap on Render's free tier).
Two BullMQ queues:

- **`wim-alerts`** — latency-sensitive warranty/custom reminders (3 attempts,
  exponential backoff).
- **`wim-maintenance`** — long-running sweeps, on three repeatable schedules.
  The schedule table (audit prune `0 3 * * *`, trash purge `30 3 * * *`,
  warranty digest `0 9 * * 1`, all UTC) and its opt-out env vars are
  documented once in [`docs/api.md`](./api.md#background-jobs); the wiring is
  in [`jobs/workers.ts`](../apps/api/src/jobs/workers.ts).

Live queue depth and recent failures surface in the Admin → Jobs tab
(`/admin/jobs`).

## Auth & security recap

- **Cookie** — `sameSite=none` in production (web and API are different PSL
  sites on Render subdomains, so the cookie must be cross-site + `secure`);
  `lax` in dev.
- **Force-logout / revocation** — `tokenVersion` (per-user, invalidates all
  tokens) and the Redis `jti` denylist (per-token, on logout). Detail in
  [`docs/api.md`](./api.md#authentication).
- **No email enumeration** — lookups by email return the same error for "not
  found" vs "found but wrong role" (e.g. `ShareService.createInvite`).

## Diagrams

The PlantUML sources under [`docs/uml/`](./uml/) cover the use cases, the
class model (entities + relations), the core add/reminder flows, the sharing
sequence, the warranty-claim and trash state machines, and a component/
deployment view. They're written in French; each one has a written analysis
in [`docs/uml/README.md`](./uml/README.md), and that README explains how to
render them locally.
