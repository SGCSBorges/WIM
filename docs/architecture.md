# WIM architecture

> 🇫🇷 Version française : [`architecture.fr.md`](./architecture.fr.md) · 📚 Index: [`README.md`](./README.md)

A map of how the pieces fit together. This is the "how it all flows" view —
the canonical detail lives elsewhere and is linked from here:

- [`CLAUDE.md`](../CLAUDE.md) — conventions, deploy quirks, the sharing model
  and billing in depth (canonical when this doc and it disagree).
- [`docs/api.md`](./api.md) — the auth model, the attachments gotcha, and a
  triage section for common confusions.
- [`docs/data-dictionary.md`](./data-dictionary.md) — the exhaustive
  field-by-field reference for all 30 tables + 14 enums.
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

The login → session → revocation cycle is drawn in UML `09`.

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

## Warranty lifecycle (renew / extend / history)

Because `Garantie` enforces 1:1 with an article (`garantieArticleId`
unique), renewal **rolls the live row forward** instead of inserting a
sibling — same `garantieId`, fresh dates. The prior contract is
snapshotted into the append-only `WarrantyHistory` table
(`event: RENEWED | EXTENDED | REPLACED`, plus `priorDateAchat`,
`priorDuration`, `priorFin`, optional note). Both renew + extend reuse
`AlertService.rescheduleForWarranty`, so the J-30/J-7/J-1 reminders
cancel + re-fire against the new end date without any duplicated
scheduler code. The Article-detail UI walks the history list newest-
first to render a chain like "renewed 2026 → 2028 → 2030"; the shared
`warrantyStatusFor` helper drives the status badge + filter pills so
the article list, Warranties view, Reports filter, and
Dashboard "Needs attention" panel always agree on what "expired" or
"expiring soon" means (30-day window matching the J-30 reminder).

## Two sharing models

Both require **share capability** (POWER_USER, or ADMIN which inherits it
without a subscription — `requireRole` runs on the `USER < POWER_USER < ADMIN`
hierarchy in `modules/common/roles.ts`). Canonical detail is in the "Sharing
model" section of [`CLAUDE.md`](../CLAUDE.md). See UML `06` for the per-user
sequence.

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
invites — **inside the same transaction as the role change**. The Stripe
upgrade/downgrade path (webhook guards + the `sync` fallback) is drawn in
UML `10`.

## Article ownership transfer

Permanent transfer between two share-capable accounts (POWER_USER or ADMIN),
detailed in the "Article ownership transfer" section of
[`CLAUDE.md`](../CLAUDE.md). Two flows:

- **PUSH** — owner sends an offer to a specific email. Recipient accepts from
  their `/transfers` page.
- **PULL** — share-capable user requests ownership of a visible article
  (publicly shared or via an active `InventoryShare`). Owner accepts or rejects.

On acceptance, a single Prisma transaction re-owns `Article`, `Garantie`,
`WarrantyHistory`, `Alerte`, `Attachment`, and `ArticleNote` to the new owner,
then deletes `ArticleLocation` + `ArticleTag` (they're owner-scoped — the new
owner re-assigns from their own lists) and revokes all other PENDING transfer
requests for the same article.

Status lifecycle: `PENDING → ACCEPTED | REJECTED | REVOKED | EXPIRED` (7-day
window). Role downgrade via Stripe cancel or admin demote additionally revokes
all PENDING transfer requests where the downgraded user is a party — the same
`ShareService.cleanupSharingForUser` call that handles sharing cleanup handles
this too.

Audit actions: `ARTICLE_TRANSFER_INIT`, `ARTICLE_TRANSFER_ACCEPT`,
`ARTICLE_TRANSFER_REJECT`, `ARTICLE_TRANSFER_REVOKE`.

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

## Web app shell & design system

The web client is built on a tokenized design system with theme-aware CSS
variables (light / dark / ocean / cyber / sunset) bridged into Tailwind utility
classes via `apps/web/tailwind.config.js` — so primitives don't hardcode
colors and every route works across all five themes. The active theme also
drives a single `<meta name="theme-color">` (synced in `theme/theme.tsx`) so
the mobile browser chrome and installed-PWA status bar match it, and
`<html lang>` tracks the selected language for screen-reader pronunciation.

- **Primitives** (`apps/web/src/components/ui/`): `Button`, `Field` (+
  `Input`/`Textarea`/`Select`), `PageHeader`, `Tabs`, `ConfirmDialog`,
  `Badge`, `Card`/`Section`, `Stat`, `Pagination`, `Breadcrumbs`,
  `Segmented`, `Popover`, `Dropzone`, `CommandPalette`. All accessible
  (focus management, ARIA, `prefers-reduced-motion`), tokenized, and
  imported via the barrel `components/ui`. `Field` reflects `required` onto
  its control; destructive `ConfirmDialog`s focus Cancel; numeric `Input`s
  ignore the scroll wheel; toasts cap their visible stack. Counts render
  through `utils/number.formatCount` for locale grouping, and CSS
  `color-scheme` per theme keeps native controls in step with dark themes.
