# Demo runbook — live defence

Operational checklist for presenting WIM live on the free Render deployment.
It exists because the demo hosting has failure modes the application does not:
services sleep, the free database expires, and the free key-value store is
in-memory. None of that is an architecture defect, but all of it can sink a
live demo if it is discovered at the wrong moment.

Hosts: web <https://wim-web.onrender.com> · API <https://wimapi.onrender.com>
(the static site rewrites `/api/*` and `/uploads/*` to the API so the auth
cookie stays same-origin — see `render.yaml` and `docs/architecture.md`).

---

## 1. The day before

**Check the database still exists.** A free Render PostgreSQL instance expires
30 days after creation and is not backed up. This is the single failure that
cannot be fixed in the five minutes before a defence.

```bash
curl -s https://wimapi.onrender.com/health
# {"status":"ok","db":"ok","redis":"ok","queue":{"status":"ok","waiting":N}}
```

`"db":"error"` → the instance is gone or asleep past its grace period. Recreate
it, run the migrations, reseed (§4), and re-check.

**Check the environment variables** that each demonstrable feature needs. A
missing one does not crash the app — the feature just silently no-ops, which is
worse on stage.

| Variable                                                                  | Missing ⇒ you cannot demo                        |
| ------------------------------------------------------------------------- | ------------------------------------------------ |
| `DATABASE_URL`, `JWT_SECRET`                                              | nothing works (API refuses to boot without them) |
| `RESEND_API_KEY` + `MAIL_FROM`                                            | reminder e-mails, weekly digest, password reset  |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`                                  | push notifications                               |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_POWER_USER_PRICE_*` | the upgrade → webhook → role-change flow         |
| `S3_*`                                                                    | documents surviving a sleep or redeploy (§2, §8) |
| `APP_URL`, `CORS_ORIGIN`                                                  | correct links in e-mails; cross-origin requests  |

**Reseed and smoke-test** (§4), then log in once end-to-end.

---

## 2. Thirty minutes before

1. **Wake both services.** A sleeping free instance takes roughly a minute to
   restart. Open the web URL _and_ `GET /health` so the API container is warm
   too — the web app is static and will otherwise wake the API only on your
   first login, in front of the jury.
2. **Without `S3_*`, reseed now (§4).** The seeded invoices, receipts,
   warranty certificates and product photos are files on the API's disk,
   which is ephemeral: a redeploy or restart starts it clean, and treat
   waking from sleep (after ~15 idle minutes) the same way. The rows survive
   in Postgres, the files may not, and opening a lost one shows
   `File missing on disk`. Then keep the API busy until you present.
