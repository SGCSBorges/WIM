# WIM — Warranty & Inventory Manager

WIM is a full-stack SaaS application for tracking physical assets, their warranties, attachments, and alerts. Built with a React frontend and a Node.js/Express API backed by PostgreSQL and Redis.

> **New chat?** Read [`CLAUDE.md`](./CLAUDE.md) at the repo root — it has the internal context (deploy quirks, conventions, open items) the README intentionally doesn't repeat.
>
> **How it fits together?** [`docs/architecture.md`](./docs/architecture.md) maps the request lifecycle, the article→warranty→reminder data flow, the two sharing models, and the jobs pipeline.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS · React Router v7 · react-hook-form + Zod |
| Backend | Node.js 22 · Express · TypeScript · Prisma ORM |
| Database | PostgreSQL |
| Queue | BullMQ + Redis |
| Auth | JWT in `httpOnly` cookie (`wim_token`) + Redis denylist on logout + per-user `tokenVersion` for force-logout |
| Payments | Stripe (subscriptions + webhooks) |
| PWA | manifest + service worker + sharp-generated icons |
| Logging | Pino structured logging |

---

## Workspace structure

```
WIM/
├── apps/
│   ├── api/                # Express REST API (port 3000)
│   └── web/                # React SPA + PWA (port 5173)
├── packages/
│   └── types/              # Plain TS interfaces shared by api + web
├── render.yaml             # Render Blueprint for the static web site
├── CLAUDE.md               # Context primer for new chats
└── .github/workflows/ci.yml
```

---

## Getting started

### Prerequisites

- Node.js ≥ 22
- PostgreSQL
- Redis (for BullMQ)

### Install & run

```bash
npm install --workspaces
cp apps/api/.env.example apps/api/.env  # fill in values, see env table below
npm --workspace apps/api run prisma:migrate
npm --workspace apps/api run dev        # API on :3000
npm --workspace apps/web run dev        # Web on :5173 (runs `predev` to generate PWA icons)
```

Set `VITE_API_BASE_URL=http://localhost:3000/api` in `apps/web/.env.local` so the web app finds the local API.

### Required environment variables (API)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing secret (min 32 chars, random). App exits at boot if missing. |
| `REDIS_URL` | `redis://host:port` — used for the JWT denylist + BullMQ |
| `CORS_ORIGIN` | Allowed web origin, no trailing slash. Comma-list OK. |
| `APP_URL` | Public web origin used for Stripe redirect URLs. **Single origin**, no trailing slash. |

### Optional environment variables (API)

| Variable | Description |
|---|---|
| `PORT` | API port (default `3000`) |
| `STRIPE_SECRET_KEY` | Stripe secret key (required for billing) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_POWER_USER_PRICE_MONTHLY` | `price_…` for monthly POWER_USER subscription |
| `STRIPE_POWER_USER_PRICE_YEARLY`  | `price_…` for yearly POWER_USER subscription |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window (default `60000`) |
| `RATE_LIMIT_MAX` | Max requests per window (default `100`) |

---

## User roles

| Role | Capabilities |
|---|---|
| `USER` | Manage own articles, warranties, attachments, alerts |
| `POWER_USER` | Everything USER does, plus: share articles publicly with all power users (read-only), invite other power users to read or write their full inventory, edit articles where they have WRITE access, transfer article ownership to/from another Power User |
| `ADMIN` | Everything POWER_USER does (sharing and transfers, no subscription required), plus: user management, audit log, force-logout, password reset for any user |

Public registration always creates a `USER`. To create the first admin:

```bash
# Locally
npm --workspace apps/api run promote:admin -- you@example.com

