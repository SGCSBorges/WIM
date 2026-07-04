# WIM API documentation

The **canonical, machine-readable** reference is Swagger UI — it's hand-built
from the same Zod schemas the API validates against, so endpoint shapes stay in
sync with what the server accepts:

- **Swagger UI**: [`/api/docs`](https://wimapi.onrender.com/api/docs)
- **OpenAPI 3.1 JSON**: [`/api/openapi.json`](https://wimapi.onrender.com/api/openapi.json)

This file covers the bits Swagger can't easily explain — auth model,
deployment quirks, and a triage section for the common confusions.

## Authentication

The API authenticates with a **JWT**, accepted either as an `httpOnly`
`wim_token` cookie (the web app) **or** an `Authorization: Bearer <jwt>`
header (API clients). The auth middleware reads the cookie first and falls
back to the header, so both work:

- **Browsers (the web app)**: just `fetch(..., { credentials: "include" })`
  — the cookie rides every request automatically. No client-side token
  handling. The web app's `services/api.ts` does this for you.
- **External tools (curl, Postman)**: log in, then either replay the
  captured `Set-Cookie` on subsequent requests, **or** lift the JWT value
  from that cookie and send it as `Authorization: Bearer <jwt>`. Login is
  the only way to mint a token; there is no separate API-key flow.

The cookie carries a JWT with `sub` (userId), `role`, `jti` (unique id for
the Redis denylist), and `v` (per-user `tokenVersion`). On every protected
request the API:

1. Verifies the JWT signature.
2. Checks the Redis denylist (`jti` revoked? → 401).
3. Re-reads `tokenVersion` + `role` from the DB. Bumping `tokenVersion`
   invalidates every token issued before the bump (used by logout,
   password reset, admin force-logout). Updating `role` propagates
   immediately without re-login.

### CSRF

Mutating requests (POST/PUT/PATCH/DELETE) **that carry the `wim_token`
cookie** also require an `Origin` or `Referer` header matching an allowed
origin (`CORS_ORIGIN` env). Browsers attach both automatically; cross-origin
scripts can't forge them. This check is **skipped for pure Bearer-token
clients** (no cookie present) — an attacker page can't forge an
`Authorization` header, so those requests bear no CSRF risk and don't need
an `Origin` header.

### Quick smoke (curl)

```bash
# Log in — captures the wim_token cookie into a jar.
curl -i -c jar.txt -b jar.txt -X POST https://wimapi.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://wim-web.onrender.com' \
  -d '{"email":"you@example.com","password":"yourpass"}'

# Use the cookie jar on subsequent calls.
curl -b jar.txt https://wimapi.onrender.com/api/auth/me
```

## Conventions

- All IDs are positive integers.
- Endpoints return JSON unless noted (PDFs and the CSV export return their
  native content-type with `Content-Disposition: attachment`).
- Date / datetime fields are ISO strings.
- **Paginated list endpoints** return `{ items, total, page, limit }` —
  e.g. `GET /api/articles`, `GET /api/locations/:id/articles`. Notable
  exception: `GET /api/admin/users` accepts `page`/`limit` (max 500) but
  returns a **raw array** without a total count — it's behind ADMIN and
  the user list is expected to stay small.
- Errors come back as `{ "error": "human message" }` with a numeric status
  code. 5xx responses also include `requestId` so support can quote it.
- **`401` means the session is invalid** (missing/expired/revoked token) and
  is the only status the web client treats as "log out and bounce to the
  login screen." A failed step-up check on an *already-authenticated* request
  — e.g. a wrong current password when changing email/password, deleting the
  account, or managing 2FA — returns **`403`** (and a bad TOTP code returns
  `400`), so a mistyped confirmation surfaces inline instead of silently
  ending the session.

## Attachments and `/uploads/*`

This is the most-asked-about gotcha:

- `/api/attachments/*` → JSON metadata. **Cookie required.**
- `/uploads/<filename>` → the raw file, served as static content.
  **Public** — anyone with the URL can download it.

The UI uses `attachment.fileUrl` (which points at `/uploads/…`) to render
images or trigger downloads — never `/api/attachments/:id`, because
navigating that in a tab doesn't send the cookie and you'll see a 401.

**Client-side image compression.** Before an upload leaves the browser,
`utils/imageCompress.ts` downscales large raster photos (jpeg/png/webp over
~300 KB) to a ≤1600px JPEG via a canvas — cutting transfer + storage and
dodging the API's 10 MB reject. It's a no-op for PDFs/SVG/GIF, small files, or
when the canvas path is unavailable, and only replaces the original when the
re-encode is genuinely smaller, so it can never block an upload. The server
still runs its own magic-byte check + sharp thumbnailing on whatever arrives.

## User preferences

The `User` row carries display preferences so they follow the user across
devices:

| Field        | Type / values                                              | Endpoint                                                          |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `currency`   | ISO 4217 alpha-3 (default `USD`)                           | `PUT /api/profile/me/currency` — `{ "currency": "EUR" }`          |
| `theme`      | `light \| dark \| ocean \| cyber \| sunset` (nullable)     | `PUT /api/profile/me/preferences` — `{ "theme": "ocean" }`        |
| `language`   | `en \| fr \| pt \| es \| nl` (nullable)                    | `PUT /api/profile/me/preferences` — `{ "language": "fr" }`        |
| `dateFormat` | `system \| dd/MM/yyyy \| MM/dd/yyyy \| yyyy-MM-dd` (nullable) | `PUT /api/profile/me/preferences` — `{ "dateFormat": "yyyy-MM-dd" }` |

`/api/profile/me/preferences` accepts a partial body — any combination of
the three fields, plus `null` to clear one back to "follow the device
default". Empty bodies are rejected. Both `/api/auth/me` and
`/api/profile/me` return these fields on read, so the SPA can hydrate the
right theme/language/date format before the first render.

UI density (`comfortable \| compact`) is intentionally **not** persisted
server-side — it's a cosmetic per-device choice and lives in
`localStorage["wim.density"]` only.

Adjacent profile endpoints: `PUT /api/profile/me/reminder-days` (custom
warranty reminder offsets — see Warranty lifecycle), `GET
/api/profile/me/export` (full personal data export, one JSON document,
ungated + rate-limited + audited `DB_EXPORT`), and the soft email
verification pair `POST /api/auth/verify-email` (open; consumes the mailed
token) / `POST /api/auth/verify-email/request` (authed re-send). Nothing
hard-gates on a verified address — email transport is optional — the
Profile page just shows the state.

## Notifications

Two endpoints back the TopBar bell:

- `GET /api/alerts/notifications` →
  `{ items: AlertItem[], unseen: number }`. `items` is the caller's
  scheduled alerts (warranty + custom) that are overdue or due within the
  next 30 days, soonest first, capped at 20. `unseen` counts those created
  after `User.alertsSeenAt`; null means everything is unseen.
- `POST /api/alerts/mark-seen` → 204. Stamps `User.alertsSeenAt = now()`
  to clear the unseen badge. Not audit-logged (it's per-device noise).

Snooze and cancel are unchanged: `POST /api/alerts/:id/snooze` with
`{ days }` and `POST /api/alerts/:id/cancel`.

## Warranty lifecycle

`Garantie` keeps a 1:1 unique with the article, so renewal rolls the live
row forward (same `garantieId`) and snapshots the prior state into
`WarrantyHistory`. There is **never** a second warranty per article.

| Method | Path                              | Body                                                                | Effect                                                                                       |
| ------ | --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| POST   | `/api/warranties/:id/renew`       | `{ garantieDateAchat, garantieDuration, provider*?, note? }`        | Snapshot `RENEWED`, swap purchase date + duration, recompute `garantieFin`, reschedule alerts |
| POST   | `/api/warranties/:id/extend`      | `{ months, note? }`                                                  | Snapshot `EXTENDED`, bump `garantieDuration`, roll `garantieFin` forward, reschedule alerts   |
| GET    | `/api/warranties/:id/history`     | —                                                                    | Owner-scoped chronological audit (`event`, `priorDateAchat/Duration/Fin`, `note`)             |

`Garantie.renewedAt` is stamped on the first renewal/extension (null =
never renewed). Both `renew` and `extend` reuse
`AlertService.rescheduleForWarranty` so the reminders re-fire against the
new end date. Reminder offsets default to J-30/J-7/J-1 and are
user-configurable via `PUT /api/profile/me/reminder-days`
(`{ days: [90,30,7] }`, 1–5 values of 1–365; `null` resets the default) —
saving re-arms every live warranty. Audit actions `WARRANTY_RENEW` /
`WARRANTY_EXTEND` are in the `AUDIT_ACTIONS` union.

## Reports

- `GET /api/reports/portfolio.pdf` — insurance-ready portfolio PDF.
  Query params honor the article-list filters (`locationId`, `tagId`,
  `warrantyStatus`) so a user can scope the report to one room or one
  tag. Three sections: cover totals (purchase vs depreciated current
  value, items covered vs at-risk), per-location manifest with
  serials + warranty end, and an at-risk list ranked by purchase
  value desc. Auth-gated + destructive-rate-limited; audited as
  `DB_EXPORT` with `metadata.report="portfolio"`.

The inventory CSV (`/api/articles/export/inventory.csv`) gains a
`currentValue` column at export time (computed via the same
`currentValue` helper the dashboard + claim PDF use). The importer
ignores unknown columns so a round-trip preserves data.

## Article ownership transfer

Permanent, atomic transfer of an article and all related data between two share-capable accounts. Requires POWER_USER (or ADMIN, which inherits). See `CLAUDE.md` for the full lifecycle.

**Initiation** (mounted on `/api/articles`):

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| POST   | `/:id/transfer/push` | `{ email, message? }` | Offer article to the recipient; fires an email with the token |
| POST   | `/:id/transfer/pull` | `{ message? }` | Request ownership of a visible article; fires an email to the owner |

**Management** (also mounted on `/api/articles`):

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/transfers/incoming` | Pending transfers waiting on the caller to act |
| GET    | `/transfers/outgoing` | Transfers the caller initiated (full history) |
| POST   | `/transfers/:token/accept` | Accept — PUSH: recipient; PULL: owner |
| POST   | `/transfers/:token/reject` | Reject — PULL: owner rejects |
| DELETE | `/transfers/:id` | Revoke — PUSH: owner cancels; PULL: requester cancels |

On **accept**, a single transaction re-owns the article, its warranty + warranty history, alerts, attachments, and notes. `ArticleLocation` + `ArticleTag` rows are deleted (owner-scoped; new owner re-assigns from their own lists). All other PENDING transfers for the same article are REVOKED atomically.

Status lifecycle: `PENDING → ACCEPTED | REJECTED | REVOKED | EXPIRED` (7-day window). Concurrent accepts are race-safe: `updateMany` with `status:"PENDING"` in both the transfer row and the expiry check means only one commit can win; the loser gets 409.

## Secure messaging

A 1:1 negotiation chat pinned to a single shared article — the lead-in to a transfer. A POWER_USER who can see a shared item (the public `sharedWithPowerUsers` flag **or** an active `InventoryShare`) opens a thread with the owner; both parties append messages. Gated by the `messaging` feature flag (POWER_USER by default). Mounted on `/api/messages`.

Security is app-level, not end-to-end: every read/write is authenticated (cookie), CSRF-protected, and **authorized to the thread's two fixed participants** — the article owner at creation time and the requester. Opening a thread re-checks article visibility (same rule as a PULL transfer), so article ids can't be enumerated and owners can't be spammed by strangers. Bodies are capped at 2000 chars.

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| GET    | `/messages/unread-count` | — | `{ count }` of threads with unread activity (drives the nav badge; `authGuard` only) |
| GET    | `/messages/threads` | — | Inbox: every thread the caller participates in, newest activity first |
| POST   | `/messages/threads` | `{ articleId, body }` | Open (or append to) the thread for `(article, requester)` and post a message; emails the owner |
| GET    | `/messages/threads/:id` | — | Full conversation (oldest first); clears the caller's unread flag |
| POST   | `/messages/threads/:id/messages` | `{ body }` | Reply; emails the other party **only when they were caught up** (no piled-on pings) |
| POST   | `/messages/threads/:id/offer` | `{ amount }` | Requester proposes a purchase price (an `OFFER` message); emails the owner |
| POST   | `/messages/offers/:messageId/accept` | — | Owner accepts a pending offer → fires a PUSH transfer of the item to the requester (who completes it on `/transfers`); marks the offer `ACCEPTED` |
| POST   | `/messages/offers/:messageId/decline` | — | Owner declines a pending offer (`DECLINED`) |

There is exactly one thread per `(articleId, requesterId)` (unique constraint) — re-messaging the same item just continues the conversation. Unread is tracked as a boolean per side; posting flips the recipient's flag on and the sender's off, and opening the thread clears the viewer's. `ownerUserId` is a snapshot taken at creation, so a later ownership transfer leaves the original conversation intact for both original parties.

A `Message` is either `TEXT` or a structured `OFFER` (carrying `offerAmount` + an `offerStatus` of `PENDING | ACCEPTED | DECLINED | WITHDRAWN`). Only the requester side may make offers; only the owner resolves them. Accepting reuses `TransferService.createPush` (so no new ownership-move path) and only marks the offer `ACCEPTED` **after** the transfer is created, keeping the two consistent if `createPush` rejects (e.g. a pending push already exists → 409).

## Account security

Three slices in `apps/api/src/modules/{auth,profile}/`. The password-only
login path is byte-for-byte unchanged when `User.totpEnabled` is false.

| Method | Path                                          | Notes                                                                                                                  |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/profile/me/login-history`               | Caller's last 50 `LOGIN/LOGOUT` rows from `AuditLog`. No schema; uses the existing `(userId, createdAt DESC)` index.    |
| GET    | `/api/profile/me/sessions`                    | `{ items, currentJti }` — current device marked client-side from `currentJti`.                                         |
| DELETE | `/api/profile/me/sessions/:id`                | Revoke a single session: `denyToken(jti, ttl)` + stamp `revokedAt`.                                                    |
| POST   | `/api/profile/me/sessions/revoke-others`      | Revokes every active session except the caller's own jti.                                                              |
| POST   | `/api/profile/me/totp/setup`                  | Password-gated. Returns `{ otpauthUrl, qrDataUrl, backupCodes }` — backup codes plaintext **once**, never stored.       |
| POST   | `/api/profile/me/totp/verify`                 | Password + code; flips `TotpSecret.verified` + `User.totpEnabled` in one transaction.                                  |
| DELETE | `/api/profile/me/totp`                        | Password-gated. Drops the secret row + clears `totpEnabled`.                                                           |
| POST   | `/api/auth/login`                             | When `totpEnabled`, returns `{ totpRequired: true, challengeToken }` (5-minute `kind:"totp-challenge"` JWT — not a session cookie). |
| POST   | `/api/auth/login/verify-totp`                 | `{ challengeToken, code }` → real session cookie + `UserSession` row; audit `metadata.method="totp"`.                  |

TOTP uses `otplib@^12` (v13 dropped the named `authenticator` export). New
tables: `UserSession` (jti unique, deviceLabel, ip, userAgent, lastActiveAt,
revokedAt) and `TotpSecret` (one-per-user, base32 secret, JSON of bcrypt-
hashed single-use backup codes, verified). `authGuard` calls
`SessionService.touch(jti)` best-effort (throttled to 1/min per jti) so
"active N minutes ago" stays honest without a DB hit per request.

Changing the account email (`PUT /api/profile/me/email`) or the password
(`PUT /api/profile/me/password`) bumps `tokenVersion` — every other
session is invalidated, and the calling device gets a fresh cookie in the
same response. An admin changing a user's email via
`PATCH /api/admin/users/:id` invalidates that user's sessions the same way.

## Passkeys (WebAuthn)

Free-standing standard — no external service. Enrollment and sign-in are
two-step: an `options` call returns WebAuthn options plus a **5-minute
signed challenge token** (same pattern as the TOTP login challenge; `kind`
discriminates registration from authentication), and a `verify` call checks
the authenticator's response against it. Registered credentials live in
`WebAuthnCredential` (unique `credentialId`, COSE public key, signature
counter updated on every assertion). A successful passkey sign-in mints a
full session **even for TOTP-enabled accounts** — the assertion is
phishing-resistant possession + user-verification proof. Enumeration
safety: `login/options` returns valid-looking options with an empty
credential list for unknown emails, and `login/verify` answers every
failure mode with the same 401.

## Article power features

- `POST /api/articles/bulk-update` —
  `{ ids: number[], fields: { purchasePrice?, depreciationRate?, brand?, serialNumber? } }`.
  `null` clears, missing keys leave alone. Per-row ownership + trashed-row
  skip in a single transaction. Counterpart to the existing
  `/articles/bulk-assign` but for scalar fields.
- `GET|POST|PUT|DELETE /api/article-templates[/:id]` — reusable starting
  points for the create form. JSONB `payload` stores locations and tags
  by **name**, not by id, so a template survives a rename or a live row
  delete; the form resolves names → ids at apply time.
- **Inventory check** — `POST /api/articles/:id/verify` stamps
  `lastVerifiedAt` ("I still hold this item"); `POST /api/articles/bulk-verify`
  does the same for a selection (ungated, like bulk-assign — it's a core
  inventory action). Both are atomic `updateMany` calls with the ownership
  precondition in the WHERE clause. The list endpoint accepts
  `?verification=needed|verified` (needed = never verified or >12 months ago —
  the same rule behind the dashboard's `articles.needsVerification` count),
  and the CSV export carries a read-only `lastVerifiedAt` column.
- **Favorites** — `Article.isFavorite` (bool). `POST /api/articles/:id/favorite
  { favorite }` pins/unpins; the list accepts `?favorite=1`. A star toggle
  appears on the detail page and list rows.
- **Agenda** — `GET /api/calendar/agenda` returns a JSON list of upcoming and
  overdue events (warranty expirations, maintenance due, loan returns,
  insurance renewals, scheduled alerts) aggregated server-side, sorted by
  date. Reuses the same scoping as the ICS feed but is a plain authenticated
  read (not gated on `calendar_feed`), since it only surfaces signals the free
  dashboard already shows.
- **Quantity** — `Article.quantity` (int, default 1) lets one record stand for
  several identical units. `purchasePrice` is the **per-unit** price, so every
  value figure across the app (dashboard, per-location/tag, analytics, budget,
  household, and the portfolio + claim PDFs) is `price × quantity`; item
  **counts** stay per-record. Written through the normal create/update
  endpoints, copied by duplicate, and round-tripped through the CSV
  export/import `quantity` column.
- **Custom fields** — `Article.customFields` is an ordered JSONB array of
  `{ key, value }` pairs (≤20; key ≤40 chars, value ≤500), written through the
  normal create/update endpoints (`null` clears). Private like
  `purchasedFrom`/`orderRef` — the shared-view select never includes it. The
  CSV export writes the array as a JSON cell and the importer parses it back,
  so the round-trip preserves the fields (a malformed cell fails that row in
  the dry-run report instead of silently dropping data).

## Feature gating

Admins control which **role** each named feature requires, overriding the
hardcoded defaults. POWER_USER is the paywall — gating a feature at
POWER_USER means "paid"; ADMIN inherits everything via the role hierarchy.
By default every feature except `cmd_palette` (USER — global search ships
open to everyone) requires POWER_USER, so the rest of the feature set is
paid out of the box; an admin can lower a specific bar to USER, or raise
any bar to ADMIN.

- `GET /api/features` — the caller's `{ [featureKey]: boolean }` access map.
  The web app fetches this once and re-fetches after login / logout / a
  Stripe role change. Keys: `cmd_palette`, `sharing`, `transfers`,
  `messaging`, `reports`, `analytics`, `templates`, `bulk_edit`,
  `saved_views`, `notifications`, `calendar_feed`, `csv_import`,
  `csv_export`, `insurance`, `loans`, `maintenance`, `budget`,
  `public_page`, `wishlist`, `household`.
- `GET /api/admin/features` — current flag overrides + active temp grants.
- `PUT /api/admin/features/:key` — `{ requiredRole }` sets the minimum role
  for a feature (absent row = coded default).
- `POST /api/admin/features/grants` — `{ featureKey, expiresAt, note? }`
  time-bounds a USER's access to a **POWER_USER**-gated feature (rejected
  for any key whose effective role isn't POWER_USER). `DELETE
  /api/admin/features/grants/:id` revokes one.

Server-side, `requireFeature(key)` gates each toggleable feature's route(s)
after `authGuard`; a denied call returns **403**. A 60-second snapshot cache
backs both `GET /api/features` and the middleware via one shared `isAllowed`
helper, so the client map and the server gate can never disagree. Admin
writes invalidate the cache immediately. The cleanup actions that must stay
reachable when a feature is later restricted — transfer **reject/revoke**,
the calendar feed **DELETE** + public ICS read, loan **return/delete**,
insurance **policy-delete/unlink**, service-record **delete**, wishlist
**purchased-toggle/delete**, household **GET/leave/remove-member/**
**revoke-invite**, and the public-link **GET/DELETE** — deliberately stay
on `authGuard` only. The unauthenticated public item read
(`GET /api/public/items/:token`) is never gated at all.

## Wishlist

Planned purchases, gated on the `wishlist` feature. `GET /api/wishlist`
lists (open wishes first, purchased history after), `POST` adds, `PUT /:id`
edits. `POST /:id/purchased` `{ purchased }` stamps/clears `purchasedAt` —
bought items are kept (struck through in the UI) rather than deleted — and
`DELETE /:id` removes; both stay ungated as cleanup paths. The web view
shows a budget-fit hint when the `budget` feature is on and a monthly
budget is set (open wishes total vs. what's left of the month's budget).

## Household accounts

A household is a small group (max 6) of share-capable users whose
inventories are mutually visible and editable. Implementation: an
auto-managed **mesh of WRITE `InventoryShare` rows** — each member pair
gets a row in both directions, tagged `viaHouseholdId` — so every existing
sharing surface (the shared view, WRITE edits via
`PUT /api/shared/articles/:id`, transfer PULL visibility) works on
household inventories unchanged, and the same privacy boundary applies
(serials, prices, provider/claim details never cross).

- `GET /api/household` — the caller's household (or `{ household: null }`),
  with members and — for the OWNER — pending invites. Open (a downgraded
  member can still see + leave).
- `POST /api/household` `{ name }` — create; caller becomes OWNER (gated).
- `POST /api/household/invites` `{ email }` — OWNER invites an existing
  Power User; enumeration-safe errors, one pending invite per email, 7-day
  token emailed best-effort (gated).
- `POST /api/household/invites/accept` `{ token }` — join; single-use
  atomic claim, builds the mesh with every current member (gated).
- `DELETE /api/household/invites/:id`, `POST /api/household/leave`,
  `DELETE /api/household/members/:userId` — cleanup paths, ungated.

Leaving (or being removed, or being demoted from POWER_USER) tears down
only the mesh rows tagged with the household — a manual share created
after teardown is untouched; one that existed *before* joining is absorbed
into the mesh and deactivates with it. The last member's departure deletes
the household; an OWNER's departure promotes the oldest remaining member.
Role downgrade exits the household inside the same transaction as the role
change (`ShareService.cleanupSharingForUser`).

## Lost & found (public)

When the owner sets an article's status to LOST, its public QR page
(`GET /api/public/items/:token`) carries `isLost: true` and accepts
`POST /api/public/items/:token/found-report` `{ message, contact? }` —
unauthenticated (the token is the credential), destructive-rate-limited,
deduped to one recorded report per article per hour. The report lands as a
notification-bell entry for the owner plus best-effort push/email; finder
and owner stay mutually anonymous.

## Database backup / restore (ADMIN)

Two destructive-rate-limited, ADMIN-only endpoints for full-DB migration
between environments.

### `GET /api/admin/db/export`

Downloads the entire database as a single JSON document (`wim-backup-<timestamp>.json`).
The dump includes all user data tables (users, articles, warranties, tags,
notes, templates, locations, attachments, alerts, saved views, shares,
transfers, TOTP secrets, feature flags, audit logs, and processed Stripe
events). Intentionally excluded: `UserSession` (device-specific — fresh login
on the target deployment is safer), `PasswordResetToken` (ephemeral), and
`PushSubscription` (device-registered endpoint URLs don't survive a server
origin change).

Audited as `DB_EXPORT`. The dump's `version` field gates compatibility on
import.

### `POST /api/admin/db/import`

**Irreversible**. Truncates every table and restores from the JSON dump in a
single transaction. Required body:

```json
{
  "confirm": "REPLACE",
  "currentPassword": "<admin password>",
  "payload": { /* dump from /api/admin/db/export */ },
  "keepStripeIds": false
}
```

- `confirm: "REPLACE"` — required literal, defence against accidental overwrite.
- `currentPassword` — re-prompts for the admin's password so a stolen (but
  still-valid) session cookie can't trigger a full-DB rewrite.
- `keepStripeIds` — defaults `false`. Set `true` only when migrating within
  the **same** Stripe environment; importing a production dump into a staging
  environment with `keepStripeIds=true` would misdirect future webhooks to the
  wrong Stripe customer.
- The `payload.version` must match the server's current export format
  (currently **v2**); a version mismatch is refused before touching the DB.
  If you have a v1 dump (from before this format version was introduced), you
  cannot import it directly — re-export from a v1 deployment first.
- Dumps that contain no ADMIN user are refused (lockout prevention).
- The response includes `sessionInvalidated: true` — the calling admin's
  cookie is no longer valid after import because the User table was replaced.
  Log back in.
- Body size limit: 100 MB (the per-endpoint parser overrides the global 1 MB
  cap).

Audited as `DB_IMPORT` twice: once immediately before the truncate (forensic
trail if the import crashes mid-write) and once after successful restore.

> **Use with extreme caution in production.** There is no roll-back after a
> successful import — if your dump is corrupt or from the wrong environment,
> you must restore from a Render Postgres backup.

## Background jobs

The API runs BullMQ workers in the same process. Three repeatable schedules
run automatically (see `apps/api/src/jobs/workers.ts`):

| Job                  | Cron (UTC)    | What it does                                  |
| -------------------- | ------------- | --------------------------------------------- |
| `audit-prune-daily`  | `0 3 * * *`   | Trim AuditLog rows older than the retention   |
| `article-trash-purge`| `30 3 * * *`  | Hard-delete trashed articles past retention   |
| `warranty-digest`    | `0 9 * * 1`   | Email opt-in users their upcoming expirations |

Each is opt-out via its env var (`AUDIT_RETENTION_DAYS=0`,
`ARTICLE_TRASH_RETENTION_DAYS=0`, `WARRANTY_DIGEST_ENABLED=false`).
Admin Jobs tab (`/admin/jobs`) surfaces live queue depth + recent failures.

## Deployment

- **API**: `wimapi.onrender.com` — `apps/api`. Node 22 service; redeploys on
  push to `dev`. Render free-tier Postgres cold-starts in ~30 s — the web
  client's fetch timeout is 45 s for that reason. Render free Postgres
  also expires after ~30 days; after a wipe, re-promote admin via
  `/api/auth/bootstrap-admin` (temporary endpoint).
- **Web**: `wim-web.onrender.com` — `apps/web`. Static site built from
  `apps/web/dist`. SPA-rewrite lives in the repo's `render.yaml`.

The full env catalog lives in `apps/api/.env.example`; CLAUDE.md at the
repo root has the canonical setup notes.

## Triage

### "Unauthorized" when calling from curl/Postman

Both `Authorization: Bearer <jwt>` and the `wim_token` cookie are accepted,
so check the token itself: it must be a JWT minted by `POST /api/auth/login`
(not expired, not revoked) and sent verbatim. A common slip is sending the
literal cookie string (`wim_token=…`) as the Bearer value instead of just
the JWT. If you'd rather use the cookie, capture the `Set-Cookie` from login
and replay it — see the smoke example above.

### "Token manquant" / 401 opening an attachment URL

You navigated to `/api/attachments/<id>` in a browser tab. Use the
`fileUrl` field (`/uploads/<filename>`) — that one is public static
content. The UI does this automatically.

### Mixed-content errors on attachment download

A legacy row has an HTTP `fileUrl` (e.g. `http://wimapi.onrender.com/uploads/…`).
The web client already normalises `/uploads/…` paths to the API's HTTPS
host at render time — but if the stored value is a different host, fix the
DB row.

### Delete-account returned 500 but the user is gone

Historical issue. The current implementation runs the cascading deletes
inside a transaction; if anything throws the row stays. The web client
also treats a follow-up 404 from `/profile/me` as "account already gone"
and disconnects cleanly (round-11 status-based redirect, B3).

### Webhook duplicate deliveries

Stripe re-delivers if your endpoint doesn't ACK within ~10 s — Render
free-tier cold starts often exceed that. The webhook handler is idempotent
(a unique constraint on `ProcessedStripeEvent.eventId`), so safe to retry,
and the `POST /api/billing/sync` fallback the web app calls on return from
Checkout means a temporarily-undelivered webhook doesn't strand the user.
