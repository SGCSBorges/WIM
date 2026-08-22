# `@wim/web`

The WIM frontend — Vite + React 19 + React Router v7 + Tailwind v3,
react-hook-form + Zod (resolvers v5), PWA-installable.

See [`docs/conventions.md`](../../docs/conventions.md) for the architectural
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
- **i18n**: five-language dictionary (en / fr / pt / es / nl) split between
  `i18n/translations.ts` (large, low-churn) and
  `i18n/translations.extras.ts` (new + overrides). The `t()` lookup chain
  is `extras[lang] → translations[lang] → extras.en → translations.en →
  key`. **New keys go into `translations.extras.ts`.**
- **Theming**: five themes (`light` / `dark` / `ocean` / `cyber` / `sunset`) via
  `data-theme` on `<html>` and CSS variables in `src/index.css`. Shared
  components use the `.ui-*` utility classes (`ui-card`, `ui-btn-primary`,
  `ui-badge-power`, …) — don't hardcode Tailwind colors on shared widgets.
  Semantic Tailwind utilities (`bg-surface`, `text-muted`, `border-line`,
  `bg-primary`, `text-primary-contrast`, …) are bridged onto the CSS vars
  in `tailwind.config.js`, so they resolve per-theme automatically.
- **Design system**: primitives in `src/components/ui/` (barrel
  `index.ts`): `Button`, `Field`/`Input`/`Textarea`/`Select`, `PageHeader`,
  `Tabs`, `ConfirmDialog`, `Badge`, `Card`/`Section`, `Stat`, `Pagination`,
  `Breadcrumbs`, `Segmented`, `Popover`, `Dropzone`, `CommandPalette`.
  Icons from `lucide-react` (never emoji). Self-hosted Inter Variable via
  `@fontsource-variable/inter`. Charts use `recharts`, lazy-loaded inside
  the Dashboard chunk only.
- **App shell** (`src/components/layout/`): `AppShell` mounts the
  desktop `Sidebar` (collapse persisted), sticky `TopBar`,
  `MobileDrawer`, and `NotificationBell`. Sidebar/Drawer nav models live
  in `src/lib/navItems.ts` (`visibleNavItems(role)`, role-gated).
- **Command palette + shortcuts**: `AppShell` mounts a `CommandPalette`
  and registers global keys via `hooks/useHotkeys` — `mod+k` opens the
  palette, `c` creates an article, `?` opens the `ShortcutsHelp`
  overlay, `g <key>` jumps to a nav section (`g a` → Articles, `g d` →
  Dashboard, etc.). Plain keys and sequences are suppressed while typing
  in fields; modifier combos (`mod+k`) still fire.
- **Preferences**: cross-device prefs (`theme`/`language`/`dateFormat`)
  live on the `User` row. The auth `/me` payload carries them; client
  providers (`theme/theme.tsx`, `i18n/i18n.tsx`,
  `preferences/preferences.tsx`) expose `hydrate*` to apply on login
  without echoing back, and write user-initiated changes through to
  `PUT /api/profile/me/preferences` (debounced, best-effort).
  `localStorage` is the pre-auth cache + logged-out fallback. UI
  `density` (`comfortable | compact`) is per-device only — toggled in
  Profile → Appearance, driving `data-density` on `<html>`.
- **State**: local + URL search params (the Articles list keeps every
  filter in the URL so views are shareable and survive reload). No global
  store.

## Component map (`src/components/`)

Grouped by surface. Most are straightforward; a few are large because the
feature is large.

- `articles/` — list, detail, form, scan, trash, CSV import, bulk action
  bar, tag manager. `ArticlesList.tsx` is the biggest file in the app and
  owns the URL-synced filter + bulk-selection state. Also hosts
  `BulkEditDialog` (tri-state per-field edit across a selection) and
  `TemplateBar` (the "start from template / save as template" row above
  the create form).
- `warranties/` — list with status `Segmented` filter, per-row status
  Badge, and a `Renew` action that opens `RenewWarrantyDialog`
  (Modal-shelled, Renew | Extend Segmented, live "new end date"
  preview). The same dialog is launched from Article detail and the
  Dashboard "Needs attention" panel. Status classification lives in
  `src/utils/warrantyStatus.ts`.
- `reports/` — lazy `ReportsView` with three Selects (location, tag,
  warranty status) + a download button that pulls the insurance
  portfolio PDF.
- `attachments/` — grid with bulk select + delete.
- `locations/` — list with paginated articles-in-location counts.
- `admin/` — Users / Audit log / Jobs tabs, role edit, DB backup panel,
  failed-jobs viewer.
- `profile/` — credentials, currency, push/email/digest toggles, billing
  panel, data export panel, sharing summary. The new `SecuritySection`
  hosts active sessions (with per-device revoke), recent sign-in
  activity, and the `TwoFactorPanel` setup/disable wizard.
- `sharing/` — shared-with-me view, my-shared view, invite accept form,
  invites list.
- `dashboard/` — recharts-based KPI grid plus a `NeedsAttention` panel
  above the charts (expired + expiring-soon articles with inline
  snooze, **renew warranty**, and view links). Lazy-loaded so
  `recharts` stays out of the main bundle.
- `onboarding/` — `OnboardingChecklist` on Home, derives "what's left"
  from `statisticsAPI.getBasic` (first article / warranty / alert) and
  links each step to the right route. Dismissible (localStorage).
- `layout/` — `AppShell`, `Sidebar`, `TopBar`, `MobileDrawer`,
  `NotificationBell`. The bell surfaces overdue/due-soon alerts via
  `GET /api/alerts/notifications`.
- `auth/` — `LoginForm` handles both the password step and the TOTP
  challenge step when a `{ totpRequired, challengeToken }` response
  comes back from `/auth/login`.
- `alerts/`, `calendar/`, `common/` — smaller views + reusable bits
  (`Modal`, `Skeleton`, `States`, `Toast` with optimistic undo,
  `BarList`, `ShortcutsHelp`).

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