# On Render's API service shell
node dist/scripts/promote-to-admin.js you@example.com
```

For convenience on free-tier Render (Postgres expires monthly), there's also a temporary `POST /api/auth/bootstrap-admin` endpoint + `TestAdmin` button on the login screen — it one-shot promotes `admin@admin.com` only when no ADMIN exists, so it's idempotent. Remove once you replace it with a proper seeding flow.

---

## API reference

Base path: `/api`. Auth is via the `wim_token` httpOnly cookie set on login — clients must use `credentials: 'include'`. No `Authorization` header.

> **Canonical reference:** the live **Swagger UI** at `GET /api/docs` (and the raw spec at `GET /api/openapi.json`) is generated from the same Zod schemas the API validates against, so it never drifts. The tables below are a curated map of the resource surface — for exhaustive request/response shapes and query params, use Swagger. See also [`docs/api.md`](./docs/api.md) for the auth model and triage.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | ✗ | Register a new USER |
| `POST` | `/login` | ✗ | Login — sets `wim_token` cookie. When TOTP is enabled, returns `{ totpRequired: true, challengeToken }` instead. |
| `POST` | `/login/verify-totp` | ✗ | Complete a TOTP challenge — `{ challengeToken, code }` → real session cookie + `UserSession` row |
| `POST` | `/logout` | ✓ | Logout — adds jti to Redis denylist + clears cookie |
| `GET`  | `/me` | ✓ | Current user profile |
| `POST` | `/forgot-password` | ✗ | Request a reset link (uniform response — no email enumeration) |
| `POST` | `/reset-password` | ✗ | Consume the emailed token + set a new password (bumps `tokenVersion`) |
| `POST` | `/bootstrap-admin` | ✗ | One-shot promote `admin@admin.com` if no ADMIN exists yet (idempotent) |

### Articles — `/api/articles`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | ✓ | List own articles — filters: `?q=` `?locationId=` `?tagId=` `?warrantyStatus=` `?priceMin=/priceMax=` `?createdFrom=/createdTo=` `?sort=/dir=` `?page=/limit=`. Returns `{ items, total, page, limit }` |
| `POST`   | `/` | ✓ | Create article (can include embedded warranty + locationIds + tagIds) |
| `GET`    | `/:id` | ✓ | Get single article |
| `PUT`    | `/:id` | ✓ | Update article (and its warranty + locations + tags) |
| `DELETE` | `/:id` | ✓ | Soft-delete (moves to trash) |
| `POST`   | `/:id/duplicate` | ✓ | Deep-copy an article (locations + tags; warranty intentionally skipped) |
| `GET`    | `/trash` | ✓ | List soft-deleted articles |
| `POST`   | `/:id/restore` | ✓ | Restore from trash |
| `DELETE` | `/:id/purge` | ✓ | Permanently delete (skip retention) |
| `POST`   | `/trash/bulk-restore` · `/trash/bulk-purge` | ✓ | Bulk restore / purge (`{ ids }`, ≤ 500) |
| `POST`   | `/bulk-delete` · `/bulk-share` · `/bulk-assign` | ✓ | Bulk soft-delete / share-toggle / assign locations+tags (`{ ids, … }`) |
| `POST`   | `/import` | ✓ | CSV import (`?dryRun=1` validates without writing) |
| `GET`    | `/export/inventory.csv` · `/export/inventory.pdf` · `/export/labels.pdf` | ✓ | Exports (CSV honours list filters; labels carry QR codes) |
| `GET`    | `/:id/claim.pdf` | ✓ | Warranty-claim sheet PDF |
| `GET`/`POST`/`PATCH`/`DELETE` | `/:id/notes[/:noteId]` | ✓ | Article service/maintenance notes (kind: SERVICE/WARRANTY_CLAIM/MAINTENANCE/OTHER) |
| `GET`    | `/shared-public` | POWER_USER | List own articles that are publicly shared |
| `POST`   | `/unshare-all` | POWER_USER | Kill switch — unshare every publicly-shared article |
| `POST`   | `/:id/share` | POWER_USER | Mark article shared-with-all-power-users (read-only) |
| `GET`    | `/:id/shares` | POWER_USER | Get share status for an article |
| `DELETE` | `/:id/share` | POWER_USER | Unshare an article |
| `POST`   | `/:id/transfer/push` | POWER_USER | Offer article ownership to another Power User by email |
| `POST`   | `/:id/transfer/pull` | POWER_USER | Request ownership of a shared article (article must be visible to caller) |

### Warranties — `/api/warranties`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | ✓ | List own warranties (paginated) |
| `POST`   | `/` | ✓ | Create standalone warranty |
| `GET`    | `/:id` | ✓ | Get warranty |
| `PUT`    | `/:id` | ✓ | Update warranty (recalculates expiry + reschedules alerts) |
| `PATCH`  | `/:id/claim` | ✓ | Update claim status (`NONE→OPEN→APPROVED\|REJECTED→RESOLVED`) + note |
| `DELETE` | `/:id` | ✓ | Delete warranty (cancels its alerts) |

### Attachments — `/api/attachments`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | ✓ | List attachments (`?articleId=`, `?garantieId=`) |
| `POST`   | `/upload` | ✓ | Upload file (multipart/form-data, 10 MB cap, magic-byte validated) |
| `DELETE` | `/:id` | ✓ | Delete (`?removeFile=true` also deletes the file from disk) |

Uploaded files are served behind auth at `GET /uploads/<filename>` — the owner must be the authenticated user.

### Alerts — `/api/alerts`

Warranty reminders (J-30/J-7/J-1) are scheduled automatically by BullMQ; custom alerts can recur monthly.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`  | `/` | ✓ | List alerts (`?status=` `?kind=` `?articleId=` `?page=/limit=`) |
| `POST` | `/` | ✓ | Create a custom alert (optional `recurrenceMonths`) |
| `POST` | `/:id/snooze` | ✓ | Snooze by N days |
| `POST` | `/:id/cancel` | ✓ | Cancel an alert |

