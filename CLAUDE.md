# WIM — Warranty & Inventory Manager

Quick orientation for a fresh chat. This file lives at the repo root so it
loads into every new Claude Code session.

## Stack

- **Monorepo**: npm workspaces. `apps/api`, `apps/web`, `packages/types`.
- **API** (`apps/api`): Node 22, Express + TypeScript + Prisma + PostgreSQL
  + Redis (ioredis) + BullMQ + Stripe + JWT. Auth via httpOnly cookies, JWT
  with `jti` (Redis denylist on logout) + `v` (per-user `tokenVersion` for
  force-logout). Helmet + CORS + rate limiting in `config/security.ts`.
  Audit logs via `auditAction` (typed action union — extend when adding new
  ones). Background workers in `src/jobs/workers.ts`.
- **Web** (`apps/web`): Vite + React 19 + React Router v7 + Tailwind v3 +
  react-hook-form + Zod (resolvers v5 for Zod v4 compatibility). Route-level
  code splitting with `React.lazy`. PWA-installable (manifest + service
  worker + sharp-generated icons).
- **Shared types** (`packages/types`): plain interfaces (no Zod/Prisma) so
  both runtimes can import.

## Git commit rules

- Never add "Co-Authored-By" or "Generated with Claude Code" to commit messages.
- Always use the default system `user.name` and `user.email` from git config.

## Branching & deploy

- **Always work on the `dev` branch. Never create custom branches — all commits go to `dev`.**
- Develop on **`dev`**. Push to dev triggers CI and Render redeploys.
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
  orange accent). Don't hardcode Tailwind colors on shared components —
  use `.ui-*` utility classes (`ui-card`, `ui-btn-primary`,
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
- **App shell**: `components/layout/{AppShell,Sidebar,TopBar,MobileDrawer}`.
  Sidebar collapse state persists in `localStorage["wim.sidebar.collapsed"]`.
  `AppShell` also renders a `BackToTop` floating button (appears past 600px
  of scroll; smooth-scrolls up, instant under `prefers-reduced-motion`).
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
- **Preferences**: cross-device prefs (`theme`/`language`/`dateFormat`)
  live on the `User` row. The auth `/me` payload carries them; client
  providers (`theme/theme.tsx`, `i18n/i18n.tsx`,
  `preferences/preferences.tsx`) expose `hydrate*` to apply them on
  login without echoing back, and write user-initiated changes through
  to `PUT /api/profile/me/preferences` (debounced, best-effort).
  `localStorage` is the pre-auth cache + logged-out fallback. UI
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
- **Don't introduce email enumeration**: helpers that look up a user by
  email should return the same error for "not found" vs "found but
  wrong role" (see `ShareService.createInvite`).
- **Status transitions are atomic `updateMany` with the precondition in
  the WHERE clause** (`status: "PENDING"`, `active: true`,
  `expiresAt: { gt: now }`), checking `count === 0` — never
  read-then-update, which races. See `assertNotExpired`,
  `ShareService.revokeInvite/updateShare/revokeShare`, `acceptInvite`.
- **Auth checks come BEFORE any state-mutating guard** (e.g. the lazy
  EXPIRED stamp in `assertNotExpired`) so an unauthorized caller can't
  trigger writes. Tests under "auth-before-expiry ordering" enforce it.
- **Serializable-transaction guards must re-read inside the tx**: a role
  snapshot taken before `$transaction` is stale by definition — the
  admin last-admin guards re-fetch the target's role inside the tx and
  keep the outer read only for audit metadata.
- **Timeout racing**: use `utils/with-timeout.ts` (`withTimeout(p, ms,
  message)`) — it cancels the timer when the promise settles. Don't
  hand-roll `Promise.race` + `setTimeout` copies.
- **Don't add error handling, fallbacks, or comments for impossible
  cases.** Only at system boundaries.
- **Comments**: describe *why*, not *what*. Skip them entirely when the
  name says enough.
- **Always edit existing files** rather than creating new ones unless
  the new file is genuinely needed.

## Accessibility & UX conventions

These patterns are established throughout the codebase. Apply them
consistently when adding or editing any frontend component.

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

Always set these on every text `<input>` / `<Input>`:

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
`LanguageThemeSelector` appears in TopBar, MobileDrawer, and LoginForm)
must use `useId()` from React for their label `htmlFor`/`id` pairs
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

Use the `<Segmented>` component (which implements `role="radiogroup"` +
`role="radio"` with roving tabindex and Arrow/Home/End keyboard nav)
for any filter that switches between a fixed set of mutually-exclusive
views. Don't reach for plain `<button>` groups for this pattern.

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

## Reports & insurance portfolio

- `GET /api/reports/portfolio.pdf` streams an insurance-ready PDF via
  PDFKit (cover totals, per-location manifest, uninsured/expired list
  sorted by value desc). Honors the same filters as the article list
  (`locationId`, `tagId`, `warrantyStatus`). Auth-gated +
  destructive-rate-limited; audited as `DB_EXPORT` with
  `metadata.report="portfolio"`.
- Totals use the **same `currentValue`** depreciation helper as the
  dashboard + claim PDF (`apps/api/src/modules/common/depreciation.ts`),
  so figures don't drift between surfaces.
