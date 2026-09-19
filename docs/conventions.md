# WIM — Warranty & Inventory Manager

Internal engineering notes: conventions, deploy quirks, known gotchas and
open items that the README deliberately doesn't repeat.

## Stack

- **Monorepo**: npm workspaces. `apps/api`, `apps/web`, `packages/types`.
- **API** (`apps/api`): Node 22, Express + TypeScript + Prisma + PostgreSQL
  + Redis (ioredis) + BullMQ + Stripe + JWT. Auth via httpOnly cookies, JWT
  with `jti` (Redis denylist on logout) + `v` (per-user `tokenVersion` for
  force-logout). Helmet + CORS + rate limiting in `config/security.ts`.
  Audit logs via `auditAction` (typed action union — extend when adding new
  ones). Background workers in `src/jobs/workers.ts`.
- **Web** (`apps/web`): Vite + React 19 + React Router v8 + Tailwind v3 +
  react-hook-form + Zod (resolvers v5 for Zod v4 compatibility). Route-level
  code splitting with `React.lazy`. PWA-installable (manifest + service
  worker + sharp-generated icons).
- **Shared types** (`packages/types`): plain interfaces (no Zod/Prisma) so
  both runtimes can import.

## Git commit rules

Commits carry no generated-by or co-author trailers. Author identity comes
from the system `user.name` / `user.email` in git config; nothing overrides
them.

## Branching & deploy

- **All work lands on `dev`.** The repo has no feature branches and no PR
  flow; a push to `dev` triggers CI and a Render redeploy.