### Locations — `/api/locations`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | ✓ | List own locations (`?page=/limit=`) |
| `POST`   | `/` | ✓ | Create location |
| `PUT`    | `/:id` | ✓ | Update location |
| `DELETE` | `/:id` | ✓ | Delete location |
| `GET`    | `/:id/articles` | ✓ | Articles in a location (paginated `{ items, total, page, limit }`) |
| `POST`   | `/:id/articles` | ✓ | Attach an article to a location |
| `DELETE` | `/:id/articles/:articleId` | ✓ | Detach an article from a location |

### Tags — `/api/tags`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | ✓ | List own tags (with per-tag article counts) |
| `POST`   | `/` | ✓ | Create a tag |
| `PUT`    | `/:id` | ✓ | Rename a tag |
| `POST`   | `/merge` | ✓ | Merge one tag into another (`{ fromId, intoId }`; re-tags + dedupes) |
| `DELETE` | `/:id` | ✓ | Delete a tag |

### Saved views — `/api/saved-views`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | ✓ | List saved Articles-filter presets |
| `POST`   | `/` | ✓ | Save a preset (`{ name, query }`) |
| `DELETE` | `/:id` | ✓ | Delete a preset |

### Calendar — `/api/calendar`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST`   | `/token` | ✓ | Enable the iCal feed (mints a capability token) |
| `DELETE` | `/token` | ✓ | Disable the feed |
| `GET`    | `/feed/:token.ics` | ✗ (token) | RFC-5545 feed of warranties/alerts — token-authenticated so calendar apps can subscribe |

### Push — `/api/push`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`  | `/public-key` | ✓ | VAPID public key (404 when push isn't configured server-side) |
| `POST` | `/subscribe` | ✓ | Register a Web Push subscription |
| `POST` | `/unsubscribe` | ✓ | Remove a subscription |

### Sharing — `/api/shares`