- Inventory CSV (`/articles/export/inventory.csv`) gains a read-only
  `currentValue` column computed at export time; the importer ignores
  unknown columns so the round-trip stays clean.
- Web: lazy `/reports` route (`components/reports/ReportsView.tsx`)
  with three Selects + `downloadBlob`. Nav item `reports` added to
  `src/lib/navItems.ts` for every authenticated user.

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
  caller's token expired first. Don't "optimize" this back.
  **Identity changes invalidate sessions**: email change (self-serve
  `PUT /profile/me/email` or admin `PATCH /admin/users/:id`) bumps
  `tokenVersion` exactly like a password change; the self-serve route
  reissues a fresh cookie so the calling device stays signed in.
- **TOTP 2FA**: `User.totpEnabled` (fast-path flag) + `TotpSecret`
  (base32 secret + bcrypt-hashed single-use backup codes + verified
  flag). Setup → verify → disable, all password-gated. Login: when
  `totpEnabled` is true, `/auth/login` returns a 5-minute pre-auth
  `challengeToken` (`kind:"totp-challenge"` so it can't be mistaken
  for a session) instead of dropping a cookie; the client POSTs the
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
  `cmd_palette=ADMIN`; **every other feature (`sharing`, `transfers`,
  `reports`, `templates`, `bulk_edit`, `saved_views`, `notifications`,
  `calendar_feed`, `csv_import`, `csv_export`) defaults to `POWER_USER`** —
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
  (`/articles/export/inventory.csv`). `cmd_palette` is frontend-only (it
  reuses the shared article-search endpoint, so there's no dedicated route to
  gate). Every gate except `cmd_palette` (ADMIN) defaults to POWER_USER, so
  by default these are all paid features; an admin can lower a bar to USER
  per feature to make one free.
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

## Known gotchas

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
  `window.location.origin`; absolute bases ignore it) whenever an endpoint
  needs `URL`/`searchParams` — never construct `new URL` from `API_BASE_URL`
  directly. This broke every list view in production once.
- **Vite hashes asset filenames**, so a new deploy invalidates old CSS
  references in the SW cache automatically. `index.html` is fetched
  network-first so users get the fresh hash.
- **Dependency `overrides`** (root `package.json`): pin transitive deps to
  patched versions so the `npm audit --omit=dev --audit-level=moderate` CI
  gate stays green (e.g. `qs: 6.15.2`, forced into `stripe` /
  `swagger-ui-express` / `supertest`). The gate is **production-only** —
  remaining dev-tooling advisories (esbuild/vite/vitest) are accepted
  because that stack never ships and the fix is a breaking Vite major.
  When an audit finding appears, prefer adding/bumping an override over
  loosening the gate. Caveat: an override on a package that's also a *peer
  dep* of another (e.g. `express` under `swagger-ui-express`) can relocate
  the install into a workspace `node_modules` and break root resolution —
  if `npm ci` then can't find the module at runtime, ensure the root
  `node_modules/<pkg>` lockfile entry still exists.

## Open items / temporary stuff

- **`/api/auth/bootstrap-admin`** + the `TestAdmin` button on the login
  screen are temporary. They one-shot promote `admin@admin.com` if and
  only if there's no ADMIN yet (so they're idempotent and not a
  backdoor). User wants to keep them around for now since Render's free
  Postgres expires monthly and they'd otherwise have to re-promote
  manually. Remove once the seed flow is replaced.
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
- Article templates: `apps/api/src/modules/articles/{template.service,
  template.routes}.ts`
- Billing: `apps/api/src/modules/billing/{billing,billing.me,billing.webhook}.routes.ts`
- Admin: `apps/api/src/modules/admin/admin.routes.ts`
- Feature gating: `apps/api/src/modules/features/{feature.service,
  feature.routes}.ts`, web `apps/web/src/features/features.tsx`,
  admin UI `apps/web/src/components/admin/AdminFeaturesTab.tsx`
- Web entry: `apps/web/src/main.tsx`, routes in `apps/web/src/App.tsx`
- App shell: `apps/web/src/components/layout/{AppShell,Sidebar,TopBar,
  MobileDrawer,NotificationBell,RouteChrome}.tsx`, nav model in
  `src/lib/navItems.ts`; `BackToTop` in `components/common/`
- UI primitives: `apps/web/src/components/ui/` (barrel `index.ts`)
- Hooks: `apps/web/src/hooks/{useHotkeys,useFileDrop,useApiForm,
  useUnsavedChangesGuard}.ts`
- API client: `apps/web/src/services/api.ts`
- i18n: `apps/web/src/i18n/{i18n.tsx,translations.ts,translations.extras.ts}`
- Theme + prefs: `apps/web/src/theme/theme.tsx`,
  `apps/web/src/preferences/preferences.tsx`, CSS in
  `apps/web/src/index.css` (incl. `data-density="compact"` rules)
- Onboarding / actionable home: `apps/web/src/components/onboarding/
  OnboardingChecklist.tsx`, `apps/web/src/components/dashboard/
  NeedsAttention.tsx`
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