3. Log in as `admin@admin.com` and leave the tab open. It opens in French
   (the account's stored language) whatever the browser's language. Open one
   document (an article's _Pièces jointes_) to prove the files are there.
4. Re-check `/health` shows `db`, `redis` and `queue` all `ok`.

---

## 3. Credentials

| Account                       | Password    | Notes                                                                                     |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `admin@admin.com`             | your own    | **present from this one.** ADMIN, 100+ articles, French, EUR; "Famille Lambert" household |
| `sophie.lambert@demo.wim.app` | `Demo1234!` | POWER_USER, its partner in the same household                                             |
| `admin@wim.com`               | `Admin123+` | POWER_USER, 100+ articles, French, EUR, light theme; "Famille Martin" household           |
| `thomas.martin@demo.wim.app`  | `Demo1234!` | POWER_USER, `admin@wim.com`'s partner in the same household                               |
| `<name>@demo.wim.app`         | `Demo1234!` | generated users; roles vary (USER / POWER_USER); all French, in France, in EUR            |

`admin@admin.com` is your real operator account (registered by you,
promoted by TestAdmin / `bootstrap-admin`). The reseed **fills** it with a
showcase household — it never creates it, and never changes its password,
role, theme, date format, two-factor setup, passkeys, sessions or audit
trail — so one private login shows every feature, the admin pages
included. `admin@wim.com` is the spare showcase with a fixed password; that
password is in this public repository, so it is a POWER_USER, not an
admin, and the reseed never mints a demo admin either.

Constants live in `apps/api/src/modules/demo/demo.service.ts`
(`DEMO_OPERATOR_EMAIL`, `DEMO_SHOWCASE_EMAIL`, `DEMO_SHOWCASE_PASSWORD`,
`DEMO_PASSWORD`).

Keep the partner (`sophie.lambert@demo.wim.app`) open in a private window to
demonstrate sharing: the two accounts are one household, so each sees the
other's inventory with write access.

---

## 4. Reseeding the demo data

```bash
curl -s -X POST https://wimapi.onrender.com/api/auth/seed-demo -i | head -1
```

| Response | Meaning                                                                |
| -------- | ---------------------------------------------------------------------- |
| `202`    | accepted; runs in the background (~30 s) — poll `/health` or just wait |
| `409`    | a seed is already running                                              |
| `403`    | `DEMO_SEED_ENABLED=false` on this environment                          |

It wipes and recreates every `@demo.wim.app` account **and** the
`admin@wim.com` showcase account, **empties `admin@admin.com` of everything
the seed puts in an account** (articles and all that hangs off them, rooms,
labels, lists, household, shares, conversations) and refills it, removes
any household left with no members, and deletes the document files the
previous seed wrote. It never touches other accounts, and it keeps
`admin@admin.com` itself. Anything you entered by hand in `admin@admin.com`
is replaced on every reseed. If that account doesn't exist yet (a fresh
database), register it and run TestAdmin first, then reseed: the seed skips
an account that doesn't exist. Run it the day before, not during the defence — it
is unauthenticated and rate-limited, and a half-finished seed mid-demo is
unrecoverable. The one exception is §2: without `S3_*`, run it again once
the API is awake, so the documents exist on the disk you will present from.

---

## 5. What the showcase already has on screen

Every reseed stages these on `admin@admin.com` and on `admin@wim.com`
(`ensureShowcaseStories`, `ensureShowcaseExchanges`), so none depends on
luck:

| Story                                                                                 | Where to look                                             |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| A warranty ending in about three weeks                                                | Dashboard → expiring soon; Warranties                     |
| A warranty ending within the week                                                     | Alerts → `Rappel garantie J-1` scheduled this week        |
| An item in repair under an open claim                                                 | Articles filtered by status; its warranty shows the claim |
| An overdue loan, and one due soon                                                     | Loans; Alerts → `Retour de prêt : …`                      |
| A routine service due within a month                                                  | Maintenance; Alerts → `Entretien à prévoir : …`           |
| A home-insurance renewal within ~5 weeks                                              | Insurance; Alerts → `Renouvellement d'assurance : …`      |
| Sold, disposed and lost items                                                         | Articles → status filter; the lost one has a QR page      |
| Items listed to other members, each with a buyer's question (offers on some)          | Shared / Messages                                         |
| A recently deleted item                                                               | Trash                                                     |
| A wishlist item later bought                                                          | Wishlist (struck through)                                 |
| Budgets set from the household's own spending, on track for the year                  | Dashboard → budget                                        |
| A purchase from a friend: question, accepted offer, transfer to accept (5+ days left) | Messages; Transfers                                       |
| A friend it shares with, one sharing with it, an invitation pending (5+ days left)    | Sharing                                                   |
| Someone found the lost item and wrote from its QR page                                | Notification bell → `Objet retrouvé : …`                  |
| Invoices, till receipts, warranty certificates (PDF), each its warranty's proof       | an article → _Pièces jointes_; Articles → _Preuve_        |
| A product photo on every article (credited Commons images)                            | the article header and its _Photos_ section               |

The two showcase accounts are different families: neither shares with,
writes to or transfers anything to the other.

The rest of the inventory is ordinary household life: an onboarding evening
a year ago where most things were entered a few minutes apart, then a
trickle of purchases, phones that were upgraded and sold, and bundles
wherever several pieces of a set are owned.

The documents are generated per article and agree with it: the shop, order
number, date, quantity and price on the PDF are the article's, VAT is split
out at 20 %, an online order gets an A4 invoice (`FA2024-…`) and an in-store
purchase an 80 mm till receipt timed inside French opening hours (never a
Sunday or public holiday). Each carries a `DÉMONSTRATION` watermark and a
"fictitious document" footer.

Every article in the showcase accounts has a product photo, added the way a
user adds one (it shows in the article header and under _Photos_, marked
_Principale_); the other households photographed some of theirs. The photos
are Wikimedia Commons images, each checked by eye: the catalogue's exact
model where Commons has a free photo of it, otherwise a similar product of
the same kind (the same brand where one exists), so most pictures show a
neighbouring model rather than the one on the invoice. They are resized and
committed under `apps/api/assets/demo-photos/`; nothing is hot-linked. The
file name carries the author and licence, and `CREDITS.md` beside the
photos lists every source and marks the similar ones. An article whose
photo shows a colour records that colour.

---

## 6. Making a notification fire _during_ the demo

Do **not** plan to show a reminder that was scheduled days ago. The free
key-value tier is in-memory: a restart drops BullMQ's delayed jobs, so an old
reminder may simply no longer exist. Create one that fires while you talk.

Reminders are scheduled at `executeAt = garantieFin − offset`, and offsets
already in the past are filtered out (`computeWarrantyReminderSchedule`).

**Recipe A — custom alert, ~2 minutes out (most reliable).**
Alerts → _Create alert_ → the date field is a `datetime-local`, so set it two
minutes ahead. It travels the same BullMQ queue and the same processor as a
warranty reminder, and delivers the same push + e-mail.

**Recipe B — warranty reminder, fires immediately.**
Create an article whose warranty ends in **exactly 30 days**. J-30 then lands
on _now_, is not filtered as past, and is enqueued with ~zero delay. The same
trick works with an end date of tomorrow (J-1).

Either way, grant the browser notification permission _before_ you start, and
show the Alerts list and the notification bell alongside the push itself —
they are the parts that do not depend on the OS accepting the notification.

---

## 7. Language and currency

- The app defaults to **French and euros**: a visitor whose browser speaks
  none of the five languages gets French, and a new account is in EUR. A
  browser set to English, Portuguese, Spanish or Dutch still gets that
  language, and an account's stored language always wins.
- The showcase account is French. Everything the server writes for it —
  reminder names, e-mails, push, the weekly digest — is French, including the
  seeded history (`Rappel garantie J-30`, `Retour de prêt : …`).
- Every demo account is a French speaker living in France and paying in
  euros, so the whole demo reads in French. To show the language switch,
  use the gear menu.

---

## 8. What not to demo on free hosting

| Don't                                             | Why                                                                                        | Instead                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Open an attachment uploaded in an earlier session | files sit on an ephemeral disk unless `S3_*` is configured; a sleep or redeploy wipes them | upload a receipt live, or reseed after waking (§2) |
| Rely on a reminder scheduled days ago             | free key-value store is in-memory                                                          | §6                                                 |
| Promise e-mail delivery without checking          | silent no-op when Resend is unconfigured                                                   | verify in §1                                       |
| Leave the first page load to the jury             | ~1 min cold start                                                                          | §2                                                 |

State these limits yourself before anyone asks — they are documented in the
thesis (ch. 6) as deliberate constraints of an academic deployment, not as
defects of the application architecture.

---

## 9. Fallback: run it locally

If Render is unavailable, the whole stack runs on one machine:

```bash
# PostgreSQL + Redis
pg_ctlcluster 16 main start
redis-server --daemonize yes

# API (compiled; ts-node trips on the ESM @wim/types import)
cd apps/api && npm run build && node dist/index.js

# Web, pointed at the local API
cd apps/web && VITE_API_BASE_URL=http://localhost:3000/api npm run build && npm run preview
```

Then seed: `curl -X POST http://localhost:3000/api/auth/seed-demo`. With
`APP_URL=http://localhost:4173` in `apps/api/.env`, document links point at
the preview, which forwards `/uploads/*` to the API like production does.

Have this rehearsed and the terminal already open — switching to it should
cost seconds, not minutes.

---

## 10. Numbers worth quoting

Verified on branch `dev`, 2026-10-10:

| Metric                 | Value                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| API tests              | 636 passed, 45 skipped (85 files)                                                    |
| API integration        | 45/45 against real PostgreSQL (the 45 skipped above), incl. the demo-seed invariants |
| Web tests              | 337 passed (80 files)                                                                |
| End-to-end             | 15/15 Playwright scenarios                                                           |
| API coverage           | 55.01 % statements · 78.73 % branches · 65.80 % functions (gates: 44 / 74 / 63)      |
| Web coverage           | 60.46 % statements · 70.46 % branches · 37.41 % functions (gates: 48 / 62 / 28)      |
| `npm audit --omit=dev` | 0 vulnerabilities                                                                    |
| Accessibility          | 0 axe-core violations across 19 routes × 2 viewport widths (one-off run, not in CI)  |

The figures printed in the thesis are an explicitly dated snapshot (8 July
2026); these are higher. Quote these if asked, and say why they differ.

---

## 11. Questions with evidence behind them

- **"No WCAG audit?"** Correct — no formal audit was commissioned. An
  automated axe-core pass over 19 routes at two widths reports zero
  violations, which is evidence, not a substitute for an audit.
- **"Did you find bugs after submission?"** Yes, and they are instructive: a
  stale-response race where a slow reload repainted a list the user had just
  changed. Fixed with a sequence-token hook (`useLatestRequest`) applied across
  the refetching views, plus a regression test that deliberately lands
  responses out of order.
- **"Why does the frontend proxy `/api` and `/uploads`?"** Safari/iOS ITP
  blocks the cross-site auth cookie; the rewrite makes it same-origin, and
  files need the cookie as much as JSON does — `/uploads/<file>` applies the
  attachment's own access rules. `render.yaml`, and `csrfGuard` covers the
  request side that CORS does not.
- **"Is the free tier production-ready?"** No, and the thesis says so: the
  in-memory queue cannot guarantee deferred reminders and the ephemeral disk
  cannot hold proofs of purchase. Both have named remedies (persistent
  key-value tier, S3-compatible storage) already supported by the code.
- **"Is this real data?"** No — and it is built not to look generated. The
  seeder is held to the facts a real account cannot break (nothing bought
  before the model existed, added before the account, lent before it was
  added, claimed after its warranty ended; receipt-shaped prices; audit rows
  inside the 90-day retention, shaped as the app writes them; no till
  receipt dated when the shop was shut). A CI integration test seeds a batch
  and checks every one of those against real Postgres, plus that every
  document is a real PDF in the app's own store and that the reset deletes
  it. The previous generator failed 18 of them.