Per-user inventory sharing between **share-capable** users. Sharing is the POWER_USER feature, and **ADMIN inherits it without a subscription** (authorization runs on a `USER < POWER_USER < ADMIN` hierarchy, so `requireRole("POWER_USER")` clears for ADMIN). All actions require share capability on both ends (the invitee must already be a registered POWER_USER or ADMIN; the accept route gates on `requireRole("POWER_USER")`).

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST`   | `/invites` | POWER_USER | Send invite (invitee role enforced server-side) |
| `POST`   | `/invites/accept` | POWER_USER | Redeem an invite token |
| `GET`    | `/invites/sent` | POWER_USER | List own sent invites |
| `DELETE` | `/invites/:id` | POWER_USER | Revoke a sent invite |
| `GET`    | `/owned` | POWER_USER | List active outgoing shares |
| `GET`    | `/received` | POWER_USER | List active incoming shares |
| `PUT`    | `/:targetUserId` | POWER_USER | Update share permission (READ ↔ WRITE) |
| `DELETE` | `/:targetUserId` | POWER_USER | Revoke an active share |

### Shared view — `/api/shared`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/articles` | POWER_USER | Articles shared to the caller — merges per-user shares + globally-shared. Each row carries `source: "user" \| "global"` and `permission: "READ" \| "WRITE"`. |
| `PUT` | `/articles/:id` | POWER_USER (with WRITE share) | Edit basic article fields when the caller has an active WRITE InventoryShare from the owner. Warranty + locations stay with the owner. |

### Statistics — `/api/statistics`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/dashboard` | ✓ | Role-aware dashboard stats |
| `GET` | `/basic` | ✓ | Basic counts for the current user |
| `GET` | `/admin` | ADMIN | Platform-wide stats |
| `GET` | `/analytics` | POWER_USER (`analytics`) | Spending & portfolio-value analytics |
| `GET` | `/budget` | POWER_USER (`budget`) | Spend vs monthly/annual budget for the current period |

### Transfers — `/api/articles/transfers` (POWER_USER)

Permanent ownership transfer between Power Users. See [`docs/api.md`](./docs/api.md) and [`CLAUDE.md`](./CLAUDE.md) for the full lifecycle (`PENDING → ACCEPTED | REJECTED | REVOKED | EXPIRED`, 7-day expiry). Initiating endpoints are on the article resource above.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/transfers/incoming` | POWER_USER | Pending transfers waiting on the caller to act (PUSH to accept, PULL to accept/reject) |
| `GET`    | `/transfers/outgoing` | POWER_USER | Transfers the caller initiated (history) |
| `POST`   | `/transfers/:token/accept` | POWER_USER | Accept a transfer (PUSH: recipient accepts; PULL: owner accepts) |
| `POST`   | `/transfers/:token/reject` | POWER_USER | Reject a transfer (PULL: owner rejects) |
| `DELETE` | `/transfers/:id` | POWER_USER | Revoke a transfer the caller initiated (PUSH: owner cancels; PULL: requester cancels) |

### Loans — `/api/loans` (POWER_USER · `loans`)

Track who borrowed an item and when it's due back. Lending sets the article `LOANED`; returning reverts it (only if still `LOANED`). Return + delete stay open so a downgraded user can always close out a loan.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | POWER_USER | List own loans — `?active=1` `?articleId=` |
| `POST`   | `/` | POWER_USER | Lend an item out (a due date schedules a reminder) |
| `POST`   | `/:id/return` | ✓ | Mark returned (open for cleanup) |
| `DELETE` | `/:id` | ✓ | Delete a loan record (open for cleanup) |

### Insurance — `/api/insurance` (POWER_USER · `insurance`)

Insurance policies (provider, premium, coverage limit, renewal date) covering many articles. A renewal date schedules a reminder. Policy delete + coverage unlink stay open for cleanup.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | POWER_USER | List policies — `?articleId=` scopes to one item's coverage |
| `POST`   | `/` | POWER_USER | Create a policy |
| `PATCH`  | `/:id` | POWER_USER | Update a policy (renewal-date edit reschedules the reminder) |
| `DELETE` | `/:id` | ✓ | Delete a policy (open for cleanup) |
| `POST`   | `/:id/articles` | POWER_USER | Cover an article under this policy |
| `DELETE` | `/:id/articles/:articleId` | ✓ | Stop covering an article (open for cleanup) |

### Maintenance — `/api/service-records` (POWER_USER · `maintenance`)

Append-only service log per item (date, description, cost, provider, optional next-service date → reminder).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/` | POWER_USER | List one article's service log — requires `?articleId=` |
| `GET`    | `/due` | POWER_USER | Services due/overdue across all items (latest per article, 30-day window) |
| `POST`   | `/` | POWER_USER | Log a service entry |
| `DELETE` | `/:id` | ✓ | Delete a record (open for cleanup) |

