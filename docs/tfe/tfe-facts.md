# TFE facts — verified against the repo

Every fact below was verified on 2026-07-08 by reading the actual files or
running the actual commands in this repository (branch `dev`, HEAD
`de3ca09`). Nothing is quoted from memory. Line numbers refer to that HEAD.

---

## 1. Code extracts (for the thesis §5.5.1)

### Extract A — CSRF / origin-check middleware

`apps/api/src/middlewares/csrf.ts`, lines 42–62 (the complete guard
function — 21 lines, kept whole rather than truncated):

```ts
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const hasAuthCookie = Boolean(
    (req as Request & { cookies?: Record<string, string> }).cookies?.wim_token
  );
  if (!hasAuthCookie) return next();

  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : null;
  const referer =
    typeof req.headers.referer === "string" ? req.headers.referer : undefined;
  const candidate = origin ?? originFromReferer(referer);

  if (!candidate || !isAllowedOrigin(candidate)) {
    return res
      .status(403)
      .json({ error: "Cross-site request blocked (CSRF protection)" });
  }
  next();
}
```

Context: `SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])` (line 24);
the allowlist comes from `csrfAllowedOrigins` in
`apps/api/src/config/security.ts`. Mounted globally in
`apps/api/src/app.ts:92` (`app.use(csrfGuard)`), after `cookieParser()`.

### Extract B — warranty-reminder scheduling (delayed BullMQ jobs)

Inside `AlertService.scheduleForWarranty` (called on warranty
create/update/renew/extend). Two contiguous fragments of the per-offset
loop:

`apps/api/src/modules/alerts/alert.service.ts`, lines 180–191:

```ts
      const delay = Math.max(0, executeMs - now.getTime());
      const jobId = buildJobId(input.garantieId, reminderKind, executeAt);

      const payload: WarrantyReminderJobPayload = {
        type: "warranty_reminder",
        ownerUserId: input.ownerUserId,
        garantieId: input.garantieId,
        articleId: input.articleId ?? null,
        reminderKind,
        executeAt: executeAt.toISOString(),
        alerteId: alerte.alerteId,
      };
```

`apps/api/src/modules/alerts/alert.service.ts`, lines 205–212:

```ts
      await alertQueue.add("reminder", payload, {
        jobId,
        delay,
        attempts: 3,
        // Long backoff because retries here cover server-side rate limits
        // (push provider / email) rather than tight network blips.
        backoff: { type: "exponential", delay: 30_000 },
      });
```

Context: the loop iterates `computeWarrantyReminderSchedule(...)` (lines
120–125), which yields one entry per reminder offset — the user's custom
`User.warrantyReminderDays` or the default `[30, 7, 1]`
(`apps/api/src/modules/alerts/alert.scheduler.ts:16`). Between the two
fragments (lines 193–203) sits only a `logger.info(...)` call, elided
here for length. An `Alerte` row is persisted first (lines 134–147,
`createMany` + `skipDuplicates` against the unique
`(garantieId, alerteDate)`), then the delayed job is enqueued on the
`wim-alerts` BullMQ queue.

### Extract C — Zod schema for article creation, route + OpenAPI wiring

Schema head — `apps/api/src/modules/articles/article.schemas.ts`,
lines 24–34:

```ts
export const ArticleCreateSchema = z.object({
  articleNom: z.string().trim().min(1).max(100),
  articleModele: z.string().trim().min(1).max(100),
  articleDescription: z.string().trim().max(255).optional().nullable(),
  // Identity fields — optional, folded into the substring search.
  serialNumber: z.string().trim().max(120).optional().nullable(),
  brand: z.string().trim().max(120).optional().nullable(),
  // Purchase provenance — retailer/store + the order or receipt reference,
  // the two facts a warranty claim or insurance filing always asks for.
  purchasedFrom: z.string().trim().max(150).optional().nullable(),
  orderRef: z.string().trim().max(100).optional().nullable(),
```

