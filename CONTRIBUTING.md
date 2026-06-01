# Contributing to WIM

Thanks for taking the time to contribute. This file is the short
operational guide — for the architectural map (deploy quirks, the sharing
model, billing, conventions) read [`CLAUDE.md`](./CLAUDE.md) at the repo
root. Both should agree; if you find them disagreeing, [`CLAUDE.md`](./CLAUDE.md)
is canonical and this file should be updated.

## Prerequisites

- Node.js ≥ 22 (see `.nvmrc`)
- PostgreSQL 16 and Redis 7 reachable locally (Docker Compose: `docker compose
  up -d db redis`)
- Copy the example envs and edit them:
  - `cp apps/api/.env.example apps/api/.env`
  - `cp apps/web/.env.example apps/web/.env`

The API needs `DATABASE_URL` and `JWT_SECRET` to start; the web app needs
`VITE_API_BASE_URL` only if the API is on a different origin.

## First-time setup

```bash
npm install --workspaces --include-workspace-root --include=optional
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run prisma:migrate    # apply the migration history
```

## Running locally

```bash
npm --workspace apps/api run dev               # API on :3000
npm --workspace apps/web run dev               # web on :5173
```

## Branches

- `main` = stable, deployed. **No direct pushes.**
- `dev` = integration branch. Every change merges (or pushes) here first, then
  release commits bubble up to `main`. The Render API + web services both
  redeploy on push to `dev` — keep the gate (see below) green.
- Working branches (cut from `dev`):
  - `feat/<area>-<short-desc>` — new feature
  - `fix/<area>-<short-desc>` — bug fix
  - `docs/<topic>`, `chore/<topic>`, `refactor/<topic>`, `test/<topic>`,
    `perf/<topic>`, `ci/<topic>`, `style/<topic>`

## Commit messages

Conventional Commits:

- `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `ci:`,
  `style:`, `hardening:` (security-leaning), `ui:` (front-end UX changes)
- Scope is optional but recommended: `feat(articles): …`,
  `fix(profile): …`.
- Subject line ≤ 72 chars; body explains the *why* and references any tests
  or open items it touches.

## The local CI gate (run before opening a PR)

These are the same steps `.github/workflows/ci.yml` runs. **Check the exit
code, not just the tail of the output** — round 8 cost us an extra round-trip
because `npm run lint | tail -3` masked a failing workspace.

```bash
npm run lint                                   # 0 errors, every workspace
npm --workspace apps/api run build             # tsc on the API
npm --workspace apps/web run typecheck         # tsc --noEmit on the web
npm test                                       # unit suites, all workspaces
npm --workspace apps/web run build             # Vite production build

# Formatting (CI runs this as its own step; scope mirrors per-workspace ESLint
# globs — the API ignores src/__tests__/** so prettier does too):
npx prettier --check \
  "apps/api/src/**/*.{ts,js}" "!apps/api/src/__tests__/**" \
  "apps/web/src/**/*.{ts,tsx}" "packages/**/src/**/*.ts"
```

Integration tests (real Postgres) self-skip when `INTEGRATION_DATABASE_URL`
is unset. To run them locally:

```bash
INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wim_test \
  JWT_SECRET=itest \
  npm --workspace apps/api run test:integration
```

## Testing

Three tiers, each with a different cost/coverage trade-off. `npm test` (in the
gate above) runs only the unit tier in both workspaces; integration and e2e
are opt-in.

- **Unit (Vitest)** — the default `npm test`. The API
  (`apps/api/src/__tests__/`) runs against a **mocked Prisma**, so it needs no
  database; the web suite (`apps/web/src/__tests__/`) uses **React Testing
  Library + jsdom**. Both are fast and have no external dependencies. Coverage
  thresholds live in each workspace's `vitest.config.ts` as a *ratchet* — set
  just below current coverage to catch regressions. If you must lower one,
  say why in the PR body.
- **Integration (real Postgres)** — `apps/api/src/__tests__/integration/`.
  Exercises the live Express app against a throwaway Postgres. **Self-skips
  unless `INTEGRATION_DATABASE_URL` is set**, so it's safe in the default run.
  The suite wipes tables between runs, disables background workers
  (`JOBS_ENABLED=false`, so no Redis needed), and raises the rate limit so the
  fast back-to-back requests don't trip it. Command is the
  `test:integration` example just above.
- **E2E (Playwright)** — `apps/web/e2e/` (currently a smoke spec). **Not part
  of the CI gate.** Install browsers once (`npx playwright install chromium`);
  the Playwright config builds and previews the production bundle itself, so
  you don't start a dev server. The smoke spec is API-free (UI only).

  ```bash
  npm --workspace apps/web run test:e2e
  ```

A behavior change ships with a test in the matching tier — unit for pure
logic, integration for a route/DB contract, e2e for a user-visible flow.
UI-only tweaks describe the manual test plan in the PR instead.

## Schema changes (Prisma migrations)

Migrations are **hand-written SQL** under
`apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_<slug>/migration.sql`. Do not
rely on `prisma migrate dev` to scaffold them — we want the SQL to be
reviewable and to include comments explaining *why* each index / constraint
exists.

After editing `schema.prisma` + writing the migration, the drift check must
be clean:

```bash
cd apps/api
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://postgres:postgres@localhost:5433/wim_shadow" \
  --exit-code
# Expect: "No difference detected."
```

The shadow database can be any throwaway PG instance — port 5433 is the local
convention. CI uses its own Postgres service for both the drift check and the
integration tests.

## Adding an i18n key

UI strings go through the `t()` function in `apps/web/src/i18n/i18n.tsx`. The
lookup chain is **`extras[lang] → translations[lang] → extras.en →
translations.en → key`**. New keys go into
`apps/web/src/i18n/translations.extras.ts` (en / fr / pt blocks) so the
70-KB main dictionary stays low-churn. Extras can also override an existing
key for a copy fix without touching the big file.

## UML diagrams

The architecture diagrams live in `docs/uml/` as PlantUML (`.puml`) sources
with a co-located rendered `.svg` each (committed so GitHub shows them inline,
see `docs/uml/README.md`). **Edited a `.puml`? Re-render and commit the SVG:**

```bash
npm run docs:uml        # renders via the pinned PlantUML Docker image
```

CI's `uml` job re-renders and fails if any committed `.svg` is stale (a
deterministic drift check, like the Prisma one above). Requires Docker locally.

## Code style

- TypeScript strict mode in both apps.
- ESLint + Prettier — both enforced in CI.
- No `any`; prefer `unknown` + narrowing.
- Comments explain *why*, not *what*. Skip them when the name says enough.
  Don't add comments for impossible cases or to narrate the current task /
  caller — those belong in the PR body.
- Don't introduce error handling, fallbacks, or backwards-compat shims for
  scenarios that can't happen. Trust internal code and framework
  guarantees; only validate at system boundaries.
- Prefer editing existing files to creating new ones unless the new file is
  genuinely needed.

## Pull requests

- Target: `dev`. Release PRs target `main`.
- The CI gate above must be green.
- A behavior change comes with a test (unit or integration depending on the
  surface). UI-only changes should describe the manual test plan in the PR
  body.
- Don't bypass CI hooks (`--no-verify`, `--no-gpg-sign`) unless the user has
  explicitly asked.

## Issues

Use labels: `bug`, `enhancement`, `docs`, `infra`, `security`.