### Public item page — `/api/public` + `/api/articles/:id/public-link`

Opt-in, read-only public page per article (QR-label target). The owner mints a token (gated `public_page`); the public read is **unauthenticated** and returns only privacy-safe fields — never price, serial, owner, or location.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/api/articles/:id/public-link` | ✓ | Current token (or null) — open so a downgraded user can disable |
| `POST`   | `/api/articles/:id/public-link` | POWER_USER (`public_page`) | Generate/rotate the token |
| `DELETE` | `/api/articles/:id/public-link` | ✓ | Disable the public page (open for cleanup) |
| `GET`    | `/api/public/items/:token` | Public | Privacy-safe item view (no auth — the token is the credential) |

### Profile — `/api/profile`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/me` | ✓ | Current user's profile |
| `PUT`    | `/me/email` | ✓ | Update email (`{ email, currentPassword }`) |
| `PUT`    | `/me/password` | ✓ | Update password (`{ currentPassword, newPassword }`) |
| `PUT`    | `/me/currency` | ✓ | Set display currency (ISO 4217) for inventory-value formatting |
| `PUT`    | `/me/preferences` | ✓ | Update display preferences (`{ theme?, language?, dateFormat? }`) — any combination, `null` clears to device default |
| `PUT`    | `/me/email-reminders` | ✓ | Toggle emailed warranty reminders |
| `PUT`    | `/me/weekly-digest` | ✓ | Toggle the opt-in weekly expirations digest |
| `PUT`    | `/me/budget` | POWER_USER (`budget`) | Set monthly/annual spend budgets (`null` clears) |
| `GET`    | `/me/login-history` | ✓ | Last 50 login/logout events |
| `GET`    | `/me/sessions` | ✓ | Active sessions — `{ items, currentJti }` (use `currentJti` to mark "this device") |
| `DELETE` | `/me/sessions/:id` | ✓ | Revoke a single session (denylists its jti) |
| `POST`   | `/me/sessions/revoke-others` | ✓ | Revoke every session except the caller's own |
| `POST`   | `/me/totp/setup` | ✓ | Password-gated TOTP setup — returns `{ otpauthUrl, qrDataUrl, backupCodes }` (plaintext once only) |
| `POST`   | `/me/totp/verify` | ✓ | Confirm the code, flip `totpEnabled` |
| `DELETE` | `/me/totp` | ✓ | Password-gated — disable TOTP and drop the secret |
| `DELETE` | `/me` | ✓ | Delete account (`{ currentPassword }`) — 204 |

### Billing — `/api/billing`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/upgrade/power-user/checkout` | ✓ | Create Stripe checkout (`{ plan, locale? }`) |
| `POST` | `/portal` | ✓ | Open Stripe billing portal (locale passed through) |
| `POST` | `/cancel/power-user` | POWER_USER | Cancel at period end |
| `GET`  | `/me` | ✓ | Current subscription summary (plan, status, next billing, cancelAtPeriodEnd) |
| `POST` | `/sync` | ✓ | Webhook-independent reconciliation — queries Stripe directly and updates role + subscriptionId. Frontend calls this on return from Checkout. |
| `POST` | `/webhook` | ✗ (Stripe signature) | Webhook receiver (raw body required) |

On every POWER_USER → USER downgrade (webhook cancel, `/sync`, or admin demote), `ShareService.cleanupSharingForUser` runs inside the same transaction: flips public articles back, deactivates outgoing per-user shares, and revokes pending invites.

### Admin — `/api/admin`

All routes require ADMIN.