- Render hosts two services:
  - `wimapi.onrender.com` — API service. `render-build:api` runs `npm ci
    --include=optional` then the API's `render-build` (`prisma generate &&
    prisma:deploy:retry && tsc`). `npm ci` is lockfile-exact, so a
    workspace dep bump must land in `package-lock.json` or the deploy
    fails.
  - `wim-web.onrender.com` — static web site. Built from `apps/web/dist`
    via the `render.yaml` Blueprint at the repo root. `render.yaml` contains
    both the SPA fallback rewrite and a `/api/*` proxy rule that forwards API
    calls to `wimapi.onrender.com` server-side — keeping the browser on a
    single origin (required for Safari/iOS auth; see Known gotchas).
- Critical Render env vars (set in dashboard, never in repo):
  - API: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`,
    `STRIPE_WEBHOOK_SECRET`, `STRIPE_POWER_USER_PRICE_MONTHLY/YEARLY`,
    `CORS_ORIGIN` (no trailing slash, comma-list OK), `APP_URL` (**single
    origin**, no trailing slash — `getAppUrl()` validates and rejects
    junk), `NODE_ENV=production`.
  - API (optional, Web Push): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
    (generate once via `npx web-push generate-vapid-keys`), optional
    `VAPID_SUBJECT` (`mailto:` contact). Without them, alert push delivery
    is a no-op and the "Enable notifications" toggle hides — everything
    else still works.
  - API (optional, Email reminders): `RESEND_API_KEY` + `MAIL_FROM` (a
    Resend-verified sender like `WIM <reminders@domain>`). When both are
    set, the reminder worker also emails alerts via Resend's REST API (no
    SDK dependency — a plain `fetch`), respecting each user's
    `User.emailReminders` opt-out (Profile toggle). Unset = no-op + log,
    exactly like `PushService`.
  - API (optional, Object storage — STRONGLY recommended in prod):
    `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
    (+ optional `S3_REGION`, default `auto`). Uploads then live in the
    bucket (R2 free tier works) instead of the EPHEMERAL Render disk that
    is wiped on every deploy. `libs/object-storage.ts`; unset = local-disk
    behavior unchanged. The `/uploads/:name` route still streams bytes
    itself so the share-aware ACL applies — never presign.
  - API (optional, Audit retention): `AUDIT_RETENTION_DAYS` (default 90;
    `0` disables the schedule). Once a day at 03:00 UTC the maintenance
    worker deletes AuditLog rows older than the window via the
    `wim-maintenance` BullMQ queue. The one-shot script under
    `src/scripts/prune-audit-log.ts` still works for manual runs.
  - Web: `VITE_API_BASE_URL` — **leave empty / deleted** in the dashboard.
    The `render.yaml` `/api/*` rewrite proxies browser requests through
    `wim-web.onrender.com` to the API, so the web app calls same-origin
    `/api` (the production fallback in `apps/web/src/services/api.ts` when
    the var is unset). Do **not** set this to the absolute `wimapi`
    URL — doing so bypasses the proxy and breaks Safari/iOS login (ITP
    blocks cross-site `Set-Cookie` from fetch/XHR).
- Render free-tier Postgres expires after ~30 days and the API container
  cold-starts in ~30 s. The fetch timeout in `apps/web/src/services/api.ts`
  is 45 s for that reason. After a DB reset, re-seed admin via the
  temporary `/api/auth/bootstrap-admin` + `TestAdmin` button on the login
  screen (see Open items).

## Common commands

```bash
# from repo root
npm run lint                              # all workspaces
npm test                                  # all workspaces
npm --workspace apps/api run build        # tsc
npm --workspace apps/api run prisma:migrate          # create migration (dev)
npm --workspace apps/api run prisma:deploy            # apply (prod)
npm --workspace apps/web run build        # vite build (runs prebuild → sharp icons)
npm --workspace apps/web run dev          # local dev server
DATABASE_URL=... npm --workspace apps/api run promote:admin -- email@x   # promote

# Demo data: 100 realistic users × 100 articles + every feature populated
# (warranties/warranty-history/alerts/attachments/locations/tags/loans/
# insurance/maintenance/budgets/public links/shares/threads/transfers/
# sessions/audit log). Deterministic per SEED; all users
# share the password printed at the end. SEED_DEMO_RESET=true wipes first.
DATABASE_URL=... SEED_DEMO_RESET=true npm --workspace apps/api run seed:demo

# Tests beyond the default `npm test` (vitest unit suites):
# API integration (real Postgres) — self-skips unless the URL is set:
INTEGRATION_DATABASE_URL=postgresql://… npm --workspace apps/api run test:integration
# Web E2E (Playwright) — needs browsers (`npx playwright install chromium`);
# the config builds + previews the app, so no extra server is needed:
npm --workspace apps/web run test:e2e
```

## Conventions

- **i18n**: `apps/web/src/i18n/translations.ts` is the main dict (five
  languages: `en` / `fr` / `pt` / `es` / `nl`). New keys go into
  `apps/web/src/i18n/translations.extras.ts` to avoid churning the big
  file. `t()` lookup chain is `extras[lang] → translations[lang] →
  extras.en → translations.en → key`, so extras can also override an
  existing key for a copy fix.
- **Theming**: CSS variables in `apps/web/src/index.css`, five themes
  (`light` / `dark` / `ocean` / `cyber` / `sunset`) toggled via `data-theme` on
  `<html>`. Brand palette comes from the WIM shield logo (navy primary +
  orange accent). Shared components take their colors from `.ui-*` utility
  classes (`ui-card`, `ui-btn-primary`,
  `ui-badge-power`, etc.). A Tailwind bridge in `tailwind.config.js` maps
  semantic tokens (`bg-surface`, `text-muted`, `border-line`,
  `bg-primary text-primary-contrast`, etc.) onto those CSS vars so
  utility classes also resolve per-theme — same rule applies, never
  reach for `bg-blue-500`/etc. on a shared widget. Two traps when layering
  on a colored surface: (1) `.ui-card` sets `background-color` (not the
  `background` shorthand) precisely so a `bg-gradient-brand` can sit on the
  same element — don't switch it back to `background`, that resets
  `background-image` and kills the gradient; (2) `text-primary-contrast` is
  the contrast color *for a primary-filled button* and is near-black in the
  dark/ocean/cyber themes — for text on the brand gradient use `text-white`,
  which reads on every theme's gradient. `theme.tsx` keeps a single
  media-less `<meta name="theme-color">` in sync with the active theme's
  resolved `--bg` (read back from the computed style after `data-theme` is
  set, so it never duplicates hex codes) — that colors the mobile browser
  chrome + installed-PWA status bar to match `ocean`/`cyber`/`sunset`, not
  just the OS light/dark preference. `index.html` still ships the static
  `prefers-color-scheme` metas for the pre-hydration first paint. Each
  `:root[data-theme]` block also sets `color-scheme` (light theme → `light`;
  dark/ocean/cyber/sunset → `dark`) so native controls, scrollbars, and
  autofill render to match instead of staying light-on-dark.
- **Design system**: primitives live in `apps/web/src/components/ui/`
  (`Button`, `Field/Input/Textarea/Select`, `PageHeader`, `Tabs`,
  `ConfirmDialog`, `Badge`, `Card/Section`, `Stat`, `Pagination`,
  `Breadcrumbs`, `Segmented`, `Popover`, `Dropzone`, `CommandPalette`).
  Import from the barrel `components/ui`. `ConfirmDialog` with
  `tone="danger"` defaults focus to **Cancel** (not Confirm) so a reflexive
  Enter/Space can't fire an irreversible action; `Pagination` wraps its
  "page X / N" status in an `aria-live` region so screen readers hear page
  changes. `Field` threads `required` through its context so the control
  gets `required`/`aria-required` (the visual `*` is decorative), and the
  `Input` primitive blurs a focused `type="number"` on wheel so scrolling a
  form can't silently change a price/duration. Toasts cap the visible stack
  at `MAX_TOASTS` (oldest dropped) so a burst can't bury the UI. Counts use
  `utils/number.formatCount(n, language)` for locale grouping ("1,234" /
  "1 234"); money uses `utils/money.formatMoney`. Icons come from
  `lucide-react` (never emoji); the central nav-icon map is
  `src/lib/navItems.ts`.
  Self-hosted Inter Variable via `@fontsource-variable/inter`. Charts
  use `recharts`, lazy-loaded inside the Dashboard chunk only.
- **App shell**: `components/layout/{AppShell,Sidebar,TopBar,MobileDrawer,
  SettingsMenu}`. Sidebar collapse state persists in
  `localStorage["wim.sidebar.collapsed"]`. Nav entries carry a `group`
  (`inventory | planning | insights | collaborate | admin`) in
  `lib/navItems.ts`; `groupedNavItems()` buckets the visible items in
  `NAV_GROUPS` order and drops empty groups, and both Sidebar and
  MobileDrawer render one `role="group"` per bucket with a
  `t("nav.group.<group>")` heading (a hairline instead, on the collapsed
  rail). A new route goes in a group or it doesn't render. Language +
  theme live in `SettingsMenu` (gear → `Popover` → `LanguageThemeSelector
  layout="stack"`), shown at every breakpoint — don't put selects back in
  the header. `AppShell` also renders a `BackToTop` floating button
  (appears past 600px of scroll; smooth-scrolls up, instant under
  `prefers-reduced-motion`).
- **Lists that filter client-side fetch every page.** `/warranties`,
  `/alerts`, `/attachments`, `/locations`, `/shares/*` and
  `/shared/articles` return a bare array (no total) and default to 50
  rows. Never call their `getAll()` bare and treat the result as the whole
  list — go through `services/pagination.ts` `fetchAllPages((p, l) =>
  api.getAll(p, l))`, which walks at the 500-row API ceiling until a short
  page. The 51st warranty was invisible everywhere in the UI before this.
- **Side sheet for create/edit**: `components/common/Modal` takes
  `variant="side"` (right-anchored, full-height, scrolls itself; same
  focus-trap/Esc/scroll-lock contract as the centered dialog). The article
  form opens there from `ArticlesList` with `chrome="plain"` + a `titleId`
  the dialog's `aria-labelledby` points at. Prefer it over an inline form
  that pushes a list down the page.
- **Profile tabs**: `ProfileView` renders one panel at a time behind
  `Tabs`; the active tab is `?tab=` (`account | notifications | billing |
  sharing | security`) via `useSearchParams`, so deep links work and a
  tab the user lacks (billing for a USER, sharing without the feature)
  falls back to Account. Tests that reach a panel click its tab first.
- **Articles table**: item lifecycle status has its own `Status` column
  (ACTIVE as muted text, other states as a `Badge`); the `Warranty` column
  carries only the warranty badge. Description is one line (`line-clamp-1`,
  full text in `title`) and hidden below `xl`.
- **Route chrome**: `components/layout/RouteChrome` is mounted once next to
  `<App />` in `main.tsx` (inside the Router) and owns the cross-cutting
  per-navigation behavior: it sets a per-page `<title>` (`WIM · <page>`,
  from a pathname→i18n-key map), resets scroll to the top and moves focus to
  the `#main` landmark on forward/`PUSH` navigations, and announces the new
  page name through a visually-hidden `aria-live` region (an SPA route change
  is otherwise silent to assistive tech). On `POP` (browser Back/Forward) it
  deliberately skips the scroll/focus reset so the browser restores the
  prior scroll position — returning from an article detail to a long list
  keeps your place. `i18n.tsx` keeps `<html lang>` in sync with the active
  language for screen-reader pronunciation.
- **⌘K + shortcuts**: `AppShell` mounts a `CommandPalette` and registers
  global keys via `hooks/useHotkeys` — `mod+k` opens the palette
  (Navigate / Actions / Articles), `c` creates an article
  (`/articles?new=1`), `?` opens the `ShortcutsHelp` overlay, `g <key>`
  jumps to a nav section (`g a` → Articles, `g d` → Dashboard, etc.).
  `useHotkeys` ignores plain keys while typing in fields; `mod+k` still
  fires. `c`/`?`/`g _` are added per-nav-item via `visibleNavItems(role)`
  so admin-only routes only register for admins.
- **Notification bell**: `components/layout/NotificationBell` lives in
  the TopBar. Fetches `GET /api/alerts/notifications` on mount + every
  route change (no tight polling), shows an unseen count, and calls
  `POST /api/alerts/mark-seen` when opened to clear the badge. Each row
  offers 1d/7d/30d quick snooze and a "view article" link. Hidden if
  the endpoint errors so a client/server skew doesn't render broken.
- **Preferences**: cross-device prefs (`theme`/`language`/`dateFormat`/
  `currency`) live on the `User` row. The auth `/me` payload carries them;
  client providers (`theme/theme.tsx`, `i18n/i18n.tsx`,
  `preferences/preferences.tsx`) expose `hydrate*` to apply them on
  login without echoing back, and write user-initiated changes through
  to `PUT /api/profile/me/preferences` (debounced, best-effort).
  `currency` lives on the `preferences` provider too (hydrated from `/me`
  at login), so money views read it from context instead of each
  refetching `/profile/me` — the Profile currency change writes via
  `updateCurrency` and `hydrateCurrency`s the provider so every view
  updates without a reload. `localStorage` is the pre-auth cache +
  logged-out fallback. UI
  `density` (`comfortable | compact`) is per-device — purely cosmetic,
  no backend — toggled in Profile → Appearance, driving `data-density`
  on `<html>`.
- **Auth**: every request reads `tokenVersion` + `role` from DB in
  `authGuard` (one small select). Bumping `tokenVersion` invalidates
  every JWT for a user. Role changes propagate immediately without
  re-login.
- **Errors**: API uses `createHttpError(status, msg)` (utility in
  `apps/api/src/utils/http-error.ts`); the global error middleware
  serializes the `status` field. Frontend's `getErrorMessage(err,
  fallback)` reads `err.message` or falls back.
- **No email enumeration**: helpers that look up a user by email return
  the same error for "not found" as for "found but wrong role" (see
  `ShareService.createInvite`).
- **Status transitions are atomic `updateMany` with the precondition in
  the WHERE clause** (`status: "PENDING"`, `active: true`,
  `expiresAt: { gt: now }`), checking `count === 0` — never
  read-then-update, which races. See `assertNotExpired`,
  `ShareService.revokeInvite/updateShare/revokeShare`, `acceptInvite`.
- **Pre-auth challenge tokens are not sessions, and `authGuard` is what
  enforces that.** The TOTP challenge (`kind:"totp-challenge"`) and both
  WebAuthn challenges (`kind:"webauthn-reg"` / `"webauthn-auth"`) are signed
  with the *same* `JWT_SECRET` as session tokens, so a signature check alone
  cannot tell them apart — `authGuard` rejects any payload carrying a `kind`
  claim, because a session token never has one. This is load-bearing, not
  belt-and-braces: the TOTP challenge is issued after only a password (so
  accepting it would bypass the second factor), and
  `POST /auth/webauthn/login/options` is **unauthenticated** and mints one for
  any email supplied (so accepting it would be full account takeover from an
  email address alone, at whatever role the DB says). Neither challenge
  carries the `v` claim, so the `tokenVersion` comparison does not catch them
  on an account that has never been bumped — `tokenVersion` defaults to 0 and
  only increments on a password reset, email change or force-logout. Any new
  token minted off `JWT_SECRET` outside the session path must carry `kind`.
  Every `jwt.verify` call also pins `algorithms: ["HS256"]`.
- **Auth checks come BEFORE any state-mutating guard** (e.g. the lazy
  EXPIRED stamp in `assertNotExpired`) so an unauthorized caller can't
  trigger writes. Tests under "auth-before-expiry ordering" enforce it.
- **Serializable-transaction guards must re-read inside the tx**: a role
  snapshot taken before `$transaction` is stale by definition — the
  admin last-admin guards re-fetch the target's role inside the tx and
  keep the outer read only for audit metadata.
- **...and the guard must WRITE, not just read.** Serializable isolation
  detects read/write dependency cycles, so two transactions that only *read*
  the same count and write nothing have nothing to conflict on and both
  commit. A guard whose transaction contains no write therefore protects
  nothing once the operation it guards runs outside that transaction — which
  is the case in `ProfileService.deleteAccount`, where the deletion is
  deliberately chunked across many short transactions. That guard demotes the
  departing admin to USER *inside* the counting transaction: the write is what
  makes the isolation level bite, so a second admin deleting concurrently
  now sees a count of 1 and is refused. Without it both callers passed and the
  database could be left with no ADMIN at all — unrecoverable short of direct
  DB access, since `bootstrap-admin` only ever promotes its one seed email.
- **Timeout racing** goes through `utils/with-timeout.ts` (`withTimeout(p,
  ms, message)`), which cancels the timer when the promise settles; a
  hand-rolled `Promise.race` + `setTimeout` leaves it running.
- **Impossible-case branches are omitted.** Error handling and fallbacks
  live at system boundaries only.
- **Comments** describe *why*, not *what*, and are left out entirely where
  the name already says enough.

## Accessibility & UX conventions

These patterns are established throughout the frontend, and components
follow them consistently.

### ARIA roles on dynamic messages

- `role="alert"` on **every** `<p>`/`<div>` that shows an API or
  validation error. Screen readers announce it immediately on mount
  without focus movement.
- `role="status"` on success/confirmation messages (e.g. "Shared",
  "Copied"). Lower urgency than `alert` — screen reader announces on
  idle.
- `aria-atomic="true"` on `aria-live` regions whose entire text content
  changes at once (e.g. the "Page 2 / 5" counter in `Pagination`).
- `aria-busy={loading}` on `<button>` elements while their async
  operation is in flight. Pair with a `Loader2` spinner (from
  `lucide-react`) replacing or joining the icon.

### Input attributes

Every text `<input>` / `<Input>` carries these:

| Context | `inputMode` | `autoComplete` | `autoCapitalize` | `spellCheck` |
|---|---|---|---|---|
| Email field | `"email"` | `"email"` | `"none"` | `false` |
| New password | — | `"new-password"` | — | — |
| Current password | — | `"current-password"` | — | — |
| TOTP / OTP code | `"numeric"` | `"one-time-code"` | — | — |
| Price / duration / count | `"numeric"` | — | — | — |
| Search box | `"search"` | — | — | — |

File inputs used for uploads should carry an `aria-label` describing
what will be uploaded (e.g. `"Warranty proof document"`).

### Tooltips on truncated text

Any element with a `truncate` (or `line-clamp-*`) class that displays
**user-provided text** must also carry `title={value}` so the full
string is readable on hover and by AT. Applies to article names, tag
names, file names, job names, alert subjects, etc.

### Table headers

Every `<th>` in a data table must have `scope="col"` (column header) or
`scope="row"` (row header). The `scope` attribute is what makes a `<th>`
more than a bold `<td>` for screen readers.

### Icon-only status cells

When a table or list cell uses an icon or symbol (✓/✕, coloured dot,
etc.) to convey status, wrap it as:

```tsx
<span aria-hidden="true">{icon}</span>
<span className="sr-only">{t("accessibleLabel")}</span>
```

Add the `sr-only` translation key to `translations.extras.ts` for all
five languages.

### Character counters on textareas

Every `<Textarea>` (or `<textarea>`) that has a `maxLength` must show a
live counter directly below it:

```tsx
<p className="text-right text-xs ui-text-muted tabular-nums">
  {value.length} / {maxLength}
</p>
```

Use `tabular-nums` so the counter doesn't shift layout as digits change.

### No `autoFocus` prop — use a ref instead

`jsx-a11y/no-autofocus` is active in the ESLint config. Use
`useRef` + `useEffect` with `setTimeout(0)` to focus after mount:

```tsx
const ref = useRef<HTMLInputElement>(null);
useEffect(() => {
  if (condition) setTimeout(() => ref.current?.focus(), 0);
}, [condition]);
<input ref={ref} ... />
```

### `useId()` for label/control association

Components that render in **more than one place** (e.g.
`LanguageThemeSelector` appears in the TopBar `SettingsMenu` popover and in
`LoginForm`) must use `useId()` from React for their label `htmlFor`/`id` pairs
instead of static strings — otherwise the DOM contains duplicate ids.

### Skeleton during loading, not null

When a section fetches data before it can render, show a skeleton
placeholder (`animate-pulse` rows or boxes) rather than returning
`null` or nothing. This prevents layout shift and tells users content
is loading. See `SecuritySection` and `NeedsAttention` for reference.

### Download-success feedback

After a successful file download, briefly swap the download icon for a
`Check` icon (import both from `lucide-react`) for ~2 seconds using a
`downloaded` boolean state and `setTimeout`. This confirms to the user
that the action completed.

```tsx
const [downloaded, setDownloaded] = useState(false);
// after success:
setDownloaded(true);
setTimeout(() => setDownloaded(false), 2000);
// in JSX:
{downloaded ? <Check ... /> : <Download ... />}
```

### Textarea for multi-line content, not Input

Any field that can hold more than one line of user text (notes, claim
descriptions, template descriptions) must use `<Textarea rows={N}>`
from the design system, never `<Input type="text">`. A single-line
input becomes unusable at 500–2000 characters.

### Segmented for mutually-exclusive view toggles

Filters that switch between a fixed set of mutually-exclusive views use the
`<Segmented>` component, which implements `role="radiogroup"` + `role="radio"`
with roving tabindex and Arrow/Home/End keyboard nav. A plain `<button>` group
carries none of that semantics.

### CSV parser — quote-open only at field start

The `parseCSV` helper in `apps/web/src/utils/csv.ts` only enters quoted
mode when the `"` character appears at the very start of a field
(`field === ""`). A `"` mid-field (e.g. an inch mark in `Sony 50"`) is
a literal character and must not swallow the delimiter that follows it.
Preserve this invariant if the parser is ever modified.

### Manual `validateForm()` ⇒ the `<form>` needs `noValidate`

Any form that does its own validation MUST put `noValidate` on the
`<form>`. This covers **both** the `validateForm()`-with-field-`errors`
shape **and** the inline shape that bails out of `handleSubmit` with a
single `setFormError(...)` + early `return` (don't grep only for
`validateForm` — `ArticleForm` uses the inline shape and was missed once
because of that). Otherwise the browser's native HTML5 constraint
validation (`required`, `type="email"`/`type="url"`, `min`/`max`,
`minLength`) runs **first** and silently blocks submit on an invalid field —
so `handleSubmit` never fires, the custom validation never runs, and the
app's own localized, styled error never renders. The user instead gets a
native browser bubble (wrong language, off-theme). This bit `WarrantyForm`
(duration `min`/`max`), `ShareForm` (`type="email"` + the `Field required`
prop, which threads `required` onto the control), and `ArticleForm`
(`required` name/model + `type="url"` + price/depreciation `min`/`max`) —
all fixed by adding `noValidate`. When you add `noValidate` to a form that
leaned on native `min`/`max`/range constraints, **move those range checks
into the submit handler** too, or you trade a native bubble for no
validation at all (see `ArticleForm`'s price ≥ 0 / depreciation 0–100
checks). `LoginForm` already does this for its Zod path. Forms that
intentionally rely on native validation with **no** custom field messages
(e.g. `TransferDialog`, `ForgotPasswordForm`, `CreateUserModal`,
`ResetPasswordModal`, the admin grant form) are fine as-is — don't add
`noValidate` there, or you'd drop their only validation.

## Warranty lifecycle (renew / extend / history)

- `Garantie` enforces 1:1 with an article (`garantieArticleId` unique).
  Renewal **rolls the live row forward** — we never insert a second
  warranty for the same article. `Garantie.renewedAt` is bumped on the
  first renewal/extension; null = never renewed.
- `WarrantyHistory` (append-only) snapshots the prior contract on each
  change (`event`: `RENEWED | EXTENDED | REPLACED`,
  `priorDateAchat/Duration/Fin`, optional `note`). The web UI walks it
  newest-first to render the chain.
- `POST /api/warranties/:id/renew` swaps a fresh `garantieDateAchat` +
  `garantieDuration` (+ optional provider patch);
  `POST /:id/extend` rolls `garantieFin` forward by N months in place
  (bumps `garantieDuration` to keep the `addMonths(dateAchat,
  duration)` invariant); `GET /:id/history` returns the chain.
- Both renew + extend reuse the existing
  `AlertService.rescheduleForWarranty` so J-30/J-7/J-1 reminders
  re-fire against the new end date — no duplicate scheduling code.
- Audit actions `WARRANTY_RENEW` / `WARRANTY_EXTEND` are in the
  `AUDIT_ACTIONS` union in `packages/types/src/index.ts`.
- Web: `RenewWarrantyDialog` is launched from the Article-detail
  warranty block, the Dashboard "Needs attention" rows, and
  `WarrantiesView`. The shared status badge + `Segmented` filter
  classify the end date via `utils/warrantyStatus.warrantyStatusFor`
  (`active` / `expiringSoon` / `expired` / `none`), so the badge in a
  row and the filter pill can never disagree.

## Item lifecycle status

- `Article.status` (`ArticleStatus` enum: `ACTIVE` default / `IN_REPAIR` /
  `LOANED` / `SOLD` / `DISPOSED` / `LOST`) is an organizational axis
  orthogonal to the trash/soft-delete one — status'd items stay in the live
  list, are badged, and can be filtered (`?status=`), but aren't hidden.
  Mirror the enum in three places when changing it: `prisma/schema.prisma`,
  `ARTICLE_STATUSES` in `@wim/types`, and `utils/articleStatus.ts` (badge
  tone + label-key map). Web badge is suppressed for `ACTIVE`
  (`isDefaultStatus`) so dense rows stay clean.
- **Value totals reflect current holdings**: `NOT_OWNED_STATUSES`
  (`SOLD`/`DISPOSED`/`LOST`) are excluded from every *value* figure — the
  dashboard inventory/current/at-risk/per-location/per-tag value
  (`statistics.service.ts` `ownedValueScope`/`ownedArticleRelation`), the
  **Locations list** `totalValue` (`location.service.ts` `list`) and the
  portfolio report — while **counts keep them** (you still have the record).
  The Locations list is the one that drifted: it filtered only `deletedAt`,
  so its per-location total and `/locations/value`
  (`getLocationBreakdown`, which excludes them) disagreed the moment an item
  was marked SOLD. Note the `_count` on the same query is deliberately NOT
  narrowed this way — count and value follow different rules on purpose.
  Any new value figure needs both the status exclusion and integer-cent
  accumulation (below).
  `IN_REPAIR`/`LOANED` are still owned, so they count. Every value figure is
  `purchasePrice × quantity` (per-unit price — see Round 6); counts stay
  per-record regardless of quantity.
- **Article category** (`Article.category`, `ArticleCategory?` enum) is an
  optional broad bucket (null = uncategorized) complementing free-form tags.
  Same mirror rule as status (`schema.prisma` / `ARTICLE_CATEGORIES` in
  `@wim/types` / `articleCategory.*` i18n keys). Filterable (`?category=`),
  carried in the CSV export, and bucketed into the analytics `byCategory`
  chart (key `UNCATEGORIZED` for items with no category).

## Reports & insurance portfolio

- `GET /api/reports/portfolio.pdf` streams an insurance-ready PDF via
  PDFKit (cover totals, per-location manifest, uninsured/expired list
  sorted by value desc). Honors the same filters as the article list
  (`locationId`, `tagId`, `warrantyStatus`, `status`). When `status` is
  unset the report excludes `NOT_OWNED_STATUSES` so the manifest is current
  holdings; pass an explicit `status` (e.g. `LOST`) to scope a claim report.
  Auth-gated + destructive-rate-limited; audited as `DB_EXPORT` with
  `metadata.report="portfolio"`.
- Totals use the **same `currentValue`** depreciation helper as the
  dashboard + claim PDF (`apps/api/src/modules/common/depreciation.ts`),
  so figures don't drift between surfaces.
- **Money is accumulated in integer cents, never by adding floats.**
  `statistics.service.ts` and `location.service.ts` both fold
  `Math.round(price * 100) * qty` and divide by 100 at the end. Adding
  scaled floats instead drifts: 0.01 + 0.14 comes out as 0.15000000000000002.
  Most 2-decimal pairs do *not* drift, so a test for this has to use a pair
  that actually does or it passes either way and proves nothing.
- **Insurance-aware** (additive — the warranty-based "uninsured/expired"
  exposure section is unchanged): one owner-scoped `ArticleInsurance` query
  over the report's articles drives a have/lack-a-policy count on the cover,
  an "insured: <provider>" / "no policy" tag per manifest line, and a
  separate "Items with no insurance policy" list by value desc. This is the
  real `InsurancePolicy` coverage gap, distinct from warranty status (an
  item can have a live warranty yet no policy, and vice-versa).
- Inventory CSV (`/articles/export/inventory.csv`) gains a read-only
  `currentValue` column computed at export time; the importer ignores
  unknown columns so the round-trip stays clean.
- Web: lazy `/reports` route (`components/reports/ReportsView.tsx`)
  with four Selects (location/tag/warranty/status) + `downloadBlob`. Nav
  item `reports` added to `src/lib/navItems.ts` for every authenticated user.

## Spending & value analytics

- `GET /api/statistics/analytics` (gated `analytics`, POWER_USER default) is
  the paid BI surface that complements the free operational dashboard. One
  `findMany` over priced, currently-owned articles
  (`getPortfolioAnalytics` in `services/statistics.service.ts`), bucketed in
  memory into: spend-over-time by acquisition month (`garantieDateAchat ??
  createdAt`) with a running **cumulative** total (the "portfolio value over
  time" trend, baseline-seeded from pre-window spend), spend by location +
  tag, and the top items by current depreciated value. Trailing 24-month
  window. Excludes `NOT_OWNED_STATUSES`, same as the dashboard value rule.
- Web: lazy `/analytics` route (`components/analytics/AnalyticsView.tsx`),
  recharts (own chunk), gated nav item + upgrade teaser like `reports`.
  `PortfolioAnalytics`/`SpendBucket`/`ValuedArticle` shapes live in
  `@wim/types`.

## Per-item lifecycle add-ons (loans / insurance / maintenance)

Three owner-scoped, paid (POWER_USER-default) modules that hang off an
article, all following the same shape: an append-only/owner-scoped table, a
service with `assertArticleOwned`/`assert*Owned` checks, a thin route module
mounted in `app.ts`, and a **best-effort** reminder via
`AlertService.createCustom` (a Redis hiccup is caught + logged, never fails
the write — mirrors `PushService`). Each owns an audit entity in
`@wim/types` `AUDIT_ENTITIES` (`Loan` / `InsurancePolicy` / `ServiceRecord`)
and a web section on the article-detail page that renders a
`LockedFeatureNotice` when its flag is off.

- **Loans** (`Loan`, `modules/loans/`): who borrowed an item + when it's due
  back. Creating a loan sets the article `LOANED`; `markReturned` reverts to
  `ACTIVE` **only if still `LOANED`** (atomic `updateMany` precondition so a
  manual status change isn't stomped) and cancels the due-date reminder.
  `markReturned`/`delete` use atomic `updateMany`/owned-row checks. Routes:
  `GET/POST /api/loans`, `POST /:id/return`, `DELETE /:id` (return + delete
  ungated for cleanup). Web `LoanSection` + `loansAPI`; `LoanItem` in types.
- **Insurance** (`InsurancePolicy` + `ArticleInsurance` join, `modules/
  insurance/`): provider / policy number / premium / coverage limit /
  renewal date, covering **many** articles (m2m). A renewal date schedules a
  reminder, **rescheduled** on edit (`"renewalAt" in data` patch check) and
  cancelled on delete. CRUD under `/api/insurance` + link/unlink at
  `/:id/articles[/:articleId]` (policy delete + unlink ungated). Web: lazy
  `/insurance` route (`InsuranceView`, gated nav item w/ lock) for policy
  management + `InsuranceSection` on article-detail to link existing
  policies. `InsurancePolicyItem`/`InsuredArticleRef` in types.
- **Maintenance** (`ServiceRecord`, `modules/service-records/`): append-only
  service log per item (date / description / cost / provider / optional
  next-service date → reminder). `GET /api/service-records?articleId=`
  lists one item's log; **`GET /api/service-records/due`** returns the
  *latest* record per article whose `nextDueAt` is within 30 days or overdue
  (a later service with no `nextDueAt` clears an earlier schedule). Delete
  ungated. Web `MaintenanceSection` + `serviceRecordsAPI`; `ServiceRecordItem`
  / `ServiceDueItem` in types.

The dashboard `AttentionExtraCard` (`components/dashboard/`) folds the three
time-sensitive signals — overdue loans, insurance renewals due/lapsed, and
services due/overdue — into one self-hiding card; each feed is independently
flag-gated (skips its fetch when not entitled).

## Spend budgets

- Optional per-user `monthlyBudget` / `annualBudget` (`Decimal?` on `User`),
  set via `PUT /api/profile/me/budget` (Profile → Budget) and read via
  `GET /api/statistics/budget` (`getBudgetStatus`). Both gated on the
  `budget` feature. Spend = sum of purchase prices for currently-owned,
  priced items acquired (`garantieDateAchat ?? createdAt`) in the current
  calendar month / year — the **same** acquisition-date rule as analytics, so
  figures agree across surfaces. `BudgetStatus` in `@wim/types`.
- Web: the dashboard `BudgetCard` (self-hides when no budget set or flag off)
  shows month + year progress bars with an over-budget warning.

## Public item page + QR labels

- Opt-in per-article `Article.publicToken` (nullable, unique 64-hex). The
  owner mints/rotates/disables it from the article-detail `PublicLinkSection`
  (gated `public_page`), which renders a shareable `/i/<token>` link plus a
  **client-generated** QR code (the `qrcode` web dep — built from
  `window.location.origin` so the QR always targets the right front-end host
  without the API knowing it).
- `GET /api/public/items/:token` (`modules/public/`) is **unauthenticated**
  (the token is the credential, like the calendar ICS feed) and returns only
  a privacy-safe subset — name / brand / model / photo / category + a coarse
  warranty-active flag — **never** price, serial, owner, or location. The
  public web page lives at `/i/:token` and is matched **before** the auth
  gate in `App.tsx` (so it renders without `/auth/me`). `PublicItem` in
  `@wim/types`; supertest covers the route's privacy contract.
- Owner-side generate/revoke is in `articles/public-link.routes.ts`, mounted
  under `/api/articles` **before** the `/:id` catch-all (POST gated; GET
  status + DELETE stay open for cleanup).

## Feature pack (2026-07)

Smaller features added in one batch; each follows the existing patterns.

- **Custom warranty reminder offsets**: `User.warrantyReminderDays` (CSV,
  e.g. "90,30,7"; null = J-30/J-7/J-1 default). `alert.scheduler.ts` exposes
  `parseReminderDays` + takes an `offsets` param; `Alerte.reminderDays` pins
  each row's offset so job-cancellation can rebuild the exact BullMQ job id
  (legacy rows fall back to trying the three default kinds). `PUT
  /api/profile/me/reminder-days` saves + re-arms every live warranty
  (best-effort per warranty). Profile → Notifications hosts the editor.
- **Notes in search**: the article `q` filter also matches `ArticleNote`
  content (no trigram index on notes — acceptable, notes tables are small).
- **Purchase provenance**: `Article.purchasedFrom` + `orderRef` (optional,
  private — never crosses the sharing boundary). In the form, detail header,
  CSV export/import round-trip.
- **Email verification (soft)**: `User.emailVerifiedAt` +
  `EmailVerificationToken` (sha256, mirrors PasswordResetToken).
  Registration + email-change send best-effort links; `POST
  /auth/verify-email` consumes (open; token is the credential), `POST
  /auth/verify-email/request` re-sends (authed). NOTHING hard-gates on it
  (email transport is optional). Web: `/verify-email` renders pre-auth-gate;
  Profile shows a verified badge / re-send button.
- **Personal data export**: `GET /api/profile/me/export` — full-account JSON
  (articles + warranty/history/notes/attachment-metadata, loans, insurance,
  service records, alerts, locations, tags, saved views, templates,
  wishlist). Not feature-gated (data portability); rate-limited + audited as
  DB_EXPORT. Profile → Export panel row.
- **Nested locations**: `Location.parentLocationId` self-relation (SetNull on
  parent delete — children float to root). `assertValidParent` walks the
  ancestor chain to block cycles. Web: parent select in create/edit +
  "Home › Garage" path prefix in the list.
- **Recurring maintenance**: `ServiceRecord.intervalMonths`; when set and no
  explicit `nextDueAt` is given the service derives it (`performedAt` +
  interval), so routine jobs re-arm on every log entry.
- **Lost & found**: public item payload carries `isLost` (coarse boolean,
  only when status=LOST). `POST /api/public/items/:token/found-report`
  (unauthenticated, destructive-rate-limited, 1-per-article-per-hour dedupe)
  records a SCHEDULED CUSTOM alert due now (visible in the bell until
  dismissed) + best-effort push/email. Finder and owner stay mutually
  anonymous.
- **Wishlist** (`WishlistItem`, `modules/wishlist/`): planned purchases with
  optional target price/link/note; `purchasedAt` strikes through instead of
  deleting. List/create/update gated on `wishlist`; mark-purchased + delete
  stay open (cleanup rule). Web: lazy `/wishlist` route + nav item (Gift),
  budget-fit hint line when the `budget` flag is on and a monthly budget is
  set.
- **Barcode lookup**: still client-side by design (see barcodeLookup.ts
  comment), now tries Open *Products* Facts (general goods) before Open Food
  Facts. Still opt-in via `VITE_FEATURE_BARCODE_LOOKUP=1`.
- **Round 2 (2026-07)**: object storage for uploads (see env note above);
  claim PDF embeds up to 4 gallery photos + provenance (storage-aware via
  `readUploadBytes`); `GET /api/statistics/household` + dashboard
  `HouseholdCard`; ⌘K palette also searches locations/tags/wishlist
  (best-effort per leg, AppShell `searchPalette`); `POST
  /profile/me/totp/backup-codes` regenerates backup codes
  (password-gated); destructive/create rate limiters key on the hashed
  auth token with IP fallback (`userOrIpKey` in config/security.ts); PWA
  manifest ships app shortcuts; the demo seeder now covers wishlist/
  households/provenance/recurring-maintenance/reminder-offsets/
  emailVerifiedAt.

## Round 3 (2026-07): passkeys + receipt OCR (both free, no external APIs)

- **Passkeys (WebAuthn)**: `WebAuthnCredential` table;
  `modules/auth/webauthn.routes.ts` (mounted inside auth.routes, so the
  auth rate limiter applies). Challenge = short-lived signed JWT (mirrors
  the TOTP challenge pattern — `kind` separates reg/auth). rpID/origin come
  from `APP_URL` (Origin header fallback in dev). Passkey login satisfies
  2FA. Web: `startAuthentication`/`startRegistration` lazy-imported;
  "Sign in with a passkey" on LoginForm (email-first), `PasskeysPanel` in
  Profile → Security. Enumeration-safe options for unknown emails.
- **Receipt scan → autofill**: tesseract.js OCR runs entirely client-side
  (lazy chunk + on-demand language data; photo never leaves the device).
  `utils/receiptParse.ts` is the pure heuristic parser (total/date/merchant,
  EU decimal-comma + day-first aware — unit-tested); `ReceiptScanner` modal
  in ArticleForm prefills price / purchasedFrom / warranty purchase date,
  never overwriting user-typed values.

## Round 5 (2026-07): tag colors + client-side image compression

- **Tag colors**: `Tag.color` (`#RRGGBB` hex, nullable; validated at the API
  boundary — null = default neutral badge). `PUT /api/tags/:id` now patches
  `name` and/or `color` (`TagService.rename` renamed to `update`; `color: null`
  clears). The article-include `tags` select carries `color` so colored badges
  render on the detail page + list rows. Web: preset swatch picker in
  `TagsManager` (edit row), shared `components/articles/TagChip` (fills the pill
  with the color and flips text to black/white by luminance; falls back to the
  neutral `Badge` when no color), colored dots in the `ArticleForm` tag toggles.
- **Client-side image compression**: `utils/imageCompress.ts` downscales large
  raster photos (jpeg/png/webp > ~300 KB) to a ≤1600px JPEG via a canvas before
  upload. Wired once inside `attachmentsAPI.uploadFile`, so every call site
  (gallery add, warranty proof, quick-add) benefits. No-op for PDFs/SVG/GIF,
  small files, or when the canvas path is unavailable; only replaces the
  original when the re-encode is actually smaller — never blocks an upload. The
  server's magic-byte check + sharp thumbnail still run on whatever arrives.
## Round 10 (2026-07): claim attachments + saved-view sharing + location value

- **Warranty claim attachments**: `AttachmentType` gains `CLAIM` (migration
  `20260712000000_claim_attachments_saved_view_flags`). The upload route now
  accepts a `garantieId` field alongside `type`, so claim evidence links to the
  warranty (`assertWarrantyOwned` already gated it). Listed via
  `GET /attachments?garantieId=` (rows carry `type`, filtered to CLAIM
  client-side), managed in the article-detail claim block (`ArticleDetail` —
  upload/list/delete, only when a claim is open), and the **claim PDF embeds up
  to 4** under "Claim evidence" (`article.pdf.ts`, via `garantie.attachments`
  where `type:"CLAIM"`). `attachmentsAPI.uploadFile` gained a `garantieId`
  option. i18n `claim.evidence.*`.
- **Saved-view default + household sharing**: `SavedView.isDefault` +
  `sharedWithHousehold` (same migration). `PATCH /api/saved-views/:id`
  (`setDefault` clears siblings in a tx — one default per owner; `setShared`
  toggles the flag); `GET /api/saved-views/shared` returns household peers'
  shared views (via `householdMember` lookup, carrying `ownerName`). Web:
  `ArticlesList` star = default (auto-applied on a fresh landing with no URL
  filters, once, via `didApplyDefaultRef`), Share2 = household-share; shared
  peers render as read-only `Users`-icon chips. `savedViewsAPI.patch`/
  `listShared`. i18n `savedViews.setDefault/unsetDefault/share/unshare/sharedBy`.
- **Location value dashboard**: `GET /api/statistics/locations` (gated
  `analytics`) → `getLocationBreakdown` returns per-location `{ articleCount,
  value, expiringCount, expiredCount, parentLocationId }` + an `unlocated`
  bucket, same owned-scope + per-unit × quantity value rule as the dashboard.
  Web: lazy `/locations/value` route (`LocationValueView`, recharts `Treemap`
  in its own chunk) + gated nav item (`MapPinned`, `locationValue` key) + table
  with the nested "Home › Garage" path. `LocationBreakdown`/`LocationValueEntry`
  in `@wim/types`. i18n `locationValue.*` + `nav.locationValue`.

## Round 9 (2026-07): bulk enums + provider autofill + item bundles

- **Bulk status/category/condition edit**: `bulkUpdate` (service/route/schema)
  now also accepts `status` (set-only, NOT NULL), `category`, and `condition`
  (both nullable → `null` clears) alongside the existing scalar set.
  `BulkEditDialog` renders the three as tri-state `<Select>` rows
  (`renderEnumRow`; status hides the Clear op). Reuses `articleStatus.*`/
  `articleCategory.*`/`articleCondition.*` i18n labels.
- **Warranty provider autofill**: `GET /api/warranties/providers`
  (`WarrantyService.distinctProviders`, deduped by name keeping the newest
  contact, sorted) feeds a `<datalist>` on the provider-name field in
  `WarrantyForm`; picking a known name fills the still-empty phone/url and
  **never** overwrites a value the user already typed.
- **Item bundles**: `Article.bundle` (`String? @db.VarChar(80)`, free-text) +
  migration `20260710000000_article_bundle`. Groups related items (a camera
  body + its lenses). Flows through create/update via the normal `...articleData`
  / `...patch` spread (only `duplicate()` copies it explicitly); filterable
  `?bundle=<label>` (exact match, `buildArticleWhere`); CSV round-trip.
  `GET /api/articles/bundles` (`distinctBundles`) returns the owner's distinct
  labels (sorted) for the `ArticleForm` datalist + the `ArticlesFilterBar`
  Select (only renders when the owner has bundles). `ArticleDetail` shows a
  "bundled with" sibling list by reusing the list endpoint filtered on the
  label (client-side excludes the current article). i18n keys under
  `articleForm.bundle*` / `articles.filter.bundle.*` / `articleDetail.bundle*`
  (5 languages). Organizational only — no value impact.
- **Latent fix**: `articlesAPI.getAll` never serialized the `condition` filter
  into the query string (added round 8), so the condition filter pill silently
  did nothing; round 9 wires both `condition` and `bundle` into the query.

## Round 8 (2026-07): condition + calendar-feed parity + maintenance spend

- **Item condition**: `Article.condition` (`ArticleCondition?` enum —
  `NEW`/`EXCELLENT`/`GOOD`/`FAIR`/`POOR`, null = unspecified) + migration.
  Additive/organizational like category — **never** touches value math. Same
  three-place mirror rule (`schema.prisma` / `ARTICLE_CONDITIONS` in
  `@wim/types` / `utils/articleCondition.ts` badge-tone map + `articleCondition.*`
  i18n). Filterable (`?condition=`), in the CSV round-trip (importer normalizes
  a free-form cell against `ARTICLE_CONDITIONS`), on the form Select + a
  detail-hero badge + the filter bar.
- **Calendar ICS feed parity**: `feedForToken` now emits loan-return,
  insurance-renewal, and maintenance-due events alongside warranties/alerts/
  claims, so the subscribed `.ics` matches the in-app agenda's five sources.
  Stable per-row UIDs (`loan-<id>@wim` etc.) so calendar clients don't
  duplicate; maintenance uses the latest-record-per-article rule like the
  agenda. **The feed is bounded**: every leg filters to a ±365-day window
  (wider on the past side than the agenda's 30 days, because a calendar is a
  scrollback surface), and the event list is capped at 1000 — dropping
  furthest-from-today first, so an over-cap feed keeps the dates that matter
  instead of truncating the future. This is not optional polish: subscribed
  clients re-fetch the whole document every 15–60 minutes, and before the
  window the feed serialized the account's entire history on each poll. The
  maintenance leg can't be filtered on `nextDueAt` (a *newer* record with a
  null `nextDueAt` is exactly what clears an older schedule, so those rows
  have to be read), so it's bounded by row count on an `articleId`-major
  ordering — a truncation then drops whole trailing articles rather than
  cutting one article's history in half and mis-resolving its latest record.
- **Maintenance spend**: dashboard `maintenanceSpend` = SQL `_sum(cost)` over
  `ServiceRecord.performedAt` in the trailing 12 months (live articles); a
  self-hiding money Stat tile (only when > 0). `MaintenanceSection` shows a
  per-article "total spent" line summed client-side from the fetched records.

## Round 7 (2026-07): agenda + favorites + bulk-quantity

- **In-app agenda**: `GET /api/calendar/agenda` (`CalendarService.agenda`,
  authGuard, ungated — same free signals as the dashboard) aggregates upcoming
  and still-actionable overdue events across warranties (`garantieFin`),
  maintenance (latest `ServiceRecord.nextDueAt` per article — a newer record
  with no next-due clears an older schedule), loans (`Loan.dueAt` unreturned),
  insurance (`InsurancePolicy.renewalAt`), and scheduled alerts. Forward window
  365d; warranties/alerts use a 30-day past window, loans/maintenance/insurance
  include any overdue; sorted ascending, capped 200. `AgendaEvent` in
  `@wim/types`. Web: lazy `/agenda` route + nav item (`CalendarClock`),
  `components/agenda/AgendaView.tsx` groups into Overdue / This week / This
  month / Later, each event linking to its article.
- **Favorites**: `Article.isFavorite` (`Boolean`, default false) + migration.
  `POST /articles/:id/favorite {favorite}` (atomic `updateMany`, precondition
  in WHERE); list filter `?favorite=1` (only "1"/"true" enables it). Web:
  optimistic star toggle on the detail hero + table/card rows, a Favorites
  pill in the filter bar. Ungated.
- **Quantity in bulk-edit + units stat**: `bulkUpdate` (service/route/schema)
  now accepts `quantity` (≥1, set-only — the column is NOT NULL so there's no
  "clear"); `BulkEditDialog` adds a quantity row with the clear option hidden
  (`noClear`). Dashboard `articles.totalUnits` = SQL `_sum(quantity)` over live
  rows (single-column, so a plain aggregate is fine); the dashboard row is
  hidden when units == records so single-unit inventories stay unchanged.

## Round 6 (2026-07): per-item quantity

- **Quantity**: `Article.quantity` (`Int`, default 1) + migration. Product
  decision: **`purchasePrice` is the PER-UNIT price**, so every value figure is
  `price × quantity`. Threaded through every value surface — the dashboard
  (`statistics.service.ts`: the two `_sum(purchasePrice)` aggregates became
  `findMany` + in-memory `price × qty` because SQL `_sum` can't multiply two
  columns; per-location/tag/`valueArticles`/current-value all `× qty`),
  analytics (`getPortfolioAnalytics`), budget (`getBudgetStatus`), household
  (`getHouseholdStatistics` groupBy `_sum` → `findMany` per-owner fold), the
  per-location value in `location.service.ts`, and both PDFs (portfolio +
  claim/inventory manifest). **Counts stay per-record** (a 6-unit row is still
  one article). Multipliers use `Math.max(1, quantity ?? 1)` (belt-and-
  suspenders — the column is NOT NULL default 1). CSV export adds a `quantity`
  column and the importer round-trips it. Duplicate copies quantity. Web:
  numeric input in `ArticleForm`; the detail hero shows line-total Value /
  Current value (with a "N × unit" hint) + a Quantity stat and passes
  `price × qty` into the value curve, all suppressed for the qty=1 case so
  single-unit records look unchanged. Demo seeder makes ~15% of items
  multi-unit.

## Round 4 (2026-07): inventory check + custom fields

- **Inventory check**: `Article.lastVerifiedAt` (null = never). `POST
  /articles/:id/verify` + `POST /articles/bulk-verify` stamp it via atomic
  `updateMany` (precondition in WHERE — the standard rule). List filter
  `?verification=needed|verified` ("needed" = null or >12 months, same
  12-month rule as the dashboard's `articles.needsVerification` count so the
  nudge and the filtered list agree). Web: cell + "Mark as verified" on the
  detail hero, bulk-bar action, filter Select, dashboard System-health nudge
  linking to `/articles?verification=needed`. Ungated (core inventory action,
  like bulk-assign). CSV export column is read-only on round-trip.
- **Custom fields**: `Article.customFields` JSONB — ordered `{key,value}[]`,
  bounded by `CustomFieldsSchema` (≤20 pairs, key ≤40, value ≤500). Private
  like purchasedFrom (sharedArticleSelect never includes it). Clearing on
  update needs `Prisma.DbNull` (plain null is rejected by the Json input
  type). Duplicate copies them; CSV round-trips them as a JSON cell (importer
  parses + validates per-row; bad cell = row error surfaced in the dry-run
  preview). Web: key/value rows editor in ArticleForm (private-badged),
  dl display on the detail hero.
- The article-detail **value curve** (`ValueOverTime` in ArticleDetail.tsx)
  predates this round — dependency-free inline SVG; don't add recharts there.

## Account security (login history → sessions → 2FA)

Three independent slices; the password-only login path is byte-for-byte
unchanged when `User.totpEnabled = false`.

- **Login history**: `GET /api/profile/me/login-history` selects the
  caller's last 50 LOGIN/LOGOUT rows from `AuditLog` (no schema —
  reuses the `(userId, createdAt DESC)` compound index).
- **Sessions**: new `UserSession` table — one row per signed-in device,
  keyed by the JWT `jti`. `signTokenWithJti` exposes the jti the
  session row needs while `signToken` keeps its old single-string
  shape for the password-change refresh path. `authGuard` calls
  `SessionService.touch(jti)` (fire-and-forget, throttled to 1/min
  per jti) so "active N minutes ago" stays honest. Endpoints:
  `GET /api/profile/me/sessions` (returns `{ items, currentJti }` so
  the UI can mark "this device"); `DELETE /api/profile/me/sessions/:id`
  (revokes via the existing `denyToken` + sets `revokedAt`);
  `POST /api/profile/me/sessions/revoke-others`.
  Denylist TTL on revoke is always the JWT max lifetime (7d):
  `UserSession` doesn't store each token's own `exp`, and using the
  *caller's* exp once let a revoked session reactivate when the
  caller's token expired first — the fixed TTL is deliberate, not an
  oversight.
  **Identity changes invalidate sessions**: email change (self-serve
  `PUT /profile/me/email` or admin `PATCH /admin/users/:id`) bumps
  `tokenVersion` exactly like a password change; the self-serve route
  reissues a fresh cookie so the calling device stays signed in.
- **TOTP 2FA**: `User.totpEnabled` (fast-path flag) + `TotpSecret`
  (base32 secret + bcrypt-hashed single-use backup codes + verified
  flag). Setup → verify → disable, all password-gated. Login: when
  `totpEnabled` is true, `/auth/login` returns a 5-minute pre-auth
  `challengeToken` (`kind:"totp-challenge"` so it can't be mistaken
  for a session — **`authGuard` enforces that by rejecting any token
  carrying a `kind` claim**; see the pre-auth token rule below) instead
  of dropping a cookie; the client POSTs the
  code to `/auth/login/verify-totp` to mint the real session cookie +
  `UserSession`. `otplib` is pinned at `^12.0.1` (v13 dropped the
  named `authenticator` export). `TotpService.verify` checks the code
  *before* the already-verified early return — an idempotent re-verify
  must still require a valid code.
- Web: `Profile → Security` mounts `SecuritySection` (sessions list +
  login history) and the `TwoFactorPanel` wizard.

## Article power features

- **Bulk field edit**: `POST /api/articles/bulk-update` patches a
  scalar field set (`purchasePrice`, `depreciationRate`, `brand`,
  `serialNumber`) across a selection — `null` clears, missing keys
  leave alone. Per-row ownership + trashed-row skip in a single
  transaction. Web: an "Edit fields" button on the ArticlesList bulk
  bar opens `BulkEditDialog` with a tri-state row per field
  (Skip / Set to… / Clear).
- **Article templates**: `ArticleTemplate` table (ownerUserId, name,
  JSONB payload). Payload stores `locationNames`/`tagNames` (not ids)
  so a template survives a rename/delete; the form resolves names →
  live ids at apply time. Endpoints under
  `/api/article-templates` (CRUD). Web: `TemplateBar` at the top of
  `ArticleForm` in create mode hosts the picker + "Save as template…"
  dialog. It's gated on `useFeature("templates")` (so it doesn't render —
  or fire a doomed list fetch — for a USER once templates is POWER_USER by
  default), and still self-hides via its internal `failed` flag if the
  endpoint errors for an entitled user (older backend).

## Sharing model (two flavors; share-capable = POWER_USER or ADMIN)

Sharing is the POWER_USER tier's exclusive feature. **ADMIN inherits it**
without a subscription: authorization runs on a role hierarchy
(`USER < POWER_USER < ADMIN`) in `modules/common/roles.ts` —
`requireRole("POWER_USER")` clears for ADMIN too, while `requireRole("ADMIN")`
stays admin-only. "POWER_USER-only" below means "share-capable" (POWER_USER or
ADMIN).

1. **Public** — `Article.sharedWithPowerUsers: bool`. Always read-only.
   Visible to every share-capable user. Toggled per article via
   `articles/article.share.routes.ts`. Owner kill-switch:
   `POST /api/articles/unshare-all`.
2. **Per-user (direct)** — `InventoryShare` with `permission READ|WRITE`,
   created via `ShareInvite` (share-capable → share-capable, recipient must
   accept). WRITE recipients can edit basic article fields via
   `PUT /api/shared/articles/:id`. Invites require share capability on both
   ends (createInvite enforces invitee via `roleAtLeast(role,"POWER_USER")`;
   accept route gates on `requireRole("POWER_USER")`, which ADMIN clears).

Both surfaces collapse into the recipient's `/sharing` page (read), the
owner's `/sharing` page (invite/manage), and the owner's `/profile` page
("Articles you've shared publicly" + "People you've invited").

On every transition from a share-capable role to USER (Stripe cancel webhook,
manual `/api/billing/sync`, admin demote — including ADMIN → USER)
`ShareService.cleanupSharingForUser` flips public articles back, deactivates
outgoing per-user shares, and revokes pending invites — inside the same
transaction as the role change. (Billing only ever touches POWER_USER rows;
the ADMIN → USER case is the admin-demote path.)

Account deletion (`ProfileService.deleteAccount`) also deletes ShareInvite
rows where the deleted user is the **invitee** (matched by email — there's
no FK). Without that, someone re-registering with the same email could
accept a stale token and gain access to a third party's inventory.

## Household accounts

A `Household` is a small group (max 6) of share-capable users whose
inventories are mutually visible and editable — implemented as an
auto-managed **mesh of WRITE `InventoryShare` rows** (each member pair gets a
row in both directions, tagged `viaHouseholdId`), so every existing sharing
surface (recipient views, `PUT /api/shared/articles/:id` WRITE edits,
transfer PULL visibility, the privacy boundary) works unchanged. Key rules:

- One household per user (`HouseholdMember.userId` unique — the DB arbitrates
  concurrent joins). Roles: OWNER (invites/removals) / MEMBER; the OWNER's
  departure promotes the oldest member, the last member's departure deletes
  the household.
- `HouseholdInvite` mirrors ShareInvite: enumeration-safe errors, 7-day
  emailed token (`/sharing?householdToken=…`), single-use atomic claim.
- Join upserts the mesh pairs (absorbing a pre-existing manual share);
  leave/remove deactivates + untags only rows carrying `viaHouseholdId`, so
  manual shares created after teardown are never collateral damage.
- Role downgrade exits the household **inside the same transaction** —
  `HouseholdService.removeOnDowngrade` runs first in
  `ShareService.cleanupSharingForUser` (it must cover incoming mesh rows,
  which the blanket outgoing cleanup misses).
- Gating: create/invite/accept require the `household` feature; GET, leave,
  remove-member, revoke-invite stay on authGuard (cleanup rule). Web:
  `HouseholdSection` on the `/sharing` page.
- Files: `apps/api/src/modules/household/{household.service,household.routes}.ts`,
  `apps/web/src/components/sharing/HouseholdSection.tsx`.

## Article ownership transfer

Permanent transfer of an article (and all its related data) between two
POWER_USER / ADMIN accounts. Gated on the same `requireRole("POWER_USER")`
as sharing. Both flows require explicit validation from the second party.

**PUSH** — owner initiates: `POST /api/articles/:id/transfer/push { email }`.
The recipient (who must be a POWER_USER) receives an email with the token
and must accept from their `/transfers` page.

**PULL** — requester initiates: `POST /api/articles/:id/transfer/pull`.
The article must already be visible to the requester (public share or active
InventoryShare — which is inventory-wide, not per-article) — this prevents
ID-enumeration and owner spam. The article owner receives an email with the
token and must accept or reject.

On acceptance the transfer is fully atomic (Prisma transaction):
  - The receiving account's role is **re-verified share-capable inside the
    tx** before anything moves. The route's `requireFeature("transfers")`
    gate only checks the *acceptor* — on a PULL that's the giver, not the
    requester who becomes the new owner — so the service re-reads
    `newOwner.role` and 409s if it's no longer ≥ POWER_USER. (Downgrade also
    revokes pending transfers via `cleanupSharingForUser`, but that's a
    non-local guarantee; the in-tx check enforces the invariant where
    ownership actually changes, per the "re-read inside the tx" rule.)
  - `Article.ownerUserId` updated; `sharedWithPowerUsers` reset to false
  - `Garantie`, `WarrantyHistory`, `Alerte`, `Attachment`, `ArticleNote`
    rows all re-owned to the new owner
  - `ArticleLocation` + `ArticleTag` junction rows **deleted** (locations
    and tags are owner-scoped; new owner re-assigns from their own lists)
  - `Loan` + `ServiceRecord` rows and `ArticleInsurance` policy-links for the
    article are **deleted** for the same reason — a borrower record, repair
    log, and insurance link are personal to the giver, not the item. The
    `InsurancePolicy` itself is left intact (it may cover the giver's other
    items); only its join to this article is severed. The loan/service
    **reminder alerts** those rows scheduled are deleted too — the blanket
    `Alerte` re-own moved them to the new owner, where they'd otherwise fire
    against a record the new owner can't see.
  - The **warranty** reminders are re-owned rather than deleted, but their
    already-queued BullMQ jobs still carry the giver's `ownerUserId`. The
    reminder processor therefore addresses the *row's* current owner
    (`alerte.ownerUserId`), never the job payload's — reading the payload
    would push/email the item's name to its former owner and mark the row
    SENT, so the new owner would never get the reminder. `handleCustom`
    always read the row; `handleWarranty` now does too.
  - All other PENDING transfer requests for the same article are REVOKED

Status lifecycle: `PENDING → ACCEPTED | REJECTED | REVOKED | EXPIRED` (7-day
expiry). `rejectTransfer` and `acceptTransfer` both check `expiresAt` and
write `EXPIRED` status if the window has passed. Email notifications are
fire-and-forget (no impact on the API response if email is unconfigured —
consistent with `PushService` and `EmailService` best-effort pattern).

Role downgrade (`POWER_USER → USER`) via Stripe cancel or admin demote calls
`ShareService.cleanupSharingForUser` which **also revokes all PENDING
transfer requests** where the downgraded user is either party (owner or
requester), preventing orphaned transfers that neither party can cancel.

Audit actions: `ARTICLE_TRANSFER_INIT`, `ARTICLE_TRANSFER_ACCEPT`,
`ARTICLE_TRANSFER_REJECT`, `ARTICLE_TRANSFER_REVOKE` (in `@wim/types`
`AUDIT_ACTIONS`). Entity: `ArticleTransfer`.

Web: `TransferDialog` (push/pull modal), `/transfers` route with
incoming/outgoing tabs. Transfer button in `ArticleDetail` header (push).
Pull button in `SharedArticlesView` rows. Outgoing ACCEPTED rows render
the article name as plain text (not a link) — the former owner no longer
has access to the article after a successful transfer.

Known limitations (accepted, low-probability):
  - Two concurrent PULL accepts for the **same article** (different request
    rows) can both complete under Postgres READ COMMITTED, the last commit
    silently winning `ownerUserId`. Would need `SELECT ... FOR UPDATE` on
    the article row.
  - The "one PENDING PUSH per article" / "one PENDING invite per
    (owner,email)" duplicate checks are read-then-create, not atomic — two
    truly simultaneous creates can both pass. A partial unique index would
    close it; the client-side double-submit guards make it improbable.

Key files:
  - `apps/api/src/modules/articles/transfer.service.ts`
  - `apps/api/src/modules/articles/transfer.routes.ts`
  - `apps/web/src/components/articles/TransferDialog.tsx`
  - `apps/web/src/components/transfers/TransfersView.tsx`

## Billing

- Subscription product = `POWER_USER` upgrade. Monthly + yearly Stripe
  prices.
- **Checkout 409s for anyone already share-capable or holding a
  `stripeSubscriptionId`** — without the guard, a stale success tab could
  mint a second active subscription on the same customer, and since the
  webhook stores only the newest sub id, cancel/portal could never reach
  the older one (double-billing). Customer creation uses a per-user
  idempotency key so concurrent first-time requests can't strand a
  duplicate Stripe customer.
- Webhook + manual sync are both supported. The Webhook is canonical;
  `POST /api/billing/sync` is a fallback the frontend calls on return
  from Checkout so the UI doesn't have to wait for webhook delivery (free
  Render's cold start often exceeds Stripe's 10-second retry window).
- `getAppUrl()` in `billing.routes.ts` strictly validates `APP_URL` —
  reject anything that isn't a single valid http(s) origin, since past
  misconfig (a comma-separated value copied from `CORS_ORIGIN`) broke
  the Stripe `success_url`.
- Per-user billing details (next bill / cancel-at-period-end) come from
  `GET /api/billing/me`, which calls Stripe live.
- Webhook handler details that look odd but are load-bearing:
  `AuditService.log` always uses the module-level prisma client, so audit
  inputs are collected into `pendingAudit` during the idempotency
  `$transaction` and written *after* it commits (an in-tx call would
  survive a rollback). The downgrade condition guards `Boolean(endedAt)`
  with `status !== "active" && status !== "trialing"` — Stripe can send
  `subscription.updated` with a non-null `ended_at` on a recovered
  subscription, which must not demote the user.

## Admin

- `requireRole("ADMIN")` everywhere under `/api/admin/*`.
- Admin UI in `apps/web/src/components/admin/AdminUsers.tsx`. Five
  tabs: Dashboard / Users / Features / Audit log / Jobs.
- User row actions: inline role edit (last-admin protection in a
  serializable tx), reset password (bumps tokenVersion), force-logout
  (also bumps tokenVersion), delete user. The last-admin guards re-read
  the target's role **inside** the tx (the pre-tx snapshot is for audit
  metadata only — see Conventions).
- Cursor-paginated audit log under `/api/admin/audit-log`. Action union
  is in `apps/api/src/modules/audit/audit.service.ts` — add new strings
  there before logging them.

## Feature gating (admin-controlled, role-based + temp grants)

Admins control which role each named feature requires, overriding the
hardcoded defaults. **POWER_USER role IS the paywall** — there is no
separate paywall flag; gating a feature at POWER_USER means "paid". ADMIN
inherits everything via the role hierarchy (`roleAtLeast`).

- **Models** (`apps/api/prisma/schema.prisma`): `FeatureFlag` (one row per
  overridden feature, `featureKey` unique + `requiredRole`) and
  `FeatureTempGrant` (time-bounded `expiresAt`, optional `note`). An absent
  `FeatureFlag` row means "use the coded default" — rows only exist for
  overrides.
- **Service** (`apps/api/src/modules/features/feature.service.ts`):
  `FEATURE_KEYS` + `DEFAULTS` are the source of truth. Defaults:
  `cmd_palette=USER` (global search/command palette ships open to everyone —
  no feature is hardcoded ADMIN-only; an admin can still raise any bar to
  ADMIN via a `FeatureFlag` row); **every other feature (`sharing`, `transfers`,
  `messaging`, `reports`, `analytics`, `templates`, `bulk_edit`,
  `saved_views`, `notifications`, `calendar_feed`, `csv_import`,
  `csv_export`, `insurance`, `loans`, `maintenance`, `budget`,
  `public_page`, `wishlist`, `household`) defaults to `POWER_USER`** —
  i.e. they are all paid features by default, and an admin can lower a bar
  (e.g. to USER) per feature when desired. A **60-second
  process-level snapshot cache** (`getSnapshot`) holds both tables so gated
  requests don't hit the DB each time; admin writes call `invalidateCache()`
  so changes land within one request cycle, not after the TTL.
- **Access rule** — the single `isAllowed(role, key, snapshot)` helper backs
  both `getAccessMap` and `requireFeature`, so the API and the client map can
  never disagree. Allow if `roleAtLeast(role, required)` **or** (`role ===
  "USER"` **and** `required === "POWER_USER"` **and** an unexpired temp grant
  exists). Temp grants are the "let a free user try a paid feature until date
  X" lever — they only ever lift a USER to a **POWER_USER**-gated feature
  (ADMIN-gated features stay admin-only regardless of any grant; the grant
  endpoint rejects a key whose effective role isn't POWER_USER). Grant
  expiries are stored as ms timestamps and re-checked against `Date.now()` at
  read time, so a grant that lapses mid-cache-window stops working at
  `expiresAt`, not 60s later.
- **`requireFeature(key)` middleware** gates every toggleable feature's
  backend route(s), runs **after** `authGuard` (reads `req.user.role`):
  `sharing` (`shares/`, `shared/`, `article.share.routes.ts`,
  `article.routes.ts` bulk-share), `transfers` (`transfer.routes.ts` —
  push/pull/accept + the list endpoints; **reject and revoke stay on
  `authGuard` only** so a pending transfer can always be declined/canceled
  even if the feature is later restricted, mirroring the calendar DELETE),
  `reports` (`reports/report.routes.ts`), `templates`
  (`articles/template.routes.ts`), `bulk_edit` (`/articles/bulk-update`),
  `saved_views` (`saved-views/`), `notifications` (`/alerts/notifications` +
  `/alerts/mark-seen` — the bell feed, **not** the core alert list/CRUD),
  `calendar_feed` (`POST /calendar/token` only — DELETE + the public ICS
  feed stay open), `csv_import` (`/articles/import`), `csv_export`
  (`/articles/export/inventory.csv`), `insurance` (`insurance.routes.ts` —
  list/create/update + link; **policy delete + coverage unlink stay open**
  for cleanup), `loans` (`loan.routes.ts` — list/create; **return + delete
  stay open**), `maintenance` (`service-record.routes.ts` — list/`due`/create;
  **delete stays open**), `budget` (`statistics/budget` GET +
  `profile/me/budget` PUT), `public_page` (`articles/public-link.routes.ts`
  **POST only** — the GET status + DELETE stay open, and the unauthenticated
  `GET /api/public/items/:token` read is never gated), `wishlist`
  (`wishlist.routes.ts` — list/create/update; **purchased-toggle + delete stay
  open**), `household` (`household.routes.ts` — create/invite/accept; **GET,
  leave, remove-member, revoke-invite stay open**). The "cleanup paths
  stay open" rule mirrors the transfer reject/revoke + calendar-DELETE
  pattern: a downgraded user can always wind a thing down even when the
  feature is later restricted. `cmd_palette` is frontend-only (it reuses the
  shared article-search endpoint, so there's no dedicated route to gate) and
  defaults to USER (global search for everyone). Every *other* gate defaults
  to POWER_USER, so by default those are all paid features; an admin can lower
  a bar to USER per feature to make one free (or raise any bar to ADMIN).
- **Admin endpoints** (`admin.routes.ts`): `GET /api/admin/features`
  (flags + active grants), `PUT /api/admin/features/:key` (set required
  role), `POST /api/admin/features/grants` (rejects non-POWER_USER keys),
  `DELETE /api/admin/features/grants/:id`. Each write calls
  `invalidateCache()`.
- **`GET /api/features`** returns the caller's `{ key: boolean }` access map.
- **Web**: `FeatureProvider` (`apps/web/src/features/features.tsx`) is
  mounted in `main.tsx` **above `<App />`** so `App` itself can call
  `useFeature()`. It fetches the map once on mount; `App` calls its
  `refresh()` after login, logout, and Stripe role changes (the mount fetch
  fires while still logged out on a fresh login, so without the refresh the
  map would stay all-false until reload). `useFeature(key)` returns a bool;
  `useFeatures()` exposes the full map + a **`loaded`** flag + `refresh`. The
  `loaded` flag is load-bearing: the all-false default is in effect until
  `/api/features` resolves, so a feature-gated **route** must NOT redirect on
  it — `App`'s `gatedRoute()` renders the route skeleton until `loaded`, then
  allows or `<Navigate>`s. Without this, an entitled user opening
  `/reports`/`/transfers`/`/sharing` directly would be bounced to `/` by the
  load-time all-false map (a `replace` that can't be undone). `loaded` flips
  true on **both** the success and error paths (a persistent 401 must release
  the guard to the redirect, not hang on the skeleton). Likewise data fetches
  keyed on a flag (e.g. `loadSavedViews`) live in an effect that depends on the
  flag, not a mount-only effect, so they fire once the flag resolves. Nav
  visibility falls back to role-based (`visibleNavItems(role, undefined)`)
  until `loaded` to avoid share/reports items flickering. Component gates: the
  Reports route + nav item (via `NavItem.feature`), the notification bell
  (`TopBar`), the CSV import/export + saved-views + bulk-edit affordances
  (`ArticlesList`/`BulkActionBar`), the `TemplateBar` in `ArticleForm`
  (`useFeature("templates")`), and the Profile calendar-feed section all
  hide when their flag is off. The provider resets to all-false on a failed
  fetch so a logout clears granted access. `AdminFeaturesTab` calls `refresh()`
  after each save so the admin's own session reflects the change immediately.
- **Upgrade teasers** (`features/upgrade.tsx`): `UpgradeProvider` (mounted in
  `main.tsx` just inside `FeatureProvider`) owns a single app-level
  upgrade dialog and the shared Stripe-checkout starter; `useUpgrade()`
  exposes `promptUpgrade()` (open the dialog) + `startCheckout(plan)`. So a
  USER can *discover* paid features rather than just not see them, locked
  affordances render in place of a hard hide: the gated `/reports`,
  `/sharing`, `/transfers` routes render `components/common/UpgradeTeaser`
  (naming the feature) instead of redirecting home; Sidebar/MobileDrawer
  badge feature-locked nav items with a lock (`navItemFeatureKey` maps an
  item → its flag); and the ArticlesList CSV import/export buttons + the
  Profile calendar section render a `Lock`-icon button that calls
  `promptUpgrade()`. "Locked" is simply `loaded && !features[key]` — no role
  check needed, since POWER_USER/ADMIN/granted users all have the flag true.
  The dialog/teaser reuse `home.upgrade.buyMonthly`/`buyYearly` for the plan
  buttons; the existing Home upgrade banner is unchanged.
- **Inline section gating** (`components/common/LockedFeatureNotice`): the
  embedded article-detail sections (`LoanSection`, `InsuranceSection`,
  `MaintenanceSection`, `PublicLinkSection`) and the Profile budget section
  render this shared notice (same icon + title as the real section, plus an
  upgrade button) when their flag is off, instead of a route-level
  `UpgradeTeaser`. Each guards its own data fetch on the flag so a locked
  user never fires a doomed 403. The dashboard `BudgetCard` and
  `AttentionExtraCard` simply self-hide (return null) when their flags are
  off — no nag where there's no entitled content to show.

## PWA

- `apps/web/public/icon.png` is the master shield. Build script
  `apps/web/scripts/generate-pwa-icons.mjs` (sharp) resizes to
  `icon-192.png`, `icon-512.png`, plus maskable variants on `prebuild` /
  `predev`. Generated PNGs are `.gitignored`.
- `apps/web/public/sw.js` is a minimal service worker (network-first
  navigations, cache-first hashed assets, never intercepts `/api/`).
  Registered in `main.tsx` only in production. Required for Chrome to
  treat the site as installable.
- **iOS "Add to Home Screen"**: `index.html` includes the three
  `apple-mobile-web-app-*` meta tags (`capable`, `status-bar-style`,
  `title`) because iOS ignores `manifest.webmanifest` for installed apps —
  without them the icon launches as a bookmarked Safari tab, not a
  standalone app.
- After deploying, installed-app users will keep seeing the old shell
  until the SW updates or they reinstall. Telling them to hard-refresh
  + DevTools → Application → Service Workers → "Update" usually works.

## Email + push localisation

Every outbound email and push notification is written in the recipient's
`User.language` (en/fr/pt/es/nl — validated on write by
`profile.schemas.ts`), falling back to English for unset, legacy or
unknown values. The copy lives in one place,
`apps/api/src/modules/email/email.i18n.ts`: a flat key map per language,
`{placeholder}` interpolation (single pass — a value containing braces is
never re-expanded), and a parity test that fails when a key or a
placeholder is missing in any language. Bind a translator per recipient
and pass `lang` through `EmailService.sendReminderEmail` so the
"Open in WIM" link label matches:

```ts
const t = emailTranslator(user.language);
await EmailService.sendReminderEmail({
  to: user.email,
  lang: user.language,
  subject: t("warranty.reminder.subject", { name }),
  body: t("warranty.reminder.body", { name, date }),
  path,
});
```

Senders that already hold the User row select `language` alongside
`email`. Senders that only have an address (transfer offers, household
invites, message notifications — the recipient may not be a user yet)
resolve it with `recipientLanguage(email)` from
`modules/email/recipient-language.ts`, which never throws (unknown
address, DB error or a test double without `findFirst` all mean English)
and imports Prisma lazily so the email module carries no DB dependency.
The reminder processor reads the recipient once and uses the same
translator for push and email, so the two channels can't disagree. Never
hardcode an English sentence at a call site again — add a key.

## Known gotchas

- **A loader that can be re-run needs `useLatestRequest`.** Every list view
  loads on mount and reloads after each mutation; where the mutation's busy
  flag is per-row (so a second row stays clickable) two reloads overlap, and
  if the earlier one lands last it repaints the pre-mutation list — the row
  you just deleted comes back, and it only heals on the next load.
  `hooks/useLatestRequest` is the guard: `const fresh = request.begin()`
  before the await, `if (!fresh()) return;` before every state write,
  `if (fresh()) setLoading(false)` in the `finally`. One hook instance per
  independent request (JobsTab and SharesList each hold two); unmount
  invalidates outstanding tokens. ArticlesList, ArticleDetail, AdminUsers
  and MessagesView predate the hook and use an equivalent inline
  `…SeqRef` — leave those alone or port them, but do not invent a third
  idiom. Note a view that renders a skeleton over the whole list while
  loading (LocationsView) can't reach the race through the UI; the guard is
  still correct there and costs nothing.

- **Two error boundaries, and they divide the work.** The root one
  (`main.tsx`) wraps the whole tree and exists for errors that leave nothing
  usable — notably a `ChunkLoadError`, where it reloads to pick up a new
  deploy's hashed filenames. `RouteErrorBoundary` sits INSIDE `AppShell`
  around the route `Suspense`, so an ordinary render throw takes out only the
  content pane and the sidebar/top bar stay operable; it clears itself when
  the pathname changes and offers a retry. It deliberately **re-throws**
  chunk errors (`utils/chunkError.isChunkLoadError`) so the root boundary
  still does the reload — catching them there would swallow that recovery.
  `Suspense` catches promises, not throws; it is not a substitute for either.

- **Screen-reader labels are translated too.** `aria-label` strings on the
  primitives (`Modal` close, `Pagination`, `Breadcrumbs`, `RouteFallbackSkeleton`,
  toast dismiss) and the nav landmarks come from `a11y.*` keys. Primitives
  use `useI18nOptional()` — the same `t()`, but it falls back to English
  instead of throwing when a unit test mounts the primitive without an
  `I18nProvider`. App code keeps using `useI18n()`. Never write an English
  literal into `aria-label`; the hardcoded-string grep in CI-less review is
  `grep -rnE 'aria-label="[A-Z][a-z]' src/components`.

- **Adding a UI string = English + four locale files.** Only English ships
  in the main bundle (`translations.ts` / `translations.extras.ts`); fr, pt,
  es and nl live in `i18n/locales/<lang>.ts` and load on demand (one Vite
  chunk each, ~20 KB gzipped) — that took 340 KB of copy out of the main
  chunk. The locale objects are typed `Record<keyof en, string>`, so a key
  missing from — or misspelled in — any locale is a `tsc` error, not a
  runtime English fallback. `t()` serves English until a chunk arrives;
  `main.tsx` awaits `preloadInitialLanguage()` so a returning non-English
  user never sees the fallback. Never put another language back into the
  English files.

- **Clear the SW articles cache when the session changes.** `public/sw.js`
  keeps GET `/api/articles` in the Cache API (stale-while-revalidate) so the
  list opens offline. The Cache API is keyed by URL, not by cookie, so on a
  shared device the next account would be served the previous account's
  list first. `services/offlineCache.clearApiCache()` runs on logout, on
  the 401 handler and on login; the cache name is pinned to `sw.js` by a
  test. Any new API cache in the SW needs the same treatment.
- **Coloured text picks black/white by WCAG ratio, not by luminance.**
  `TagChip.contrastText` compares `contrastRatio(bg, black)` against
  `contrastRatio(bg, white)`; the old "luminance > 150" cut-off put white on
  the green/red/blue/orange presets at 2.3–3.8:1. Reuse `contrastRatio`
  for any user-chosen colour. Semantic tokens: light `--text-success` /
  `--text-warn` are the -800 shades (the -700s were 4.4:1 on tinted
  badges); the dark theme's `--primary` is a button fill, so links and
  info badges there use `--primary-hover`.
- **Headings.** `EmptyState` renders an `h2` (it sits directly under a page
  `h1`); `AttachmentsList` renders `h1` standalone and `h2` embedded; the
  login form's title is the page `h1` inside a `<main>` (the brand aside is
  hidden below `lg`). An interactive `Card` always renders a `div` —
  `role="button"` is not allowed on `article`/`section`.
- **Esc inside the article sheet.** `ArticleForm` intercepts Escape on its
  root and routes it through `handleCancel` (discard confirm when dirty),
  stopping propagation so `Modal` doesn't close a dirty form silently.

- **Never re-fetch from the 401 handler.** `App.tsx` registers a
  `register401Handler` callback that flips the session to unauthed. It used
  to call `refreshFeatures()` there to drop granted flags; `/api/features`
  itself answers 401 when logged out, which re-fired the handler in an
  unbounded loop (60–70 requests per logged-out page load, until login).
  The handler and logout call `clear()` on the feature context instead — a
  state reset with no network. Anything else that runs on 401 must be
  network-free for the same reason.
- **`alerts.snooze.*` presets live behind one menu.** Each SCHEDULED alert
  row renders `AlertRowActions`: a `Popover` "Snooze…" with the three
  presets + a date input revealed by "Custom…", and an icon cancel. Five
  side-by-side buttons per row overflowed a 390 px viewport by up to
  158 px. Tests open the menu before reaching a preset.

- **The admin DB export is not streamed and carries live credentials.**
  `GET /api/admin/db/export` builds every table in memory and
  `JSON.stringify`s the whole thing before sending a byte, while
  `/db/import` accepts up to 100mb — so a large dump OOMs a 512mb dyno,
  i.e. the backup fails exactly when it is needed. Making it genuinely
  streaming means emitting the JSON table-by-table. The dump also contains
  bcrypt password hashes *and* every `TotpSecret`, whose base32 secret is
  stored in the clear because a restore has to reproduce working 2FA. A TOTP
  secret is a standing second factor that no password reset rotates, so the
  file is the most sensitive artifact the system produces and cannot simply
  be redacted without breaking restore.

- **A missing generated Prisma client fails `tsc`, not just the tests.**
  `npm ci` wipes `node_modules/.prisma`, and the resulting build errors do
  not say "run prisma generate" — they read like real regressions:
  `Namespace 'Prisma' has no exported member 'AlerteCreateManyInput'`,
  `Module '"@prisma/client"' has no exported member 'Location' / 'Garantie'`,
  and a scatter of `TS7006 implicitly has an 'any' type` in
  `statistics.service.ts` (the implicit-any ones are the most misleading —
  they look like a typing regression in code nobody touched). The unit suite
  fails differently, with ~25 API tests throwing
  `TypeError: Cannot read properties of undefined (reading 'PENDING')`.
  One command clears all of it:
  `cd apps/api && ../../node_modules/.bin/prisma generate`. Do that before
  investigating either symptom.
- **Local git proxy regularly 403s on push.** Most reliable workaround is
  pushing via the GitHub MCP `push_files` tool. Useful for text-only
  commits; binary files don't survive that path (utf-8 corruption), so
  keep generated PNGs out of git (see PWA section).
- **`npm ci` vs `npm install`**: CI and `render-build:*` use `npm ci
  --include=optional` for lockfile-exact, reproducible installs (and to
  keep the platform `@rollup/rollup-*` optional binary). This means **the
  lockfile must be kept in sync** — if a workspace adds/bumps a dep, commit
  the updated `package-lock.json` or `npm ci` fails the build. Use plain
  `npm install` locally; never hand-edit the lockfile except when surgically
  patching a transitive version that an `overrides` entry can't reach (and
  re-run `npm install` afterwards to let npm reconcile it).
- **Cookie sameSite / Safari ITP**: `wim-web.onrender.com` and
  `wimapi.onrender.com` are different registrable domains (PSL treats each
  `*.onrender.com` subdomain as its own site). Safari's ITP silently drops
  `Set-Cookie` responses from cross-site `fetch`/XHR — which made login
  fail on iOS (both Safari and the installed PWA) while working on Android.
  Fix: `render.yaml` proxies `/api/*` through the static CDN so the browser
  always sees a single origin. The API still sets `SameSite=none; Secure` in
  production (for any direct API access) and `lax` in dev (`cookieOptsFor`
  in `apps/api/src/modules/auth/cookies.ts`). If login ever breaks on iOS
  again, the first thing to check is whether `VITE_API_BASE_URL` was
  accidentally set back to the absolute `wimapi` URL in the Render dashboard.
- **`API_BASE_URL` is a relative path in production** (`/api`, because of the
  proxy above) — `new URL(\`${API_BASE_URL}/...\`)` therefore **throws**
  ("Failed to construct 'URL'") unless given a base. Use the `apiUrl(path)`
  helper in `apps/web/src/services/api.ts` (anchors on
  `window.location.origin`; absolute bases ignore it) covers every endpoint
  that needs `URL`/`searchParams`. Constructing `new URL` from
  `API_BASE_URL` directly broke every list view in production once.
- **Vite hashes asset filenames**, so a new deploy invalidates old CSS
  references in the SW cache automatically. `index.html` is fetched
  network-first so users get the fresh hash.
- **`authRateLimiter` skips successful requests, so it caps brute force and
  nothing else.** It sets `skipSuccessfulRequests` deliberately (the SPA calls
  `GET /me` on every page load, and without the skip a user refreshing would
  429 their own session check). The consequence is that it only bites on
  FAILED requests: any `/api/auth` route whose *abuse looks like success* is
  effectively uncapped by it, and needs its own limiter. That applies to
  `POST /register` (a 201 per created account), `POST /auth/seed-demo` (a 202
  per ~10k-row reseed) and `POST /auth/webauthn/login/options` (a 200 per
  anonymous user lookup + JWT mint) — all three now carry an explicit limiter.
  Password/TOTP/passkey *verification* routes are fine on the shared limiter
  precisely because a brute-force attempt is a failure and does count. When
  adding an `/api/auth` route, ask which side of that line it falls on.
- **Rate limiters cover creation surfaces by cost.** `createRateLimiter`
  (40 / 5 min, keyed per session token) is on every route that inserts rows or
  bytes — including the three that carry the most weight: `POST /api/articles`,
  `POST /api/articles/import` (up to 1000 rows a call), `POST
  /api/articles/:id/duplicate`, and both attachment creates (`POST
  /api/attachments` and `/upload`, the latter accepting 10 MB a call). The
  destructive bucket (10/hour) stays for bulk deletes, exports and account
  deletion. Adding a new create route means adding the limiter with it.
- **Dependency `overrides`** (root `package.json`): pin transitive deps to
  patched versions so the `npm audit --omit=dev --audit-level=moderate` CI
  gate stays green (e.g. `qs: 6.15.2`, forced into `stripe` /
  `swagger-ui-express` / `supertest`). The gate is **production-only** —
  remaining dev-tooling advisories (esbuild/vite/vitest) are accepted
  because that stack never ships and the fix is a breaking Vite major.
  An audit finding is resolved by adding or bumping an override rather than
  by loosening the gate. Caveat: an override on a package that's also a *peer
  dep* of another (e.g. `express` under `swagger-ui-express`) can relocate
  the install into a workspace `node_modules` and break root resolution —
  if `npm ci` then can't find the module at runtime, ensure the root
  `node_modules/<pkg>` lockfile entry still exists.
- **A widened semver range alone won't move the lockfile.** Bumping
  `"react-router-dom": "^7.16.0"` → `"^7.18.1"` and re-running `npm install`
  is a no-op: npm reuses the already-satisfying tree, and `npm install
  pkg@version` rewrites the range back down to what is installed. Cache
  clearing doesn't help — the entry has to be deleted from
  `package-lock.json` before `npm install` will re-resolve it against the
  registry. For a **transitive-only** package, deleting its entry alone makes
  npm prune it rather than re-resolve, leaving the parent with a dependency
  in neither the lockfile nor `node_modules`; the parent's entry has to go
  too. That is how `ip-address` was bumped, which also carried
  `express-rate-limit` 8.5.2 → 8.6.2. The check is `node -p
  "require('pkg/package.json').version"`, not the range in `package.json`.

## Open items / temporary stuff

- **`/api/auth/bootstrap-admin`** + the `TestAdmin` button on the login
  screen are temporary. They one-shot promote `admin@admin.com` if and
  only if there's no ADMIN yet (so they're idempotent and not a
  backdoor). User wants to keep them around for now since Render's free
  Postgres expires monthly and they'd otherwise have to re-promote
  manually. Remove once the seed flow is replaced.
- **`/api/auth/seed-demo`** + the **"Load demo data"** button on the login
  screen are temporary too. The button POSTs to the endpoint, which runs the
  shared generator (`modules/demo/demo.service.ts` — the same one behind the
  `seed:demo` CLI) in the **background** and returns 202 immediately (the job
  inserts ~10k+ rows over 1–2 min). Each click **refreshes** the demo dataset:
  `resetDemoData` first deletes every prior demo account — any `@demo.wim.app`
  user (`DEMO_EMAIL_DOMAIN`), which cascades their articles/warranties/etc. —
  then `seedDemoData` reseeds from scratch. **Real (non-demo) accounts are
  never touched** (matched purely by email domain), so it's safe on a live DB
  and a second click picks up new fields/code (e.g. the product image URLs)
  instead of being refused — and re-running can't balloon the DB because the
  prior demo batch is removed first. Demo accounts still start after a reserved
  user-id margin (1000) so they don't collide with real users, and a demo admin
  (`admin@demo.wim.app`) is minted only when no **real** (non-demo) admin
  exists. A `demoSeeding` guard prevents overlapping runs. Set
  `DEMO_SEED_ENABLED=false` to disable. All demo accounts share the password
  `Demo1234!`. The demo module is excluded from coverage in `vitest.config.ts`.
  A dedicated **showcase account** for live demos rides slot #1 of every seed:
  `admin@wim.com` / `Admin123+` (`DEMO_SHOWCASE_EMAIL/_PASSWORD`), ADMIN role,
  ≥100 articles guaranteed (floor even when `articlesPerUser` is smaller),
  stable stage-friendly prefs (en/EUR/light, verified email, budgets set). It
  deliberately lives OFF the demo domain so the address looks real on stage;
  `resetDemoData` compensates by also deleting it **by exact email**, so each
  reseed recreates it fresh — never hand these credentials to a real user.
- **Two sharing models** (public flag vs InventoryShare) still both
  exist intentionally. The owner-side UX has separate flows for each;
  consolidating into a single "Share article…" dialog with options
  (Public / Specific user) was discussed and deferred.

## File pointers (top of mind)

- API entry: `apps/api/src/index.ts`, app wiring in `apps/api/src/app.ts`
- Auth: `apps/api/src/modules/auth/` (middleware, service, routes, schemas,
  token-denylist, `session.service.ts`, `totp.service.ts`)
- Sharing: `apps/api/src/modules/shares/{share.service,share.routes}.ts`,
  `apps/api/src/modules/shared/shared.routes.ts`,
  `apps/api/src/modules/articles/article.share.routes.ts`
- Warranties: `apps/api/src/modules/warranties/{warranty.service,
  warranty.routes,warranty.schemas}.ts` (renew / extend / claim
  workflow + history)
- Reports: `apps/api/src/modules/reports/{report.pdf,report.routes}.ts`
- Loans: `apps/api/src/modules/loans/{loan.service,loan.routes,
  loan.schemas}.ts`
- Insurance: `apps/api/src/modules/insurance/{insurance.service,
  insurance.routes,insurance.schemas}.ts`
- Maintenance / service log: `apps/api/src/modules/service-records/
  {service-record.service,service-record.routes,service-record.schemas}.ts`
- Budget: `getBudgetStatus` in `services/statistics.service.ts` +
  `PUT /me/budget` in `modules/profile/profile.routes.ts`
- Public item page: `apps/api/src/modules/public/public.routes.ts` (open
  read), `apps/api/src/modules/articles/public-link.routes.ts` (owner)
- Article templates: `apps/api/src/modules/articles/{template.service,
  template.routes}.ts`
- Billing: `apps/api/src/modules/billing/{billing,billing.me,billing.webhook}.routes.ts`
- Admin: `apps/api/src/modules/admin/admin.routes.ts`
- Feature gating: `apps/api/src/modules/features/{feature.service,
  feature.routes}.ts`, web `apps/web/src/features/features.tsx`,
  admin UI `apps/web/src/components/admin/AdminFeaturesTab.tsx`
- Web entry: `apps/web/src/main.tsx`, routes in `apps/web/src/App.tsx`
- App shell: `apps/web/src/components/layout/{AppShell,Sidebar,TopBar,
  MobileDrawer,SettingsMenu,NotificationBell,RouteChrome}.tsx`, nav model
  (+ groups) in `src/lib/navItems.ts`; `BackToTop` in `components/common/`;
  dialog shell `components/common/Modal.tsx` (`variant="side"` for sheets)
- Page walker for bare-array list endpoints:
  `apps/web/src/services/pagination.ts` (`fetchAllPages`)
- UI primitives: `apps/web/src/components/ui/` (barrel `index.ts`)
- Hooks: `apps/web/src/hooks/{useHotkeys,useFileDrop,useApiForm,
  useUnsavedChangesGuard,useLatestRequest}.ts`
- API client: `apps/web/src/services/api.ts`
- i18n: `apps/web/src/i18n/{i18n.tsx,translations.ts,translations.extras.ts}`
  (English, in the main chunk) + `apps/web/src/i18n/locales/{fr,pt,es,nl}.ts`
  (lazy chunks, typed `Record<EnglishKey, string>`)
- Theme + prefs: `apps/web/src/theme/theme.tsx`,
  `apps/web/src/preferences/preferences.tsx`, CSS in
  `apps/web/src/index.css` (incl. `data-density="compact"` rules)
- Onboarding / actionable home: `apps/web/src/components/onboarding/
  OnboardingChecklist.tsx`, `apps/web/src/components/dashboard/
  {NeedsAttention,BudgetCard,AttentionExtraCard}.tsx`
- Lifecycle add-on UI: `apps/web/src/components/articles/
  {LoanSection,InsuranceSection,MaintenanceSection,PublicLinkSection}.tsx`,
  `apps/web/src/components/insurance/InsuranceView.tsx`,
  `apps/web/src/components/public/PublicItemView.tsx`, locked-section
  placeholder `apps/web/src/components/common/LockedFeatureNotice.tsx`
- Warranty UI: `apps/web/src/components/warranties/RenewWarrantyDialog.tsx`,
  status helper `apps/web/src/utils/warrantyStatus.ts`
- Reports surface: `apps/web/src/components/reports/ReportsView.tsx`
- Security panel: `apps/web/src/components/profile/{SecuritySection,
  TwoFactorPanel}.tsx`
- Article power features: `apps/web/src/components/articles/
  {BulkEditDialog,TemplateBar}.tsx`
- Transfer system: `apps/api/src/modules/articles/{transfer.service,
  transfer.routes}.ts`, `apps/web/src/components/articles/TransferDialog.tsx`,
  `apps/web/src/components/transfers/TransfersView.tsx`
