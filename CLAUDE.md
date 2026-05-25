# WIM — Warranty & Inventory Manager

Quick orientation for a fresh chat. This file lives at the repo root so it
loads into every new Claude Code session.

## Stack

- **Monorepo**: npm workspaces. `apps/api`, `apps/web`, `packages/types`.
- **API** (`apps/api`): Node 22, Express + TypeScript + Prisma + PostgreSQL
  + Redis (ioredis) + BullMQ + Stripe + JWT. Auth via httpOnly cookies, JWT
  with `jti` (Redis denylist on logout) + `v` (per-user `tokenVersion` for
  force-logout). Helmet + CORS + rate limiting in `config/security.ts`.
  Audit logs via `auditAction` (typed action union — extend when adding new
  ones). Background workers in `src/jobs/workers.ts`.
- **Web** (`apps/web`): Vite + React 19 + React Router v7 + Tailwind v3 +
  react-hook-form + Zod (resolvers v5 for Zod v4 compatibility). Route-level
  code splitting with `React.lazy`. PWA-installable (manifest + service
  worker + sharp-generated icons).
- **Shared types** (`packages/types`): plain interfaces (no Zod/Prisma) so
  both runtimes can import.

## Branching & deploy

- Develop on **`dev`**. Push to dev triggers CI and Render redeploys.
- Render hosts two services:
  - `wimapi.onrender.com` — API service. `render-build:api` runs `npm
    install --include=optional --workspaces && prisma migrate deploy &&
    tsc`.
  - `wim-web.onrender.com` — static web site. Built from `apps/web/dist`
    via the `render.yaml` Blueprint at the repo root (SPA rewrite is in
    `render.yaml`, not the dashboard).
- Critical Render env vars (set in dashboard, never in repo):
  - API: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`,
    `STRIPE_WEBHOOK_SECRET`, `STRIPE_POWER_USER_PRICE_MONTHLY/YEARLY`,
    `CORS_ORIGIN` (no trailing slash, comma-list OK), `APP_URL` (**single
    origin**, no trailing slash — `getAppUrl()` validates and rejects
    junk), `NODE_ENV=production`.
  - API (optional, Web Push): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
    (generate once via `npx web-push generate-vapid-keys`), optional
    `VAPID_SUBJECT` (`mailto:` contact). Without them, alert push delivery
    is a no-op and the "Enable notifications" toggle hides — everything
    else still works.
  - API (optional, Email reminders): `RESEND_API_KEY` + `MAIL_FROM` (a
    Resend-verified sender like `WIM <reminders@domain>`). When both are
    set, the reminder worker also emails alerts via Resend's REST API (no
    SDK dependency — a plain `fetch`), respecting each user's
    `User.emailReminders` opt-out (Profile toggle). Unset = no-op + log,
    exactly like `PushService`.
  - Web: `VITE_API_BASE_URL=https://wimapi.onrender.com/api`.
- Render free-tier Postgres expires after ~30 days and the API container
  cold-starts in ~30 s. The fetch timeout in `apps/web/src/services/api.ts`
  is 45 s for that reason. After a DB reset, re-seed admin via the
  temporary `/api/auth/bootstrap-admin` + `TestAdmin` button on the login
  screen (see Open items).

## Common commands

```bash
# from repo root
npm run lint                              # all workspaces
npm test                                  # all workspaces
npm --workspace apps/api run build        # tsc
npm --workspace apps/api run prisma:migrate          # create migration (dev)
npm --workspace apps/api run prisma:deploy            # apply (prod)
npm --workspace apps/web run build        # vite build (runs prebuild → sharp icons)
npm --workspace apps/web run dev          # local dev server
DATABASE_URL=... npm --workspace apps/api run promote:admin -- email@x   # promote
```

## Conventions

- **i18n**: `apps/web/src/i18n/translations.ts` is the main dict (70 KB,
  three languages: `en` / `fr` / `pt`). New keys go into
  `apps/web/src/i18n/translations.extras.ts` to avoid churning the big
  file. `t()` lookup chain is `extras[lang] → translations[lang] →
  extras.en → translations.en → key`, so extras can also override an
  existing key for a copy fix.
- **Theming**: CSS variables in `apps/web/src/index.css`, four themes
  (`light` / `dark` / `ocean` / `cyber`) toggled via `data-theme` on
  `<html>`. Brand palette comes from the WIM shield logo (navy primary +
  orange accent). Don't hardcode Tailwind colors on shared components —
  use `.ui-*` utility classes (`ui-card`, `ui-btn-primary`,
  `ui-badge-power`, etc.).
- **Auth**: every request reads `tokenVersion` + `role` from DB in
  `authGuard` (one small select). Bumping `tokenVersion` invalidates
  every JWT for a user. Role changes propagate immediately without
  re-login.
