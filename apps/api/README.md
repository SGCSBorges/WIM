# `@wim/api`

The WIM backend — Node 22, Express, TypeScript, Prisma over PostgreSQL,
BullMQ over Redis, Stripe billing, JWT (httpOnly cookies).

See [`CLAUDE.md`](../../CLAUDE.md) at the repo root for the high-level
architecture (auth model, sharing flavors, billing, deploy quirks). This
README is the per-workspace operational guide.

## Stack at a glance

- **HTTP**: Express, Helmet, CORS, rate-limit middleware in
  `src/config/security.ts`.
- **Persistence**: Prisma client over PostgreSQL. Hand-written SQL
  migrations under `prisma/migrations/<stamp>_<slug>/migration.sql`.
- **Auth**: JWT in an httpOnly cookie. Token carries `jti` (denylist on
  logout via Redis) and `v` (bumped per-user `tokenVersion` for force-
  logout). `authGuard` re-reads role + tokenVersion from DB every request.
- **Jobs**: BullMQ — two queues (`wim-alerts`, `wim-maintenance`). Three
  daily/weekly repeatables; see `src/jobs/workers.ts`.
- **Email**: Resend over a plain `fetch` (no SDK dep) — opt-out per user,
  no-op when `RESEND_API_KEY`/`MAIL_FROM` are unset.
- **Push**: Web Push via VAPID keys; no-op when unset.
- **Audit**: Every mutating route calls `auditAction(...)`; rows pruned by
  the daily maintenance job.

## Module map (`src/modules/`)

Each module is a small slice of the API and follows the same shape:
`*.routes.ts`, `*.service.ts`, `*.schemas.ts` (Zod), occasionally
`*.pdf.ts` / `*.csv.ts` for exports.

| Module          | Responsibility                                              |
| --------------- | ----------------------------------------------------------- |
| `auth`          | Register/login/logout, password reset, JWT issue + guard, `session.service` (per-device sessions keyed by jti), `totp.service` (TOTP 2FA + 5-minute challenge tokens). |
| `articles`      | List + CRUD + bulk ops (delete, share, assign, **bulk-update** scalar fields) + soft-delete + Trash + CSV/PDF export + `template.routes` for the reusable Article-create payloads. |
| `warranties`    | CRUD + claim workflow + **renew / extend / history** (rolls the live row forward into `WarrantyHistory`; reuses `AlertService.rescheduleForWarranty`). |
| `attachments`   | File upload (Multer + signature check), thumbs, bulk delete.|
| `locations`     | Location CRUD + paginated articles-in-location.             |
| `tags`          | Tag CRUD + rename/merge.                                    |
| `alerts`        | Warranty reminder + custom alert scheduling (BullMQ); plus the notification-bell feed (`GET /alerts/notifications`, `POST /alerts/mark-seen`). |
| `reports`       | Insurance-ready portfolio PDF via PDFKit (`/api/reports/portfolio.pdf`), honors article-list filters. |
| `shares`        | POWER_USER → POWER_USER inventory invites (per-user shares).|
| `shared`        | Recipient-side reads + WRITE edits of shared articles.      |
| `billing`       | Stripe Checkout, customer portal, webhook (idempotent).     |
| `admin`         | Admin-only routes (users, audit log, jobs, DB backup).      |
| `calendar`      | iCal feed (warranty ends + custom alerts + claims).         |
| `profile`       | Email/password/currency/email-reminders/digest toggle; cross-device UI preferences (`theme`/`language`/`dateFormat` via `PUT /profile/me/preferences`); login history + session list/revoke; TOTP setup/verify/disable; delete account. |
| `push`          | Web Push subscription endpoints.                            |
| `saved-views`   | Per-user saved filter views for the Articles list.          |
| `audit`         | Audit log read endpoint + retention prune.                  |
| `email`         | Best-effort transactional email via Resend.                 |
| `common`        | Shared schemas, ACL helpers, http helpers, audit util.      |

Anything cross-cutting lives in `src/services/` (currently
`statistics.service.ts`) and `src/middlewares/`, `src/utils/`, `src/libs/`.

## Scripts (npm)

```bash
npm run dev                 # nodemon + ts-node, watches src/
npm run build               # tsc
npm test                    # vitest run (unit suites)
npm run test:coverage       # unit + v8 coverage gate
npm run test:integration    # real-Postgres suite (needs INTEGRATION_DATABASE_URL)
npm run lint                # eslint src/**/*.{js,ts}
npm run typecheck           # tsc --noEmit
npm run prisma:generate     # regenerate the Prisma client
npm run prisma:migrate      # apply migrations in dev
npm run prisma:deploy       # apply migrations (production)
npm run promote:admin -- email@x   # one-off: promote a user to ADMIN
npm run worker              # run only the BullMQ workers (separate dyno)
```

## Environment

See `.env.example` for the canonical list with defaults. `JWT_SECRET` and
`DATABASE_URL` are required; everything else has sensible fallbacks or
warns at boot if obviously broken (`validate-env.ts`).

## Tests

- **Unit** — `src/__tests__/modules/**`, `src/__tests__/utils/**`, etc.
  Run against mocked Prisma; fast. `npm test`.
- **Integration** — `src/__tests__/integration/api.integration.test.ts`,
  one suite that exercises real HTTP against a real Postgres. Self-skips
  when `INTEGRATION_DATABASE_URL` is unset.

CI runs both and gates on the coverage thresholds in `vitest.config.ts`.

## Database migrations

Hand-written SQL — see [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) for
the convention and the drift-check command.

## Jobs

See `src/jobs/workers.ts` for the three repeatable schedules (audit prune,
trash purge, weekly warranty digest) and `src/jobs/queues.ts` for the
queue defaults + the `listFailedJobs` helper that powers the Admin Jobs
tab's "Recent failures" view.
