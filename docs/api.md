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
# 1. Log in — save the JWT from the Set-Cookie header
TOKEN=$(curl -si -X POST https://wimapi.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"secret"}' \
  | grep -i set-cookie | sed 's/.*wim_token=//;s/;.*//')

# 2. Use it as a Bearer token on subsequent requests
curl https://wimapi.onrender.com/api/articles \
  -H "Authorization: Bearer $TOKEN"
```

## Pagination

Paginated list endpoints accept `page` (1-based) and `limit` (capped per
endpoint) query parameters and return `{ items, total, page, limit }`. The
`total` is always the total count for the current filter, not just the page.

The admin audit-log uses cursor pagination instead: pass `cursor=<lastId>` to
get the next page of `limit` entries (default 100, max 200) newest-first.

## Conventions

- Date / datetime fields are ISO strings.
- **Paginated list endpoints** return `{ items, total, page, limit }` —
  e.g. `GET /api/articles`, `GET /api/locations:id/articles`. Notable
  exception: `GET /api/admin/users` accepts `page`/`limit` (max 500) but
  returns a **raw array** without a total count — it's behind ADMIN and
  the user list is expected to stay small.
- Errors come back as `{ "error": "human message" }` with a numeric status
  code. Zod validation errors also include an `issues` array (path + code;
  messages are stripped in production so schema shape isn't leaked).
- `purchasePrice` and `depreciationRate` on articles, and `Decimal` fields
  elsewhere, are serialised as **strings** in JSON (Prisma Decimal →
  string). Parse with `Number()` or your language's decimal library before
  doing arithmetic.

## Attachment download

Attachments are **not** served by `express.static`. Instead:

- `GET /uploads/:storedName` — requires auth (the same JWT cookie / Bearer
  token). Applies share-aware access rules: the owner, or any viewer who
  has an active `InventoryShare` or can see a publicly-shared article.
  Returns the file inline with the stored MIME type; thumbnails (`.webp`)
  return `image/webp` regardless of the source format.
- `GET /api/attachments` / `GET /api/attachments/:id` — JSON metadata only
  (no bytes). The `fileUrl` in the response is the `/uploads/:storedName`
  path to fetch above.

Sharing an article (public or per-user) automatically extends download
access to the article's attachments. There is no separate attachment-level
ACL.

## Warranties

A warranty (`Garantie`) is 1:1 with an article (unique constraint on
`garantieArticleId`). Key non-obvious rules:

- **Renewal** (`POST /api/warranties/:id/renew`) replaces the live row
  in place (same `garantieId`) and snapshots the prior dates/duration into
  `WarrantyHistory`. The article link, attachments, and alerts stay.
- **Extend** (`POST /api/warranties/:id/extend`) rolls `garantieFin` forward
  by N months without changing the purchase date. `garantieDuration` is
  bumped to keep `garantieFin = addMonths(garantieDateAchat, duration)`.
- Both renew + extend reschedule the J-30/J-7/J-1 reminder alerts.
- `GET /api/warranties/:id/history` returns the change chain newest-first.

Claim workflow: `claimStatus` starts at `NONE` and progresses through
`OPEN → APPROVED | REJECTED → RESOLVED`. Patching back to `NONE` resets
`claimNote` and `claimUpdatedAt`. A warranty with an open claim can still be
renewed or extended.

## Sharing

Sharing requires `POWER_USER` or `ADMIN` role on **both** parties.

- **Public share** (`POST /api/articles/:id/share-public`): flips
  `Article.sharedWithPowerUsers = true`. Visible read-only to all
  share-capable users at `GET /api/shared/articles`.
- **Per-user share**: owner sends invite to a recipient's email via
  `POST /api/shares` (creates `ShareInvite`). Recipient accepts via
  `POST /api/shares/accept` (creates `InventoryShare`). Grants READ or
  WRITE access to the owner's entire inventory.
- Downgrading a user from share-capable to USER (Stripe cancel, admin
  demote) automatically revokes all outgoing shares, pending invites, and
  pending transfer requests in the same transaction as the role change.

## Transfers

Article ownership transfer between two POWER_USER / ADMIN accounts:

- **PUSH**: owner initiates (`POST /api/articles/:id/transfer/push`) —
  recipient must accept from their `/transfers` page.
- **PULL**: requester who can see the article initiates
  (`POST /api/articles/:id/transfer/pull`) — owner must accept or reject.
- Acceptance is fully atomic (Prisma tx): `ownerUserId` updated;
  `sharedWithPowerUsers` reset; `Garantie`, `Attachment`, `Alerte`,
  `ArticleNote` re-owned; `ArticleLocation` + `ArticleTag` junctions deleted
  (owner-scoped; new owner reassigns). All other PENDING requests for the
  same article are revoked.
- Token TTL: 7 days. Status lifecycle:
  `PENDING → ACCEPTED | REJECTED | REVOKED | EXPIRED`.

## Account security

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/profile/me/login-history`               | Caller's last 50 `LOGIN/LOGOUT` rows from `AuditLog`. No schema; uses the existing `(userId, createdAt DESC)` index.    |
| GET    | `/api/profile/me/sessions`                    | `{ items, currentJti }` — current device marked client-side from `currentJti`.                                         |
| DELETE | `/api/profile/me/sessions:id`                | Revoke a single session: `denyToken(jti, ttl)` + stamp `revokedAt`.                                                    |
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
root has the canonical setup notes.

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