(The full schema continues to line 105 with price/quantity/status/
category/condition/bundle/customFields/locationIds/tagIds and an
optional embedded `garantie` object.)

Route attachment — `apps/api/src/modules/articles/article.routes.ts`,
lines 261–269:

```ts
router.post(
  "/",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const bodyData = ArticleCreateSchema.omit({ ownerUserId: true }).parse(
      req.body
    );
    const data = { ...bodyData, ownerUserId: req.user!.sub };
    const created = await ArticleService.create(data);
```

OpenAPI generation — the **same** Zod object feeds the spec via the
`zod-openapi` library (`import { createDocument } from "zod-openapi";`,
`apps/api/src/openapi/document.ts:18`). Lines 371–378:

```ts
        post: {
          tags: ["articles"],
          summary: "Create a new article.",
          security: [cookieAuth],
          requestBody: {
            ...json(ArticleCreateSchema.omit({ ownerUserId: true })),
            required: true,
          },
```

Served at `GET /api/docs` (Swagger UI) / `GET /api/openapi.json`.

---

## 2. Test evidence (for §5.3 and test sheets CT-01/02/03)

### Unit-test runs with coverage (executed 2026-07-08 in this repo)

API — command `npm --workspace apps/api run test:coverage` (vitest, v8
coverage):

- Test files: **75** (74 passed, 1 skipped)
- Tests: **617** (575 passed, 42 skipped, **0 failed**)
- Coverage (All files): **51.97 % statements, 51.97 % lines, 77.79 %
  branches, 64.39 % functions**
- The 42 skipped tests are the supertest integration suite
  (`src/__tests__/integration/api.integration.test.ts`), which self-skips
  unless `INTEGRATION_DATABASE_URL` points at a real Postgres. In CI (and
  when run locally with a Postgres) all 42 run and pass.
- Coverage thresholds gated in `apps/api/vitest.config.ts`: statements 44,
  branches 74, functions 63, lines 44.

Web — command `npm --workspace apps/web run test:coverage` (vitest, v8
coverage, jsdom):

- Test files: **61** (all passed)
- Tests: **257** (all passed, **0 failed**)
- Coverage (All files): **56.52 % statements, 56.52 % lines, 65.49 %
  branches, 35.43 % functions**

### Specific test coverage asked

(a) **register → login → cookie flow via supertest** — FOUND.
`apps/api/src/__tests__/integration/api.integration.test.ts:94`,
`it("registers, logs in, and returns the current user")` — a
`request.agent(app)` (cookie jar) POSTs `/api/auth/register` (which sets
the `wim_token` cookie) then GETs `/api/auth/me` authenticated purely by
that cookie. Explicit `POST /api/auth/login` calls are additionally
exercised in the same file at lines 454, 459, 487 and 791 (e.g.
`it("runs the forgot-password → reset-password → re-login flow")`,
line 414).

(b) **garantieFin calculation + default J-30/J-7/J-1 alert creation** —
FOUND, split across three files:
- `apps/api/src/__tests__/common/date.test.ts` — 6 tests on `addMonths`
  (the primitive `WarrantyService.create` uses at
  `warranty.service.ts:66` to compute `garantieFin`), incl.
  `it("handles month-end overflow: Jan 31 + 1 month → last day of Feb")`.
- `apps/api/src/__tests__/modules/alert.scheduler.test.ts:37` —
  `it("defaults to J-30/J-7/J-1")` under
  `describe("computeWarrantyReminderSchedule")`, plus custom-offset and
  past-date-filtering tests.
- `apps/api/src/__tests__/modules/warranty.service.test.ts:76` —
  `it("creates warranty and schedules alerts on success")` asserts
  `AlertService.scheduleForWarranty` is invoked on create.

