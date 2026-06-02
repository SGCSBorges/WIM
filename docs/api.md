# WIM API documentation

The **canonical, machine-readable** reference is Swagger UI — it's generated
from the same Zod schemas the API validates against, so it never drifts:

- **Swagger UI**: [`/api/docs`](https://wimapi.onrender.com/api/docs)
- **OpenAPI 3.1 JSON**: [`/api/openapi.json`](https://wimapi.onrender.com/api/openapi.json)

This file covers the bits Swagger can't easily explain — auth model,
deployment quirks, and a triage section for the common confusions.

## Authentication

The API uses **JWT in an `httpOnly` cookie**, not `Authorization: Bearer`.
That's important to understand because it dictates how a client must call
the API:

- **Browsers (the web app)**: just `fetch(..., { credentials: "include" })`
  — the cookie rides every request automatically. No client-side token
  handling. The web app's `services/api.ts` does this for you.
- **External tools (curl, Postman)**: log in, capture the `Set-Cookie`,
  replay it on subsequent requests. There is **no** Bearer-token mode.

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

Mutating requests (POST/PUT/PATCH/DELETE) also require an `Origin` or
`Referer` header matching an allowed origin (`CORS_ORIGIN` env). Browsers
attach both automatically; cross-origin scripts can't forge them.

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
  exception: `GET /api/admin/users` returns a raw array (no pagination —
  it's behind ADMIN and the user list is small).
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
| `theme`      | `light \| dark \| ocean \| cyber` (nullable)               | `PUT /api/profile/me/preferences` — `{ "theme": "ocean" }`        |
| `language`   | `en \| fr \| pt` (nullable)                                | `PUT /api/profile/me/preferences` — `{ "language": "fr" }`        |
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

You're probably sending `Authorization: Bearer …`. This API doesn't read
that header. Log in to get the `Set-Cookie`, then send the cookie on
subsequent requests — see the smoke example above.

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