| Method | Path | Description |
|---|---|---|
| `GET`    | `/db-stats` | DB row counts + recent users/articles |
| `GET`    | `/users` | List all users |
| `POST`   | `/users` | Create a user with any role |
| `PATCH`  | `/users/:id` | Update email and/or role (last-admin protection in a serializable tx) |
| `DELETE` | `/users/:id` | Delete a user (last-admin protection) |
| `GET`    | `/users/:id/inventory` | User's articles + warranties |
| `POST`   | `/users/:id/reset-password` | Force a new password + bump `tokenVersion` |
| `POST`   | `/users/:id/force-logout` | Bump `tokenVersion` so all their JWTs become invalid |
| `GET`    | `/audit-log` | Cursor-paginated audit log (`?userId=`, `?action=`, `?entity=`, `?limit=`, `?cursor=`) |
| `GET`    | `/jobs` | BullMQ queue state (alerts + maintenance) + next audit-prune run |
| `GET`    | `/failed-jobs` | Recent failed jobs across both queues (reason + stacktrace) |
| `GET`    | `/db/export` | Full-database JSON export (backup) |
| `POST`   | `/db/import` | Full-database restore (`confirm: "REPLACE"` + current password; destructive) |

---

## Data model

```
User ─── Article ─── Garantie (warranty) ─── WarrantyHistory (append-only audit)
  │         │              └── Alerte (alert)
  │         ├── Attachment
  │         ├── ArticleNote (kind: SERVICE/WARRANTY_CLAIM/MAINTENANCE/OTHER)
  │         ├── Tag (many-to-many via ArticleTag)
  │         └── Location (many-to-many via ArticleLocation)
  │
  ├── ArticleTransferRequest (PUSH/PULL; status: PENDING/ACCEPTED/REJECTED/REVOKED/EXPIRED)
  ├── ArticleTemplate (JSONB payload with locationNames/tagNames)
  ├── InventoryShare (owner → target, READ|WRITE, active flag)
  ├── ShareInvite (token-based; status: PENDING / ACCEPTED / REVOKED / EXPIRED)
  ├── UserSession (one per device, keyed by JWT jti)
  ├── TotpSecret (base32 secret + bcrypt-hashed backup codes)
  ├── PasswordResetToken (sha256 hash, 30-min TTL)
  ├── SavedView (named article-filter presets)
  ├── CalendarToken (iCal feed capability token)
  └── AuditLog
```

Key flags on User: `role`, `tokenVersion`, `totpEnabled`, `stripeCustomerId`, `stripeSubscriptionId`.

See [`docs/architecture.md`](./docs/architecture.md) for how data moves through
the system, and [`docs/uml/`](./docs/uml/) for the full class diagram.

---

## Running tests

```bash
npm test                                    # all workspaces
npm --workspace apps/api run test:watch     # watch mode
npm --workspace apps/api run test:coverage  # coverage
```