(c) **Playwright smoke of login screen / theme** — PARTIAL.
`apps/web/e2e/smoke.spec.ts` (`test.describe("auth screen")`) has two
tests: `"renders the sign-in form for an unauthenticated visitor"` and
`"keeps email input editable"`. DIFFERENT: **no Playwright test asserts
theme switching** — the smoke suite covers only the unauthenticated login
screen; a second spec, `apps/web/e2e/responsive-overflow.spec.ts`, checks
for horizontal overflow across viewports. Theme behavior is covered by
jsdom unit tests instead (`apps/web/src/__tests__/` theme suites), not
by Playwright.

### Latest green CI run on dev

Run **#609**, workflow `ci`, commit `de3ca09`, completed
**2026-07-08 (UTC)**, conclusion `success`:
<https://github.com/SGCSBorges/WIM/actions/runs/28924505557>

---

## 3. Repo metrics

- `git rev-list --count dev` → **668** commits. (Caution: the CI/cloud
  checkout is a shallow clone that reports 66; the figure above was taken
  after `git fetch --unshallow`.)
- Versions (from `package.json` files, verbatim ranges):
  - Node engines: `">=22 <23"` (root `package.json` and
    `apps/api/package.json`; `apps/web` declares no engines field)
  - react: `^19.2.5` (apps/web)
  - express: `^4.22.2` (apps/api)
  - prisma: `^5.22.0` / @prisma/client: `^5.22.0` (apps/api)
  - vite: `^5.4.3` (apps/web)
  - typescript: `^5.3.3` (apps/api), `^5.4.5` (apps/web)
  - vitest: `^2.0.0` (apps/api), `^2.1.9` (apps/web)
  - @playwright/test: `^1.60.0` (apps/web)
- Prisma schema (`apps/api/prisma/schema.prisma`):
  `grep -c "^model "` → **36**; `grep -c "^enum "` → **16**.
- Rate limits (`apps/api/src/config/security.ts`; numeric envs validated
  at boot, invalid values fall back to defaults):
  - Global: **100 req / 60 000 ms per IP** (defaults of `RATE_LIMIT_MAX`
    / `RATE_LIMIT_WINDOW_MS`), lines 89–95.
  - Auth: **20 FAILED attempts / 15 min** (`AUTH_RATE_LIMIT_MAX`,
    `skipSuccessfulRequests: true`), lines 102–111.
  - Destructive ops: **10 / hour**, keyed on hashed auth token with IP
    fallback (`userOrIpKey`), lines 117–126.
  - Resource creation: **40 / 5 min** (`CREATE_RATE_LIMIT_MAX`),
    lines 130–135.
- Upload size limit: **10 MB** —
  `apps/api/src/modules/attachments/attachment.routes.ts:74`
  (`limits: { fileSize: 10 * 1024 * 1024 }`), plus magic-byte signature
  verification after upload (same file, line 172).
- Default warranty-reminder offsets: **J-30 / J-7 / J-1** —
  `export const DEFAULT_REMINDER_DAYS = [30, 7, 1] as const;`
  (`apps/api/src/modules/alerts/alert.scheduler.ts:16`); per-user
  override in `User.warrantyReminderDays` (CSV, max 5 offsets).
- i18n locales shipped: **5** — `en`, `fr`, `pt`, `es`, `nl` — dictionary
  objects in `apps/web/src/i18n/translations.ts` (keys at lines 6, 474,
  953, 1424, 1907) plus `apps/web/src/i18n/translations.extras.ts`.
- UI themes shipped: **5** — `light`, `dark`, `ocean`, `cyber`, `sunset`
  — `export type Theme = "light" | "dark" | "ocean" | "cyber" | "sunset";`
  (`apps/web/src/theme/theme.tsx:19`), CSS variables per
  `:root[data-theme]` block in `apps/web/src/index.css`.
