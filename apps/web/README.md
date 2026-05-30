# `@wim/web`

The WIM frontend — Vite + React 19 + React Router v7 + Tailwind v3,
react-hook-form + Zod (resolvers v5), PWA-installable.

See [`CLAUDE.md`](../../CLAUDE.md) at the repo root for the architectural
context (theming, i18n, sharing model). This README is the per-workspace
operational guide.

## Stack at a glance

- **Build / dev**: Vite. `npm run dev` (port 5173), `npm run build`
  (production bundle to `dist/`). The PWA service worker (`public/sw.js`) is
  registered in `main.tsx` only in production builds.
- **Routing**: React Router v7 (BrowserRouter), `React.lazy` per route for
  code-split chunks (see `App.tsx`).
- **API client**: `src/services/api.ts` — single fetch wrapper with a 45 s
  timeout (cold-start headroom for Render free tier) and an in-memory
  `_cachedRole` populated on login/register/getMe.
- **Forms**: react-hook-form for validated forms, plain `useState` for
  smaller ones. The `useUnsavedChangesGuard` hook prompts on tab-close /
  refresh when a form is dirty (`hooks/`).
- **i18n**: three-language dictionary (en / fr / pt) split between
  `i18n/translations.ts` (large, low-churn) and
  `i18n/translations.extras.ts` (new + overrides). The `t()` lookup chain
  is `extras[lang] → translations[lang] → extras.en → translations.en →
  key`. **New keys go into `translations.extras.ts`.**
- **Theming**: four themes (`light` / `dark` / `ocean` / `cyber`) via
  `data-theme` on `<html>` and CSS variables in `src/index.css`. Shared
  components use the `.ui-*` utility classes (`ui-card`, `ui-btn-primary`,
  `ui-badge-power`, …) — don't hardcode Tailwind colors on shared widgets.
- **State**: local + URL search params (the Articles list keeps every
  filter in the URL so views are shareable and survive reload). No global
  store.

## Component map (`src/components/`)

Grouped by surface. Most are straightforward; a few are large because the
feature is large.

- `articles/` — list, detail, form, scan, trash, CSV import, bulk action
  bar, tag manager. `ArticlesList.tsx` is the biggest file in the app and
  owns the URL-synced filter + bulk-selection state.
- `warranties/` — list view + form (provider metadata, claim status).
- `attachments/` — grid with bulk select + delete.
- `locations/` — list with paginated articles-in-location counts.
- `admin/` — Users / Audit log / Jobs tabs, role edit, DB backup panel,
  failed-jobs viewer.
- `profile/` — credentials, currency, push/email/digest toggles, billing
  panel, data export panel, sharing summary.
- `sharing/` — shared-with-me view, my-shared view, invite accept form,
  invites list.
- `alerts/`, `calendar/`, `dashboard/`, `auth/`, `common/` — smaller views
  + reusable bits (`Modal`, `Skeleton`, `States`, `Toast`, `BarList`).

## Scripts (npm)

```bash
npm run dev          # vite dev server (port 5173)
npm run build        # vite build (predev/prebuild rebuild PWA icons via sharp)
npm run preview      # serve dist/ on :4173
npm test             # vitest run (unit suites)
npm run test:coverage
npm run test:e2e     # Playwright — auto-spins a preview server, no extra setup
npm run lint
npm run typecheck    # tsc --noEmit (strict; Vite's build is transpile-only)
npm run format       # prettier --write
npm run format:check # CI's check
```

## PWA notes

- `public/icon.png` is the master shield. The pre-build script
  `scripts/generate-pwa-icons.mjs` (sharp) resizes it to `icon-192.png`,
  `icon-512.png`, plus the maskable variants. Generated PNGs are
  `.gitignored`.
- `public/sw.js` is a hand-rolled service worker: network-first
  navigations, cache-first hashed assets, never intercepts `/api/`. The
  postbuild script `bump-sw-version.mjs` rewrites the cache key on each
  build so installed users pick up the new shell on next visit.

## Environment

Only `VITE_API_BASE_URL` matters — see `.env.example`. Set it when the API
isn't on `/api` of the same origin. In development the default
`http://localhost:3000/api` works out of the box.

## Tests

- **Unit / component** — vitest + React Testing Library + jsdom.
  Suites under `src/__tests__/`. Mock `services/api.ts` per file.
- **E2E** — Playwright (`tests/e2e/` — runs against a Vite preview build).

CI runs the unit suite + coverage gate (`vitest.config.ts`); E2E is opt-in.
