# WIM — Warranty & Inventory Manager

WIM is a full-stack SaaS application for tracking physical assets, their warranties, attachments, and alerts. Built with a React frontend and a Node.js/Express API backed by PostgreSQL and Redis.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · React Router v7 |
| Backend | Node.js · Express · TypeScript · Prisma ORM |
| Database | PostgreSQL |
| Queue | BullMQ + Redis |
| Auth | JWT (Bearer token) |
| Payments | Stripe (subscriptions + webhooks) |
| Logging | Pino structured logging |

---

## Workspace structure

```
WIM/
├── apps/
│   ├── api/          # Express REST API (port 3000)
│   └── web/          # React SPA (port 5173)
├── package.json      # npm workspace root
└── .github/
    └── workflows/
        └── ci.yml    # CI: build + test
```

---

## Getting started

### Prerequisites

- Node.js ≥ 22
- PostgreSQL database
- Redis instance (for BullMQ job queue)

### 1. Install dependencies

```bash
npm install --workspaces
```

### 2. Configure the API

Copy the example env file and fill in values:

```bash
cp apps/api/.env.example apps/api/.env
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars, random) |
| `REDIS_URL` | Redis connection string (e.g. `redis://localhost:6379`) |

Optional variables:

| Variable | Description |
|---|---|
| `PORT` | API port (default: `3000`) |
| `CORS_ORIGIN` | Allowed frontend origin (default: deny all in production) |
| `APP_URL` | Public URL of the frontend (used for Stripe redirect URLs) |
| `STRIPE_SECRET_KEY` | Stripe secret key (required in production) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (required in production) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms (default: `60000`) |
| `RATE_LIMIT_MAX` | Max requests per window (default: `100`) |

### 3. Run database migrations

```bash
cd apps/api
npm run prisma:migrate
```

### 4. Start the development servers

API (port 3000):

```bash
cd apps/api
npm run dev
```

Web (port 5173):

```bash
cd apps/web
npm run dev
```

### 5. Configure the web app's API URL

Set `VITE_API_BASE_URL` in `apps/web/.env.local`:

```
VITE_API_BASE_URL=http://localhost:3000/api
```

---

## User roles

| Role | Description |
|---|---|
| `USER` | Free tier — manage own articles, warranties, attachments, alerts |
| `POWER_USER` | Paid tier — all USER features + inventory sharing with other POWER_USERs |
| `ADMIN` | Internal — user management and audit log access |

---

## API reference

Base path: `/api`

All endpoints except `/auth/register`, `/auth/login`, and `/billing/webhook` require a `Authorization: Bearer <token>` header.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | ✗ | Register a new USER account |
| `POST` | `/login` | ✗ | Login, returns JWT token |
| `GET` | `/me` | ✓ | Return current user profile |

### Articles — `/api/articles`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✓ | List articles (optional `?locationId=`) |
| `POST` | `/` | ✓ | Create article (can include embedded warranty) |
| `GET` | `/:id` | ✓ | Get single article |
| `PUT` | `/:id` | ✓ | Update article (can update/remove warranty) |
| `DELETE` | `/:id` | ✓ | Delete article |
| `POST` | `/:id/share` | ✓ | Toggle `sharedWithPowerUsers` flag |
| `GET` | `/:id/shares` | ✓ | List explicit inventory shares for an article |

### Warranties — `/api/warranties`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✓ | List warranties owned by current user |
| `POST` | `/` | ✓ | Create standalone warranty |
| `GET` | `/:id` | ✓ | Get warranty |
| `PUT` | `/:id` | ✓ | Update warranty (recalculates expiry) |
| `DELETE` | `/:id` | ✓ | Delete warranty and cancel its alerts |

### Attachments — `/api/attachments`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✓ | List attachments (optional `?articleId=`, `?garantieId=`) |
| `GET` | `/:id` | ✓ | Get attachment metadata |
| `POST` | `/` | ✓ | Create attachment record (metadata only) |
| `POST` | `/upload` | ✓ | Upload file (multipart/form-data) — max 10 MB |
| `PUT` | `/:id` | ✓ | Update attachment metadata |
| `DELETE` | `/:id` | ✓ | Delete attachment (add `?removeFile=true` to also delete the file) |
| `GET` | `/warranty/:garantieId` | ✓ | Get proof attachment for a warranty |

Uploaded files are served publicly at `GET /uploads/<filename>` (no auth required).

### Alerts — `/api/alerts`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✓ | List alerts (optional `?status=`, `?articleId=`, `?garantieId=`) |
| `POST` | `/` | ✓ | Create manual alert |
| `PUT` | `/:id` | ✓ | Update alert |
| `DELETE` | `/:id` | ✓ | Cancel alert |

