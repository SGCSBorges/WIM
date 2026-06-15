# WIM API documentation

The **canonical, machine-readable** reference is Swagger UI — it's generated
from the same Zod schemas the API validates against, so it never drifts:

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

## Attachments and `/uploads/*`

This is the most-asked-about gotcha:

- `/api/attachments/*` → JSON metadata. **Cookie required.**
- `/uploads/<filename>` → the raw file, served as static content.
  **Public** — anyone with the URL can download it.

The UI uses `attachment.fileUrl` (which points at `/uploads/…`) to render
images or trigger downloads — never `/api/attachments/:id`, because
navigating that in a tab doesn't send the cookie and you'll see a 401.

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
`AlertService.rescheduleForWarranty` so the J-30/J-7/J-1 reminders
re-fire against the new end date. Audit actions `WARRANTY_RENEW` /
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

## Feature gating

Admins control which **role** each named feature requires, overriding the
hardcoded defaults. POWER_USER is the paywall — gating a feature at
POWER_USER means "paid"; ADMIN inherits everything via the role hierarchy.

- `GET /api/features` — the caller's `{ [featureKey]: boolean }` access map.
  The web app fetches this once and re-fetches after login / logout / a
  Stripe role change. Keys: `cmd_palette`, `sharing`, `transfers`,
  `reports`, `templates`, `bulk_edit`, `saved_views`, `notifications`,
  `calendar_feed`, `csv_import`, `csv_export`.
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
reachable when a feature is later restricted — transfer **reject/revoke**
and the calendar feed **DELETE** + public ICS read — deliberately stay on
`authGuard` only.

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
