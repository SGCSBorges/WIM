# Demo runbook — live defence

Operational checklist for presenting WIM live on the free Render deployment.
It exists because the demo hosting has failure modes the application does not:
services sleep, the free database expires, and the free key-value store is
in-memory. None of that is an architecture defect, but all of it can sink a
live demo if it is discovered at the wrong moment.

Hosts: web <https://wim-web.onrender.com> · API <https://wimapi.onrender.com>
(the static site rewrites `/api/*` to the API so the auth cookie stays
same-origin — see `render.yaml` and `docs/architecture.md`).

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
| `S3_*`                                                                    | attachments surviving a redeploy (see §7)        |
| `APP_URL`, `CORS_ORIGIN`                                                  | correct links in e-mails; cross-origin requests  |

**Reseed and smoke-test** (§4), then log in once end-to-end.

---

## 2. Thirty minutes before

1. **Wake both services.** A sleeping free instance takes roughly a minute to
   restart. Open the web URL _and_ `GET /health` so the API container is warm
   too — the web app is static and will otherwise wake the API only on your
   first login, in front of the jury.
2. Log in as the showcase account and leave the tab open.
3. **Set the interface language** (gear → Langue). The showcase account ships
   with `language: "en"`; see §6.
4. Re-check `/health` shows `db`, `redis` and `queue` all `ok`.

---

## 3. Credentials

| Account               | Password    | Notes                                                 |
| --------------------- | ----------- | ----------------------------------------------------- |
| `admin@wim.com`       | `Admin123+` | ADMIN, ≥100 articles, EUR, light theme, language `en` |
| `<name>@demo.wim.app` | `Demo1234!` | generated demo users; roles vary (USER / POWER_USER)  |

Constants live in `apps/api/src/modules/demo/demo.service.ts`
(`DEMO_SHOWCASE_EMAIL`, `DEMO_SHOWCASE_PASSWORD`, `DEMO_PASSWORD`).

Keep a second account handy to demonstrate sharing: the seeder builds
households, so two demo users already share inventories with each other.

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
`admin@wim.com` showcase account. It never touches other accounts. Run it the
day before, not during the defence — it is unauthenticated and rate-limited,
and a half-finished seed mid-demo is unrecoverable.

---

## 5. Making a notification fire _during_ the demo

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

## 6. Language, for a French defence

- The showcase account's stored `language` is `en`. Switch it in the gear menu
  (Langue → Français); the choice persists to the account, so do it the day
  before and it will still be French on the day.
- Server-generated copy follows `User.language`: reminder e-mails, push text,
  the weekly digest, and the stored name of auto-scheduled warranty alerts
  (`Rappel garantie J-30` once the account is French).
- **Pre-seeded alerts are English fixtures.** The seeder writes its own strings
  (`Warranty expiring in N day(s)`) directly and does not go through the
  localised label. To show a French alert name, switch the language first and
  then create a warranty live (Recipe B does both at once).

---

## 7. What not to demo on free hosting

| Don't                                             | Why                                                                               | Instead               |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------- |
| Open an attachment uploaded in an earlier session | files sit on an ephemeral disk unless `S3_*` is configured; a redeploy wipes them | upload a receipt live |
| Rely on a reminder scheduled days ago             | free key-value store is in-memory                                                 | §5                    |
| Promise e-mail delivery without checking          | silent no-op when Resend is unconfigured                                          | verify in §1          |
| Leave the first page load to the jury             | ~1 min cold start                                                                 | §2                    |

State these limits yourself before anyone asks — they are documented in the
thesis (ch. 6) as deliberate constraints of an academic deployment, not as
defects of the application architecture.

---

## 8. Fallback: run it locally

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

Then seed: `curl -X POST http://localhost:3000/api/auth/seed-demo`.

Have this rehearsed and the terminal already open — switching to it should
cost seconds, not minutes.

---

## 9. Numbers worth quoting

Verified on branch `dev`, 2026-10-10:

| Metric                 | Value                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| API tests              | 611 passed, 42 skipped (81 files)                                               |
| Web tests              | 318 passed (76 files)                                                           |
| End-to-end             | 14/14 Playwright scenarios                                                      |
| API coverage           | 54.84 % statements · 78.26 % branches · 65.63 % functions (gates: 44 / 74 / 63) |
| Web coverage           | 60.32 % statements · 69.55 % branches · 37.20 % functions (gates: 48 / 62 / 28) |
| `npm audit --omit=dev` | 0 vulnerabilities                                                               |
| Accessibility          | 0 axe-core violations across 19 routes × 2 viewport widths                      |

The figures printed in the thesis are an explicitly dated snapshot (8 July
2026); these are higher. Quote these if asked, and say why they differ.

---

## 10. Questions with evidence behind them

- **"No WCAG audit?"** Correct — no formal audit was commissioned. An
  automated axe-core pass over 19 routes at two widths reports zero
  violations, which is evidence, not a substitute for an audit.
- **"Did you find bugs after submission?"** Yes, and they are instructive: a
  stale-response race where a slow reload repainted a list the user had just
  changed. Fixed with a sequence-token hook (`useLatestRequest`) applied across
  the refetching views, plus a regression test that deliberately lands
  responses out of order.
- **"Why does the frontend proxy `/api`?"** Safari/iOS ITP blocks the
  cross-site auth cookie; the rewrite makes it same-origin. `render.yaml`,
  and `csrfGuard` covers the request side that CORS does not.
- **"Is the free tier production-ready?"** No, and the thesis says so: the
  in-memory queue cannot guarantee deferred reminders and the ephemeral disk
  cannot hold proofs of purchase. Both have named remedies (persistent
  key-value tier, S3-compatible storage) already supported by the code.