- shadcn/ui: **NO**. `grep -rn "shadcn|radix-ui" apps/web/src
  apps/web/package.json` returns no dependency or import. The UI
  primitives are a hand-rolled design system in
  `apps/web/src/components/ui/` (Button, Field/Input/Select, Badge,
  Tabs, ConfirmDialog, …) exported through its own barrel — do not call
  it shadcn in the thesis.

---

## 4. Deployment facts

- **Render region: NOT FOUND in the repo.** `render.yaml` (repo root)
  declares only the static web service (`wim-web`, `runtime: static`)
  with the `/api/*` → `https://wimapi.onrender.com/api/*` rewrite and the
  SPA fallback; it contains **no `region:` key**, and the API service is
  configured in the Render dashboard, not in the repo. For an RGPD claim
  about EU hosting, the region must be read from the Render dashboard —
  it cannot be evidenced from this repository. (Render's default region
  when unspecified is Oregon/US, so do not assert EU hosting without
  checking.)
- **S3-compatible storage**: implemented and env-gated in
  `apps/api/src/libs/object-storage.ts` (`S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_REGION`
  defaulting to `auto`; `storageEnabled()` at line 57 returns false when
  unset). DIFFERENT: **the `S3_*` variables are absent from
  `apps/api/.env.example`** — the example file documents DB/JWT/CORS/
  Stripe/Redis/rate-limit/retention/VAPID/Resend vars but not S3, so the
  feature is opt-in via dashboard-only configuration. **Without S3 env
  vars, uploads are written to the local `uploads/` directory** (multer
  disk storage, `attachment.routes.ts:45`), which on Render's free tier
  is an ephemeral disk wiped on every deploy — the README and CLAUDE.md
  therefore recommend configuring the bucket in production.

---

## 5. Corrections (thesis claims vs reality)

| Claim | Verdict | Evidence |
|---|---|---|
| "36 models, 16 enums" | **CONFIRMED** | `grep -c "^model "` = 36, `grep -c "^enum "` = 16 on `apps/api/prisma/schema.prisma` |
| "100 req/min global rate limit" | **CONFIRMED, with nuance** | It is the *default* (`RATE_LIMIT_MAX` env-overridable), per IP, window 60 000 ms — `apps/api/src/config/security.ts:89-95`. Three tighter buckets coexist (auth 20 failed/15 min; destructive 10/h; create 40/5 min) — say "100 req/min per IP by default" |
| "10 MB upload cap" | **CONFIRMED** | `apps/api/src/modules/attachments/attachment.routes.ts:74` |
| "5 UI languages" | **CONFIRMED** | en/fr/pt/es/nl in `apps/web/src/i18n/translations.ts` |
| "TOTP backup codes stored hashed" | **CONFIRMED** | bcrypt cost 10, single-use — `apps/api/src/modules/auth/totp.service.ts:62` (`codes.map((c) => bcrypt.hash(c, 10))`) |
| "tokenVersion invalidates all JWTs" | **CONFIRMED** | `apps/api/src/modules/auth/auth.middleware.ts:65` — `if ((payload.v ?? 0) < fresh.tokenVersion)` → 401; `tokenVersion` re-read from DB on every request (line 62) |
| "webhook idempotence via ProcessedStripeEvent table" | **CONFIRMED, with nuance** | `tx.processedStripeEvent.create` inside the handler transaction — `apps/api/src/modules/billing/billing.webhook.routes.ts:123`; model at `schema.prisma:999`. Additionally, events older than `STRIPE_WEBHOOK_MAX_AGE_SEC` (default 300 s) are acknowledged but skipped (replay-age bound) — worth mentioning |
| "soft delete only on Article" | **CONFIRMED** | `deletedAt` exists on exactly one model: `Article` (`schema.prisma:441`); every other delete is hard (or status-based, e.g. `InventoryShare.active`, transfer `REVOKED`) |

---

*Generated from repository state at commit `de3ca09` on branch `dev`.
Coverage percentages come from the vitest v8 reporter run on 2026-07-08;
re-running after further commits will shift them slightly.*