- **App shell** (`apps/web/src/components/layout/`): persistent
  `Sidebar` (icon-rail collapse persisted in localStorage), sticky
  `TopBar` (search affordance for the command palette, `NotificationBell`,
  PWA install, language/theme, profile, logout), `MobileDrawer` on
  small viewports, and a `BackToTop` button for long lists. Routes/auth
  stay in `App.tsx`.
- **Route chrome** (`components/layout/RouteChrome`, mounted once in
  `main.tsx`): per-page `<title>`, scroll-to-top + focus-to-`#main` on
  forward navigation (POP/Back preserves the browser's restored scroll so
  you return to your place in a list), and a polite `aria-live` region that
  announces each new page — the standard SPA fixes for navigation that's
  otherwise invisible to assistive tech and bookmarks.
- **Command palette + shortcuts**: `AppShell` mounts a `CommandPalette`
  and registers global hotkeys via `hooks/useHotkeys`. `mod+k` opens the
  palette anywhere (including from inside fields); `c` opens the
  create-article form; `?` opens the `ShortcutsHelp` overlay; `g <key>`
  jumps to a nav section (`g a` → Articles, etc.). Two-key sequences
  and modifier combos are scoped to non-editable focus; modifier combos
  fire even while typing, plain keys do not.
- **Notification bell**: `NotificationBell` polls
  `GET /api/alerts/notifications` on mount + every route change (no
  tight interval). Opening the popover calls `POST /api/alerts/mark-seen`
  to clear the unseen badge; rows expose 1d/7d/30d snooze via the
  existing `/alerts/:id/snooze` endpoint. The bell hides silently if the
  endpoint errors (client/server skew safety).
- **Preferences**: cross-device prefs (`theme`/`language`/`dateFormat`/
  `currency`) live on the `User` row. The auth `/me` payload carries them,
  so the SPA hydrates the correct theme/language/date format/currency
  before the first paint. Providers in `theme/theme.tsx`, `i18n/i18n.tsx`,
  and `preferences/preferences.tsx` expose `hydrate*` (apply server value
  without echoing back) and write user-initiated changes through to
  `PUT /api/profile/me/preferences` (debounced, best-effort); `currency`
  rides on the `preferences` provider too, so money views read it from
  context instead of each refetching `/profile/me`.
  `localStorage` is the pre-auth cache + logged-out fallback. UI
  `density` (`comfortable | compact`) is per-device only (cosmetic),
  driving `data-density` on `<html>`.

## Auth & security recap

- **Cookie** — in production the browser talks to a single origin: the
  `render.yaml` `/api/*` proxy on the static site forwards API calls
  server-side, which is what keeps login working on Safari/iOS (ITP drops
  cross-site `Set-Cookie`). The API still sets `sameSite=none; secure` so
  direct API access works too; `lax` in dev.
- **Force-logout / revocation** — `tokenVersion` (per-user, invalidates all
  tokens) and the Redis `jti` denylist (per-token, on logout). Detail in
  [`docs/api.md`](./api.md#authentication).
- **Sessions table** — `UserSession` is one row per signed-in device,
  keyed by the JWT `jti`. Created on register/login; `authGuard` does a
  best-effort `lastActiveAt` bump (throttled to 1/min per jti) so the UI
  can render "active N minutes ago" without a DB write per request.
  Revoking a session here denylists the jti **and** stamps `revokedAt`,
  so the live cookie bounces on the next request and the UI list drops
  the row.
- **TOTP 2FA** — opt-in (`User.totpEnabled`). The whole password-only
  login path stays unchanged when the flag is false; when true,
  `/auth/login` returns a short-lived (5 min) pre-auth `challengeToken`
  with `kind:"totp-challenge"` instead of a session cookie, and the
  client posts the code to `/auth/login/verify-totp` to mint the real
  session. Backup codes are bcrypt-hashed and consumed on use.
- **No email enumeration** — lookups by email return the same error for "not
  found" vs "found but wrong role" (e.g. `ShareService.createInvite`).

## Diagrams

The PlantUML sources under [`docs/uml/`](./uml/) cover the use cases, the
class model (entities + relations), the core add/reminder flows, the sharing
sequence, the warranty-claim and trash state machines, a component/deployment
view, the alert lifecycle, the ownership-transfer state machine (`11`), and the
two security-critical sequences — authentication/session (`09`) and Stripe
billing (`10`). They're written in French; each one has a written analysis in
[`docs/uml/README.md`](./uml/README.md), and that README explains how to
render them locally.