Alerts are also scheduled automatically (J-30, J-7, J-1 before warranty expiry) via BullMQ.

### Locations — `/api/locations`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ✓ | List locations owned by current user |
| `POST` | `/` | ✓ | Create location |
| `PUT` | `/:id` | ✓ | Update location |
| `DELETE` | `/:id` | ✓ | Delete location |
| `GET` | `/:id/articles` | ✓ | List articles in a location |

### Sharing — `/api/shares`

Requires `POWER_USER` role for share management.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/invites` | POWER_USER | Send an inventory share invite by email |
| `POST` | `/invites/accept` | ✓ | Accept an invite by token |
| `GET` | `/invites/sent` | ✓ | List invites sent by current user |
| `DELETE` | `/invites/:id` | ✓ | Revoke a sent invite |
| `GET` | `/owned` | ✓ | List active shares owned by current user |
| `GET` | `/received` | ✓ | List active shares received by current user |
| `PUT` | `/:targetUserId` | POWER_USER | Update share permission |
| `DELETE` | `/:targetUserId` | POWER_USER | Revoke share |

### Shared view — `/api/shared`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/articles` | POWER_USER | List articles shared to the current user |

### Billing — `/api/billing`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/upgrade/power-user/checkout` | ✓ | Create Stripe checkout session (body: `{ plan: "monthly" \| "yearly" }`) |
| `POST` | `/portal` | ✓ | Open Stripe billing portal |
| `POST` | `/cancel/power-user` | ✓ | Cancel subscription at period end |
| `GET` | `/me` | ✓ | Return current subscription info |
| `POST` | `/webhook` | ✗ | Stripe webhook receiver (raw body required) |

### Admin — `/api/admin`

Requires `ADMIN` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | ADMIN | List all users |
| `GET` | `/users/:id` | ADMIN | Get user detail |
| `PUT` | `/users/:id/role` | ADMIN | Change user role |
| `DELETE` | `/users/:id` | ADMIN | Delete user |

### Audit — `/api/audit`

Requires `ADMIN` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | ADMIN | List audit log (optional `?userId=`, `?entity=`, `?entityId=`, `?limit=`) |

---

## Data model

```
User ─── Article ─── Garantie (warranty)
  │         │              └── Alerte (alert)
  │         └── Attachment
  │         └── Location (many-to-many via ArticleLocation)
  │
  ├── InventoryShare (many-to-many between users)
  ├── ShareInvite
  └── AuditLog
```

---

## Running tests

```bash
cd apps/api
npm test             # run once
npm run test:watch   # watch mode
npm run test:coverage
```

Tests live in `apps/api/src/__tests__/` and use [Vitest](https://vitest.dev/). Coverage uses `@vitest/coverage-v8`.

---

## CI

GitHub Actions runs on every push and pull request:

1. Install dependencies
2. Generate Prisma client
3. Build the API (TypeScript)
4. **Run the test suite**
5. Build the web app
6. Upload web dist as artifact

See `.github/workflows/ci.yml`.

---

## Deployment (Render)

The production API is deployed on [Render](https://render.com).

- API: `https://wimapi.onrender.com/api`
- File uploads are served from `https://wimapi.onrender.com/uploads/`

> **Note:** Render uses ephemeral disk storage. Uploaded files are lost on redeploy. For production reliability, migrate file storage to an S3-compatible service (Cloudflare R2, AWS S3, etc.).

Required Render environment variables (in addition to all required vars above):

```
NODE_ENV=production
RENDER_EXTERNAL_URL=https://wimapi.onrender.com
```

---

## Security notes

- JWT tokens are stored in `localStorage` (XSS risk). A future improvement is to migrate to `httpOnly` cookies.
- CORS origin must be set via `CORS_ORIGIN` env var in production — the app will reject all cross-origin requests if unset.
- `JWT_SECRET` must be set — the app exits at startup if missing.
- Rate limiting is applied globally (100 req/min by default). Tune via `RATE_LIMIT_*` env vars.
- File uploads are limited to 10 MB and served publicly without auth. Do not store sensitive files.

---

## Known limitations / roadmap

- [ ] Migrate JWT to `httpOnly` cookies
- [ ] Add pagination to all list endpoints
- [ ] Migrate file uploads to cloud storage (S3/R2)
- [ ] Add frontend invite acceptance flow
- [ ] Add per-user rate limiting
- [ ] Extend test coverage to route-level integration tests