API tests live in `apps/api/src/__tests__/`. Web tests live in `apps/web/src/__tests__/`. Both use [Vitest](https://vitest.dev/). For the three test tiers (unit / integration / e2e) and their setup, see the [Testing section in CONTRIBUTING](./CONTRIBUTING.md#testing).

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`/`dev`
and on every pull request. In-flight runs are cancelled when a newer commit
lands on the same ref (`concurrency` + `cancel-in-progress`).

**`build` job** (the gate):

1. Install dependencies with `npm ci --include=optional` (lockfile-exact; the
   `--include=optional` keeps the platform-specific `@rollup/rollup-*` binary)
2. Lint all workspaces, then a dedicated **prettier format check** (so a
   formatting-only failure gets its own red step instead of hiding in lint)
3. Generate the Prisma client and build the API (`tsc`)
4. **Web typecheck** (`tsc --noEmit`) — Vite's build is transpile-only, so
   this is the only thing that catches type regressions on the web side
5. **Prisma migration drift check** — fails if `schema.prisma` is ahead of the
   `migrations/` folder (model edited without `prisma migrate dev`)
6. API unit tests + coverage gate, then **integration tests** against the
   Postgres service (`--retry=1` to ride out transient flakes)
7. Web tests + coverage, then the web build (`prebuild` generates PWA icons)
8. Upload `apps/web/dist` as an artifact (main/dev only)
9. **`npm audit --omit=dev --audit-level=moderate`** — a moderate+ vuln in a
   *production* dependency fails the build on push (advisory on PRs). Scoped to
   `--omit=dev` because dev-only tooling (vitest/vite) never ships.

**`e2e` job:** Playwright smoke tests. `playwright.config.ts` builds and serves
the static app, so no running API is needed — the suite only exercises API-free
UI (theme, nav, login screen).

**`dependency-review` job** (PRs only): fails on a newly-introduced high-severity
dependency.

**`uml` job:** re-renders `docs/uml/*.svg` from their `.puml` sources and fails
if a committed SVG is stale (gating on push, advisory on PRs).

---

## Deployment (Render)

Two services on Render, both deploying from `dev`:

| Service | URL | Type |
|---|---|---|
| API | `https://wimapi.onrender.com` | Web service (`render-build:api`) |
| Web | `https://wim-web.onrender.com` | Static site (configured via `render.yaml` Blueprint, SPA rewrite included) |

API env vars (Render dashboard, **not in repo**): every Required var above, plus `NODE_ENV=production` and `RENDER_EXTERNAL_URL=https://wimapi.onrender.com`.

Web env var: `VITE_API_BASE_URL=https://wimapi.onrender.com/api`.

> **Free-tier quirks:**
> - Postgres expires after ~30 days. Re-seed admin with the `TestAdmin` button on the login screen (uses `/api/auth/bootstrap-admin`).
> - The API container cold-starts in ~30 s. The web fetch timeout is 45 s to absorb this.
> - File uploads use ephemeral disk. For real production, move them to S3/R2.

The web service is provisioned from `render.yaml` at the repo root (SPA rewrite + headers + asset path). Use **New + → Blueprint** in Render to create or sync.

---

## Security notes

- JWTs are stored in `httpOnly` cookies (`wim_token`), `sameSite=none` in production (web/api are on different Render subdomains and therefore different PSL sites — the cookie must be cross-site to send), `lax` in dev. `secure` is forced on in production.
- Every request reads `tokenVersion` + `role` from the DB in `authGuard` — bumping the version invalidates every JWT for that user, and role changes propagate immediately without re-login.
- CORS is enforced via `CORS_ORIGIN`; production rejects all cross-origin requests if it's unset. In non-production environments (dev/test) an unset `CORS_ORIGIN` falls back to allow-all for convenience — so **production must set it explicitly**.
- **CSRF**: because the auth cookie is `sameSite=none` in production, CORS alone isn't a CSRF defence (it gates the response, not the request). `csrfGuard` additionally requires the `Origin` (or `Referer` fallback) of every cookie-authenticated mutating request to be in the same allowlist. Bearer-token / cookie-less requests are exempt — an attacker page can't forge an `Authorization` header.
- `JWT_SECRET` is required at boot; the API exits otherwise.
- Rate limiting is applied globally (100 req/min by default) via `RATE_LIMIT_*`, with tighter buckets for auth, destructive, and resource-creation routes (see `config/security.ts`).
- File uploads are size-capped (10 MB) and magic-byte validated before being kept on disk.
- The Stripe webhook verifies signatures and uses a `ProcessedStripeEvent` table for idempotency.
- **Dependency pins**: the root `package.json` `overrides` block forces transitive dependencies to patched versions (e.g. `qs` to `6.15.2`) so a vulnerable nested copy can't slip in via `stripe`/`swagger-ui-express`/`supertest`. `npm audit --omit=dev` is expected to report **0 vulnerabilities**; if it doesn't, add or bump an override rather than disabling the CI gate.

---

## Known limitations / roadmap

- [ ] Move file uploads from ephemeral disk to S3-compatible storage (Cloudflare R2 or AWS S3)
- [ ] Add per-user / per-route rate limits on top of the global one
- [ ] Expand test coverage to route-level integration tests
- [ ] Add a data-caching layer (TanStack Query) on the web client to reduce duplicate fetches across routes
- [ ] Replace the temporary `/auth/bootstrap-admin` with a proper one-time seed flow once the production DB is stable
- [ ] Consolidate the two sharing models (public flag + per-user InventoryShare) into a single “Share article…” dialog with options — deferred by design today