- **Errors**: API uses `createHttpError(status, msg)` (utility in
  `apps/api/src/utils/http-error.ts`); the global error middleware
  serializes the `status` field. Frontend's `getErrorMessage(err,
  fallback)` reads `err.message` or falls back.
- **Don't introduce email enumeration**: helpers that look up a user by
  email should return the same error for "not found" vs "found but
  wrong role" (see `ShareService.createInvite`).
- **Don't add error handling, fallbacks, or comments for impossible
  cases.** Only at system boundaries.
- **Comments**: describe *why*, not *what*. Skip them entirely when the
  name says enough.
- **Always edit existing files** rather than creating new ones unless
  the new file is genuinely needed.

## Sharing model (two flavors, both POWER_USER-only to share)

1. **Public** — `Article.sharedWithPowerUsers: bool`. Always read-only.
   Visible to every POWER_USER. Toggled per article via
   `articles/article.share.routes.ts`. Owner kill-switch:
   `POST /api/articles/unshare-all`.
2. **Per-user (direct)** — `InventoryShare` with `permission READ|WRITE`,
   created via `ShareInvite` (POWER_USER → POWER_USER, recipient must
   accept). WRITE recipients can edit basic article fields via
   `PUT /api/shared/articles/:id`. Invites are POWER_USER-only on both
   ends (createInvite enforces invitee role; accept route gates on
   `requireRole("POWER_USER")`).

Both surfaces collapse into the recipient's `/sharing` page (read), the
owner's `/sharing` page (invite/manage), and the owner's `/profile` page
("Articles you've shared publicly" + "People you've invited").

On every POWER_USER → USER transition (Stripe cancel webhook, manual
`/api/billing/sync`, admin demote) `ShareService.cleanupSharingForUser`
flips public articles back, deactivates outgoing per-user shares, and
revokes pending invites — inside the same transaction as the role change.

## Billing

- Subscription product = `POWER_USER` upgrade. Monthly + yearly Stripe
  prices.
- Webhook + manual sync are both supported. The Webhook is canonical;
  `POST /api/billing/sync` is a fallback the frontend calls on return
  from Checkout so the UI doesn't have to wait for webhook delivery (free
  Render's cold start often exceeds Stripe's 10-second retry window).
- `getAppUrl()` in `billing.routes.ts` strictly validates `APP_URL` —
  reject anything that isn't a single valid http(s) origin, since past
  misconfig (a comma-separated value copied from `CORS_ORIGIN`) broke
  the Stripe `success_url`.
- Per-user billing details (next bill / cancel-at-period-end) come from
  `GET /api/billing/me`, which calls Stripe live.

## Admin

- `requireRole("ADMIN")` everywhere under `/api/admin/*`.
- Admin UI in `apps/web/src/components/admin/AdminUsers.tsx`. Three
  tabs: Dashboard / Users / Audit log.
- User row actions: inline role edit (last-admin protection in a
  serializable tx), reset password (bumps tokenVersion), force-logout
  (also bumps tokenVersion), delete user.
- Cursor-paginated audit log under `/api/admin/audit-log`. Action union
  is in `apps/api/src/modules/audit/audit.service.ts` — add new strings
  there before logging them.

## PWA

- `apps/web/public/icon.png` is the master shield. Build script
  `apps/web/scripts/generate-pwa-icons.mjs` (sharp) resizes to
  `icon-192.png`, `icon-512.png`, plus maskable variants on `prebuild` /
  `predev`. Generated PNGs are `.gitignored`.
- `apps/web/public/sw.js` is a minimal service worker (network-first
  navigations, cache-first hashed assets, never intercepts `/api/`).
  Registered in `main.tsx` only in production. Required for Chrome to
  treat the site as installable.
- After deploying, installed-app users will keep seeing the old shell
  until the SW updates or they reinstall. Telling them to hard-refresh
  + DevTools → Application → Service Workers → "Update" usually works.

## Known gotchas

- **Local git proxy regularly 403s on push.** Most reliable workaround is
  pushing via the GitHub MCP `push_files` tool. Useful for text-only
  commits; binary files don't survive that path (utf-8 corruption), so
  keep generated PNGs out of git (see PWA section).
- **`npm ci` vs `npm install`**: CI and `render-build:*` use `npm
  install --workspaces` so a stale root lockfile doesn't block deploys
  when a workspace adds a dep. Reproducibility is slightly weaker than
  `npm ci` but the lockfile, when in sync, still pins.
- **Cookie sameSite**: `none` in production (web/api on different
  Render subdomains = different PSL sites), `lax` in dev. Requires
  `secure=true` which is set automatically in prod.
- **Vite hashes asset filenames**, so a new deploy invalidates old CSS
  references in the SW cache automatically. `index.html` is fetched
  network-first so users get the fresh hash.

## Open items / temporary stuff

- **`/api/auth/bootstrap-admin`** + the `TestAdmin` button on the login
  screen are temporary. They one-shot promote `admin@admin.com` if and
  only if there's no ADMIN yet (so they're idempotent and not a
  backdoor). User wants to keep them around for now since Render's free
  Postgres expires monthly and they'd otherwise have to re-promote
  manually. Remove once the seed flow is replaced.
- **Two sharing models** (public flag vs InventoryShare) still both
  exist intentionally. The owner-side UX has separate flows for each;
  consolidating into a single "Share article…" dialog with options
  (Public / Specific user) was discussed and deferred.

## File pointers (top of mind)

- API entry: `apps/api/src/index.ts`, app wiring in `apps/api/src/app.ts`
- Auth: `apps/api/src/modules/auth/` (middleware, service, routes, schemas,
  token-denylist)
- Sharing: `apps/api/src/modules/shares/{share.service,share.routes}.ts`,
  `apps/api/src/modules/shared/shared.routes.ts`,
  `apps/api/src/modules/articles/article.share.routes.ts`
- Billing: `apps/api/src/modules/billing/{billing,billing.me,billing.webhook}.routes.ts`
- Admin: `apps/api/src/modules/admin/admin.routes.ts`
- Web entry: `apps/web/src/main.tsx`, routes in `apps/web/src/App.tsx`
- API client: `apps/web/src/services/api.ts`
- i18n: `apps/web/src/i18n/{i18n.tsx,translations.ts,translations.extras.ts}`
- Theme: `apps/web/src/theme/theme.tsx`, CSS in `apps/web/src/index.css`
