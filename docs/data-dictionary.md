# WIM data dictionary

A field-level reference for every table and enum in the database. It is the
**written companion** to the visual [`docs/uml/03-class-diagram.puml`](./uml/03-class-diagram.svg):
the diagram shows the relationships at a glance, this document is the exhaustive
column-by-column catalog. Both are kept aligned with the single source of truth,
[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) — when any of
the three disagree, the schema wins.

**Scope:** 30 models + 14 enums. Grouped by domain:
[Core inventory](#core-inventory) · [Lifecycle add-ons](#lifecycle-add-ons) ·
[Sharing & transfer](#sharing--transfer) · [Messaging](#messaging) ·
[Account security](#account-security) · [Platform & admin](#platform--admin) ·
[Enums](#enums).

## Conventions

These hold across every table unless a row says otherwise.

- **Primary keys** are auto-increment `Int` (`@id @default(autoincrement())`),
  except `ProcessedStripeEvent` (the Stripe `eventId` string is the PK) and the
  junction tables (composite PKs).
- **Ownership.** Almost every row carries `ownerUserId` (FK → `User.userId`,
  `onDelete: Cascade`). Deleting a user deletes their entire graph. The `Type`
  column flags these as `FK→User`.
- **Nullability.** A `?` in the type means the column is nullable; otherwise it
  is `NOT NULL`. Defaults are listed in the `Default` column.
- **Timestamps.** Most tables have `createdAt` (`@default(now())`) and
  `updatedAt` (`@updatedAt`); they're omitted from the per-table grids and noted
  only when one is absent or semantically interesting.
- **Money** is `Decimal(12,2)` (`Decimal(5,2)` for percentages). Prisma
  serializes `Decimal` as a **string** over JSON to avoid float drift — the web
  client parses + formats it. Never assume a JS `number`.
- **Legacy French names** (`Garantie`, `Alerte*`, `articleNom`, `garantieFin`…)
  are intentionally retained to avoid a costly migration. The shared unions in
  [`@wim/types`](../packages/types) use English names (`AlertStatus`,
  `AttachmentType`…) but the **literal string values are identical**, so a
  Prisma enum value round-trips cleanly to the typed union.
- **Soft-delete** applies only to `Article` (`deletedAt`); everything else is a
  hard delete (often via cascade). Sessions and invites use a `revokedAt` /
  `status` marker instead of removal so they keep an audit trail.

---

## Core inventory

### User

The account and the owner of every other row. Also holds cross-device
preferences and Stripe billing identifiers.

| Field | Type | Default | Notes |
|---|---|---|---|
| `userId` | Int (PK) | auto | |
| `email` | String | — | **Unique**. Login identity. |
| `password` | String | — | bcrypt hash. Never returned by the API. |
| `role` | `Role` | `USER` | USER / POWER_USER / ADMIN. Re-read per request in `authGuard`. |
| `tokenVersion` | Int | `0` | Bumped on force-logout / password / email change → invalidates all older JWTs. |
| `stripeCustomerId` | String? VarChar(80) | null | **Unique**. |
| `stripeSubscriptionId` | String? VarChar(80) | null | **Unique**. Set on upgrade, cleared on downgrade. |
| `currency` | String VarChar(3) | `"USD"` | ISO 4217 display currency. |
| `monthlyBudget` | Decimal(12,2)? | null | Optional spend budget; null = unset. |
| `annualBudget` | Decimal(12,2)? | null | Optional spend budget; null = unset. |
| `calendarToken` | String? VarChar(64) | null | **Unique**. iCal feed capability token; null = feed off. |
| `emailReminders` | Boolean | `true` | Opt-out of emailed warranty reminders. |
| `weeklyDigest` | Boolean | `false` | Opt-in weekly expirations digest. |
| `theme` | String? VarChar(16) | null | `light\|dark\|ocean\|cyber\|sunset`; null = device default. |
| `language` | String? VarChar(8) | null | `en\|fr\|pt\|es\|nl`; null = device default. |
| `dateFormat` | String? VarChar(16) | null | `system\|dd/MM/yyyy\|MM/dd/yyyy\|yyyy-MM-dd`. |
| `alertsSeenAt` | DateTime? | null | High-water mark for the notification bell's unseen count. |
| `totpEnabled` | Boolean | `false` | Fast-path mirror of `TotpSecret.verified`; gates the login flow. |

**Relations:** owns `Article`, `Garantie`, `Alerte`, `Location`, `Tag`,
`ArticleNote`, `SavedView`, `ArticleTemplate`, `Attachment`, `Loan`,
`InsurancePolicy`, `ServiceRecord`, `UserSession`, `PushSubscription`,
`PasswordResetToken`, `AuditLog`; 0..1 `TotpSecret`; participates in
`InventoryShare`/`ShareInvite`/`ArticleTransferRequest`/`MessageThread`/`Message`
on both sides.

### Article

A physical item in the inventory. The hub everything else hangs off.

| Field | Type | Default | Notes |
|---|---|---|---|
| `articleId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `articleNom` | String VarChar(100) | — | Name. Trigram-indexed for substring search. |
| `articleModele` | String VarChar(100) | — | Model. Trigram-indexed. |
| `articleDescription` | String? VarChar(255) | null | Trigram-indexed. |
| `productImageUrl` | String? VarChar(500) | null | External/owned image URL. |
| `serialNumber` | String? VarChar(120) | null | Trigram-indexed; folded into the `q` search. |
| `brand` | String? VarChar(120) | null | Trigram-indexed. |
| `purchasePrice` | Decimal(12,2)? | null | Drives inventory value + depreciation. |
| `depreciationRate` | Decimal(5,2)? | null | Annual straight-line %, 0–100. null = no depreciation. |
| `sharedWithPowerUsers` | Boolean | `false` | Public (read-only) share flag. |
| `publicToken` | String? VarChar(64) | null | **Unique**. Opt-in `/i/<token>` public page; null = off. |
| `status` | `ArticleStatus` | `ACTIVE` | Lifecycle state; organizational, never hides the row. |
| `category` | `ArticleCategory`? | null | Optional broad bucket; null = uncategorized. |
| `deletedAt` | DateTime? | null | Soft-delete (trash). Live reads scope `deletedAt: null`. |

**Relations:** 0..1 `Garantie`; many `Attachment`, `Alerte`, `ArticleNote`,
`ArticleTransferRequest`, `MessageThread`, `Loan`, `ServiceRecord`; M:N to
`Location` (`ArticleLocation`), `Tag` (`ArticleTag`), `InsurancePolicy`
(`ArticleInsurance`). All child rows cascade on article delete.

### Garantie *(warranty)*

1:1 with an article (`garantieArticleId` unique). Renewal rolls the live row
forward and snapshots the prior contract into `WarrantyHistory`; there is never a
second warranty per article.

| Field | Type | Default | Notes |
|---|---|---|---|
| `garantieId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `garantieArticleId` | Int? (FK→Article) | null | **Unique**. Cascade. |
| `garantieNom` | String VarChar(100) | — | Label. |
| `garantieDateAchat` | DateTime | — | Purchase date. |
| `garantieDuration` | Int | — | Duration in **months**. |
| `garantieFin` | DateTime | — | Computed server-side = `dateAchat + duration` months. |
| `garantieIsValide` | Boolean | `true` | |
| `garantieImageAttachmentId` | Int? | null | **Unique**. Optional proof image; `onDelete: SetNull`. |
| `claimStatus` | `ClaimStatus` | `NONE` | Claim workflow state. |
| `claimNote` | String? VarChar(2000) | null | |
| `claimUpdatedAt` | DateTime? | null | |
| `providerName` | String? VarChar(120) | null | Surfaced on the claim PDF. |
| `providerPhone` | String? VarChar(40) | null | |
| `providerUrl` | String? VarChar(2048) | null | |
| `renewedAt` | DateTime? | null | Stamped on first renew/extend; null = never renewed. |

**Relations:** many `Alerte` (the J-30/J-7/J-1 reminders), many `Attachment`,
many `WarrantyHistory`.

### WarrantyHistory

Append-only snapshot of a warranty's state **before** each renewal/extension.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `garantieId` | Int (FK→Garantie) | — | Cascade. |
| `ownerUserId` | Int | — | Denormalized for the owner-scoped index. |
| `event` | `WarrantyHistoryEvent` | — | RENEWED / EXTENDED / REPLACED. |
| `priorDateAchat` | DateTime | — | Pre-change purchase date. |
| `priorDuration` | Int | — | Pre-change duration (months). |
| `priorFin` | DateTime | — | Pre-change end date. |
| `note` | String? VarChar(500) | null | |

### Alerte *(alert / reminder)*

An auto-scheduled warranty reminder or a user-created custom alert. At least one
of `alerteGarantieId` / `alerteArticleId` is set.

| Field | Type | Default | Notes |
|---|---|---|---|
| `alerteId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `alerteNom` | String VarChar(100) | — | |
| `alerteDate` | DateTime | — | When it fires. |
| `alerteDescription` | String? VarChar(255) | null | |
| `status` | `AlerteStatus` | `SCHEDULED` | |
| `kind` | `AlerteKind` | `WARRANTY` | WARRANTY (auto) vs CUSTOM (user). |
| `recurrenceMonths` | Int? | null | CUSTOM only: repeat every N months; null = one-shot. |
| `snoozedUntil` | DateTime? | null | Set on snooze; `alerteDate` moves with it. |
| `sentAt` | DateTime? | null | |
| `failedAt` | DateTime? | null | |
| `errorMessage` | String? VarChar(500) | null | Last delivery error. |
| `errorStack` | String? Text | null | |
| `alerteGarantieId` | Int? (FK→Garantie) | null | Cascade. |
| `alerteArticleId` | Int? (FK→Article) | null | Cascade. |

**Constraint:** unique `(alerteGarantieId, alerteDate)` so a warranty can't
schedule the same J-N reminder twice.

### Attachment

A file (invoice, warranty proof, photo) linked to an article and/or a warranty.

| Field | Type | Default | Notes |
|---|---|---|---|
| `attachmentId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `type` | `AttachmentType` | `INVOICE` | |
| `articleId` | Int? (FK→Article) | null | Cascade. |
| `garantieId` | Int? (FK→Garantie) | null | Cascade (relation `AttachmentGarantie`). |
| `fileName` | String VarChar(255) | — | |
| `mimeType` | String VarChar(100) | — | |
| `fileSize` | Int | — | Bytes. |
| `fileUrl` | String VarChar(500) | — | Points at `/uploads/<file>` (public static) or an external URL. |
| `thumbUrl` | String? VarChar(500) | null | Resized preview for images; null for PDFs. |

> Also the target of `Garantie.garantieImageAttachmentId` via the
> `GarantieImageAttachment` relation (a warranty's designated proof image).

### Location

A storage place. Owner-scoped; unique name per owner.

| Field | Type | Default | Notes |
|---|---|---|---|
| `locationId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(120) | — | **Unique per owner** (`uq_location_owner_name`). |
| `description` | String? VarChar(255) | null | |

### ArticleLocation *(junction)*

M:N between `Article` and `Location`. Composite PK `(articleId, locationId)`.

| Field | Type | Notes |
|---|---|---|
| `articleId` | Int (FK→Article) | Cascade. |
| `locationId` | Int (FK→Location) | Cascade. |
| `assignedAt` | DateTime | `@default(now())`. |

### Tag

A free-form label. Owner-scoped; unique name per owner. Has `createdAt` but no
`updatedAt`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `tagId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(40) | — | **Unique per owner** (`uq_tag_owner_name`). |

### ArticleTag *(junction)*

M:N between `Article` and `Tag`. Composite PK `(articleId, tagId)`. Both FKs
cascade.

### ArticleNote

A timeline entry on an article (service log, claim event, observation).

| Field | Type | Default | Notes |
|---|---|---|---|
| `noteId` | Int (PK) | auto | |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `content` | String VarChar(2000) | — | |
| `kind` | `ArticleNoteKind` | `OTHER` | |

### SavedView

A named Articles-page filter preset. `createdAt` only.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(60) | — | **Unique per owner** (`uq_savedview_owner_name`). |
| `query` | String VarChar(500) | — | Filter querystring, e.g. `warranty=expired&priceMin=100`. |

### ArticleTemplate

A reusable starting point for the create form. Stores locations/tags **by name**
in the JSON payload (not FK ids) so it survives a rename/delete.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `name` | String VarChar(120) | — | |
| `payload` | Json | `{}` | `{ brand?, category?, depreciationRate?, locationNames[], tagNames[] }`. |

---

## Lifecycle add-ons

Paid (POWER_USER-default) per-item modules. Each can spawn a `CUSTOM` reminder
alert via `reminderAlerteId` (cancelled on return/delete).

### Loan

A borrow record. While active, the article's `status` is `LOANED`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `loanId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `borrowerName` | String VarChar(120) | — | |
| `borrowerEmail` | String? VarChar(180) | null | |
| `loanedAt` | DateTime | `now()` | |
| `dueAt` | DateTime? | null | A due date schedules a reminder. |
| `returnedAt` | DateTime? | null | null = still out. |
| `note` | String? VarChar(500) | null | |
| `reminderAlerteId` | Int? | null | The due-date reminder, so a return can cancel it. |

### InsurancePolicy

A policy covering 0..many articles via `ArticleInsurance`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `policyId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `provider` | String VarChar(150) | — | |
| `policyNumber` | String? VarChar(100) | null | |
| `premium` | Decimal(12,2)? | null | Recurring premium. |
| `coverageAmount` | Decimal(12,2)? | null | Total coverage limit. |
| `renewalAt` | DateTime? | null | Schedules a reminder; reschedules on edit. |
| `note` | String? VarChar(500) | null | |
| `reminderAlerteId` | Int? | null | The renewal reminder. |

### ArticleInsurance *(junction)*

M:N between `Article` and `InsurancePolicy`. Composite PK `(articleId, policyId)`.
Both FKs cascade.

### ServiceRecord

An append-only maintenance/service log entry. `createdAt` only.

| Field | Type | Default | Notes |
|---|---|---|---|
| `serviceId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `performedAt` | DateTime | — | |
| `description` | String VarChar(300) | — | |
| `cost` | Decimal(12,2)? | null | |
| `provider` | String? VarChar(150) | null | |
| `nextDueAt` | DateTime? | null | Schedules a "next service" reminder. |
| `reminderAlerteId` | Int? | null | |

---

## Sharing & transfer

### InventoryShare

An active, owner→target inventory-wide share (READ or WRITE).

| Field | Type | Default | Notes |
|---|---|---|---|
| `inventoryShareId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade (`SharesGiven`). |
| `targetUserId` | Int (FK→User) | — | Cascade (`SharesReceived`). |
| `permission` | `SharePermission` | `READ` | |
| `active` | Boolean | `true` | Deactivated (not deleted) on downgrade. |

**Constraint:** unique `(ownerUserId, targetUserId)`.

### ShareInvite

A token-based invitation that materializes an `InventoryShare` on accept.

| Field | Type | Default | Notes |
|---|---|---|---|
| `shareInviteId` | Int (PK) | auto | |
| `ownerUserId` | Int (FK→User) | — | Cascade. |
| `email` | String VarChar(255) | — | Invitee (matched by email — no FK). |
| `token` | String VarChar(128) | — | **Unique**. The capability credential. |
| `status` | `InviteStatus` | `PENDING` | |
| `permission` | `SharePermission` | `READ` | |
| `expiresAt` | DateTime | — | |
| `usedAt` | DateTime? | null | |

**Index:** compound `(ownerUserId, email, status)` for the duplicate-invite check.

### ArticleTransferRequest

A permanent ownership-transfer request for one article. PUSH = owner initiates;
PULL = a share-capable requester initiates. The "second party" accepts.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `requesterId` | Int (FK→User) | — | Wants to receive (`TransferRequests`). Cascade. |
| `ownerId` | Int (FK→User) | — | Current owner (`TransferOffers`). Cascade. |
| `direction` | `TransferDirection` | — | PUSH / PULL. |
| `token` | String VarChar(128) | — | **Unique**. Emailed to the accepting party. |
| `status` | String VarChar(20) | — | `PENDING\|ACCEPTED\|REJECTED\|REVOKED\|EXPIRED` (plain string, not an enum). |
| `message` | String? VarChar(500) | null | |
| `expiresAt` | DateTime | — | 7-day window. |
| `usedAt` | DateTime? | null | Stamped on accept/reject/revoke/expire. |

> `status` is a `VarChar(20)`, **not** a DB enum — validated in the service layer.

---

## Messaging

### MessageThread

A 1:1 negotiation chat pinned to one shared article. Exactly two participants:
the article owner **at creation** (a snapshot — survives a later transfer) and
the interested requester.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `articleId` | Int (FK→Article) | — | Cascade. |
| `ownerUserId` | Int (FK→User) | — | Snapshot owner (`ThreadOwner`). Cascade. |
| `requesterId` | Int (FK→User) | — | `ThreadRequester`. Cascade. |
| `lastMessageAt` | DateTime | `now()` | Denormalized for cheap inbox sort. |
| `ownerUnread` | Boolean | `false` | Per-side unread flag. |
| `requesterUnread` | Boolean | `false` | |

**Constraint:** unique `(articleId, requesterId)` — one thread per pair.

### Message

A message within a thread: plain `TEXT` or a structured purchase `OFFER`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `threadId` | Int (FK→MessageThread) | — | Cascade. |
| `senderUserId` | Int (FK→User) | — | Cascade (`MessageSender`). |
| `body` | String VarChar(2000) | — | |
| `kind` | `MessageKind` | `TEXT` | |
| `offerAmount` | Decimal(12,2)? | null | OFFER only. |
| `offerStatus` | `OfferStatus`? | null | OFFER only: PENDING/ACCEPTED/DECLINED/WITHDRAWN. |

Has `createdAt` only.

---

## Account security

### UserSession

One row per active sign-in. `jti` matches the JWT claim and the Redis denylist
key, so revoking here revokes the token network-wide.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `jti` | String VarChar(64) | — | **Unique**. JWT id + denylist key. |
| `deviceLabel` | String? VarChar(120) | null | |
| `ip` | String? VarChar(80) | null | |
| `userAgent` | String? VarChar(255) | null | |
| `lastActiveAt` | DateTime | `now()` | Bumped best-effort (throttled 1/min) by `authGuard`. |
| `revokedAt` | DateTime? | null | Soft-revoke; keeps the row out of the "active" view. |

### TotpSecret

Per-user 2FA secret + hashed backup codes. 1:1 with `User`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | **Unique**. Cascade. |
| `secret` | String VarChar(64) | — | base32 TOTP secret. |
| `backupCodesHash` | String Text | — | JSON array of bcrypt-hashed single-use codes. |
| `verified` | Boolean | `false` | Flips true once a code confirms setup → bumps `User.totpEnabled`. |

### PasswordResetToken

A short-lived reset token. Only the SHA-256 hash is stored.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `tokenHash` | String VarChar(64) | — | **Unique**. SHA-256 hex; plaintext is emailed, never stored. |
| `expiresAt` | DateTime | — | |
| `consumedAt` | DateTime? | null | Set on use. |

Has `createdAt` only.

### PushSubscription

A Web Push (VAPID) browser subscription.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int (FK→User) | — | Cascade. |
| `endpoint` | String VarChar(500) | — | **Unique**. Push service URL. |
| `p256dh` | String VarChar(200) | — | Client public key. |
| `auth` | String VarChar(100) | — | Auth secret. |

Has `createdAt` only.

---

## Platform & admin

### AuditLog

An append-only action log. `userId` is **`onDelete: SetNull`** (not cascade) —
rows survive the actor's deletion as an anonymized trail.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `userId` | Int? (FK→User) | null | **SetNull** on user delete. |
| `action` | String VarChar(80) | — | e.g. `LOGIN`, `CREATE`, `BILLING_UPGRADE`, `WARRANTY_RENEW` (the `AUDIT_ACTIONS` union). |
| `entity` | String VarChar(80) | — | e.g. `User`, `Article`. |
| `entityId` | Int? | null | |
| `ip` | String? VarChar(80) | null | |
| `userAgent` | String? VarChar(255) | null | |
| `method` | String? VarChar(20) | null | HTTP method. |
| `path` | String? VarChar(255) | null | |
| `status` | Int? | null | HTTP status. |
| `metadata` | Json | `{}` | Action-specific extra data. |

Has `createdAt` only. Indexed on `(userId, createdAt desc)` for the admin
"user X, last N days" view.

### FeatureFlag

An admin override of a feature's required role. Absent row = coded default.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `featureKey` | String VarChar(60) | — | **Unique**. e.g. `sharing`, `reports`, `analytics`. |
| `requiredRole` | `Role` | `USER` | Minimum role; POWER_USER = the paywall. |

Has `updatedAt` only (no `createdAt`).

### FeatureTempGrant

A time-bounded window letting USER-role accounts use a normally POWER_USER-gated
feature. Any active grant covering the key lifts access until `expiresAt`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `id` | Int (PK) | auto | |
| `featureKey` | String VarChar(60) | — | Not unique — multiple grants can coexist. |
| `expiresAt` | DateTime | — | Re-checked against `now()` at read time. |
| `note` | String? VarChar(255) | null | |

Has `createdAt` only. **No `ownerUserId`** — grants are global per feature, not
per user.

### ProcessedStripeEvent

The webhook idempotency marker. Survives restarts.

| Field | Type | Default | Notes |
|---|---|---|---|
| `eventId` | String VarChar(255) (PK) | — | Stripe event id **is** the PK. |
| `type` | String VarChar(100) | — | Event type. |
| `processedAt` | DateTime | `now()` | |

**No `ownerUserId`** — it's a standalone platform table.

---

## Enums

Each enum below is mirrored by an `as const` union in
[`@wim/types`](../packages/types/src/index.ts) (English names; identical literal
values) so the API and web share one source of truth.

| Enum | Values | Used by |
|---|---|---|
| `Role` | `USER` · `POWER_USER` · `ADMIN` | `User.role`, `FeatureFlag.requiredRole`. Hierarchy `USER < POWER_USER < ADMIN`. |
| `SharePermission` | `READ` · `WRITE` | `InventoryShare`, `ShareInvite`. |
| `InviteStatus` | `PENDING` · `ACCEPTED` · `REVOKED` · `EXPIRED` | `ShareInvite.status`. |
| `AttachmentType` | `INVOICE` · `WARRANTY` · `OTHER` | `Attachment.type`. |
| `AlerteStatus` | `SCHEDULED` · `SENT` · `CANCELLED` · `FAILED` | `Alerte.status`. |
| `AlerteKind` | `WARRANTY` · `CUSTOM` | `Alerte.kind`. |
| `ClaimStatus` | `NONE` · `OPEN` · `APPROVED` · `REJECTED` · `RESOLVED` | `Garantie.claimStatus`. |
| `ArticleNoteKind` | `SERVICE` · `WARRANTY_CLAIM` · `MAINTENANCE` · `OTHER` | `ArticleNote.kind`. |
| `ArticleStatus` | `ACTIVE` · `IN_REPAIR` · `LOANED` · `SOLD` · `DISPOSED` · `LOST` | `Article.status`. `SOLD/DISPOSED/LOST` are excluded from value totals. |
| `ArticleCategory` | `ELECTRONICS` · `APPLIANCE` · `FURNITURE` · `TOOL` · `VEHICLE` · `CLOTHING` · `JEWELRY` · `SPORTS` · `COLLECTIBLE` · `OTHER` | `Article.category` (nullable). |
| `TransferDirection` | `PUSH` · `PULL` | `ArticleTransferRequest.direction`. |
| `MessageKind` | `TEXT` · `OFFER` | `Message.kind`. |
| `OfferStatus` | `PENDING` · `ACCEPTED` · `DECLINED` · `WITHDRAWN` | `Message.offerStatus` (OFFER messages only). |
| `WarrantyHistoryEvent` | `RENEWED` · `EXTENDED` · `REPLACED` | `WarrantyHistory.event`. |

> Note: `ArticleTransferRequest.status` is a `VarChar(20)`, **not** a DB enum,
> though it carries the same five values an enum would
> (`PENDING/ACCEPTED/REJECTED/REVOKED/EXPIRED`). It is validated in the service
> layer.
