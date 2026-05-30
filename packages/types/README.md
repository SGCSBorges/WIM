# `@wim/types`

Shared TypeScript types and const tuples used by both the API and the web
client.

## What lives here

- **Interfaces** for shapes that cross the API/web boundary (`Article`,
  `FetchedArticle`, `ShareInviteItem`, `DashboardStatistics`, etc.).
- **`as const` tuples** that are the single source of truth for string
  unions appearing on both sides:
  - `AUDIT_ACTIONS` / `AUDIT_ENTITIES` — what the API may log; what the
    admin Audit Log dropdowns filter by.
  - `ARTICLE_NOTE_KINDS` — note categories.
  - `ATTACHMENT_TYPES`, `INVITE_STATUSES`, `SHARE_PERMISSIONS` — keep
    Prisma enums and front-end dropdowns in sync without duplicating the
    literal list.

## The framework-free contract

Importantly, this package depends on **nothing**. No `zod`, no
`@prisma/client`, no React, no Node-only types. That keeps it cheap to
import from either runtime and makes it usable in build tooling.

- The API layer wraps each shared interface in a Zod schema in its own
  module (`apps/api/src/modules/**/*.schemas.ts`) — that's where parsing,
  defaults, and refinements live.
- The web layer treats these interfaces as the API response contract and
  uses them directly.

## Updating a shape

1. Edit `src/index.ts` (add a field, widen a union, etc.).
2. Run `npm run lint` at the repo root — types is just `tsc --noEmit` for
   this package, so any consumer that drifts will fail typecheck.
3. The API likely has a local copy or schema — round 10 consolidated
   `DashboardStatistics` to live only here; do the same for any future
   shape that diverges.

## Const-tuple pattern

The pattern repeats — see `AUDIT_ACTIONS` as the canonical example:

```ts
export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", /* … */] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
```

The tuple is iterable at runtime (e.g. to populate a `<select>`) and the
derived type stays in lock-step with no extra maintenance.
