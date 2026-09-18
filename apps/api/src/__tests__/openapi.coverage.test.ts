import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards the claim `openapi/document.ts` makes about itself ("...are all
 * listed below") and the one `docs/api.md` makes for it ("the canonical,
 * machine-readable reference").
 *
 * Nothing enforced either claim, and 37 endpoints had drifted out of the
 * published spec — including the whole TOTP setup flow, session management,
 * warranty renew/extend/history and the agenda. This test makes the claim
 * checkable: every route the app mounts must either appear in the document
 * or be named in UNDOCUMENTED below.
 *
 * The allowlist is an inventory of the existing debt, not permission to add
 * more. Adding a new route without a spec entry fails here; removing an
 * entry from the allowlist as it gets documented is the intended direction
 * of travel. The test also fails when an allowlisted path turns out to be
 * documented after all, so the list can't rot.
 *
 * Routes are read statically rather than by walking the Express stack:
 * `createApp()` pulls in Prisma and BullMQ, which is far too heavy (and too
 * slow) for a unit test.
 */

const API_SRC = path.resolve(__dirname, "..");
const REPO_API = path.resolve(__dirname, "../..");

/** `:id` and `:token([a-f0-9]{64})` both collapse to a single `{p}`. */
function normalise(p: string): string {
  const withBraces = p.replace(/:([A-Za-z_]\w*)(\([^)]*\))?/g, "{$1}");
  return withBraces.replace(/\{[^}]+\}/g, "{p}").replace(/\/+$/, "") || "/";
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

/** Every `router.<verb>("path")` declared in a route module. */
function routePaths(file: string): string[] {
  const out: string[] = [];
  for (const m of read(file).matchAll(
    /router\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g
  )) {
    out.push(m[2]);
  }
  return out;
}

/** Route modules a given module mounts into itself via `router.use(x)`. */
function nestedModules(file: string): string[] {
  const src = read(file);
  const imports = new Map<string, string>();
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+"([^"]+)"/g)) {
    imports.set(m[1], m[2]);
  }
  const out: string[] = [];
  for (const m of src.matchAll(/router\.use\(\s*(\w+)\s*\)/g)) {
    const spec = imports.get(m[1]);
    if (spec) out.push(path.resolve(path.dirname(file), `${spec}.ts`));
  }
  return out;
}

function collectMountedRoutes(): Set<string> {
  const appSrc = read(path.join(API_SRC, "app.ts"));

  // import <var> from "./modules/.../x.routes"  →  var: absolute file
  const fileOf = new Map<string, string>();
  for (const m of appSrc.matchAll(/import\s+(\w+)\s+from\s+"(\.[^"]+)"/g)) {
    fileOf.set(m[1], path.resolve(API_SRC, `${m[2]}.ts`));
  }

  const mounted = new Set<string>();
  for (const m of appSrc.matchAll(
    /app\.use\(\s*"(\/api[^"]*)"\s*,\s*(?:security\.\w+\s*,\s*)?(\w+)\s*\)/g
  )) {
    const [, prefix, varName] = m;
    const file = fileOf.get(varName);
    if (!file || !fs.existsSync(file)) continue;
    for (const f of [file, ...nestedModules(file)]) {
      if (!fs.existsSync(f)) continue;
      for (const p of routePaths(f)) {
        mounted.add(normalise(`${prefix}${p}`.replace(/\/{2,}/g, "/")));
      }
    }
  }
  return mounted;
}

function documentedPaths(): Set<string> {
  const doc = read(path.join(API_SRC, "openapi", "document.ts"));
  const out = new Set<string>();
  for (const m of doc.matchAll(/"(\/api\/[^"]*)":\s*\{/g)) {
    out.add(normalise(m[1]));
  }
  return out;
}

/**
 * Known-undocumented endpoints, as of the review that added this test.
 * Shrink this list; do not grow it.
 */
const UNDOCUMENTED = new Set<string>([
  "/api/admin/db-stats",
  "/api/admin/features",
  "/api/admin/features/grants",
  "/api/admin/features/grants/{p}",
  "/api/admin/features/{p}",
  "/api/alerts/mark-seen",
  "/api/alerts/notifications",
  "/api/articles/bulk-update",
  "/api/articles/bundles",
  "/api/articles/shared-public",
  "/api/articles/unshare-all",
  "/api/articles/{p}/favorite",
  "/api/attachments/warranty/{p}",
  "/api/auth/bootstrap-admin",
  "/api/auth/forgot-password",
  "/api/auth/login/verify-totp",
  "/api/auth/reset-password",
  "/api/calendar/agenda",
  "/api/locations/{p}/articles",
  "/api/locations/{p}/articles/{p}",
  "/api/openapi.json",
  "/api/profile/me/login-history",
  "/api/profile/me/preferences",
  "/api/profile/me/sessions",
  "/api/profile/me/sessions/revoke-others",
  "/api/profile/me/sessions/{p}",
  "/api/profile/me/totp",
  "/api/profile/me/totp/setup",
  "/api/profile/me/totp/verify",
  "/api/saved-views/shared",
  "/api/shares/invites/{p}",
  "/api/shares/received",
  "/api/statistics/locations",
  "/api/warranties/providers",
  "/api/warranties/{p}/extend",
  "/api/warranties/{p}/history",
  "/api/warranties/{p}/renew",
]);

describe("OpenAPI coverage", () => {
  const mounted = collectMountedRoutes();
  const documented = documentedPaths();

  it("finds the mounted routes and the document (parser sanity)", () => {
    // If either parser silently matched nothing the assertions below would
    // pass vacuously, so pin both to a plausible floor.
    expect(mounted.size).toBeGreaterThan(100);
    expect(documented.size).toBeGreaterThan(100);
    // A route everyone agrees exists, on both sides.
    expect(mounted.has("/api/articles")).toBe(true);
    expect(documented.has("/api/articles")).toBe(true);
  });

  it("documents every mounted route, or names it as known-undocumented", () => {
    const missing = [...mounted]
      .filter((p) => !documented.has(p) && !UNDOCUMENTED.has(p))
      .sort();
    expect(missing).toEqual([]);
  });

  it("keeps the known-undocumented list free of stale entries", () => {
    const nowDocumented = [...UNDOCUMENTED]
      .filter((p) => documented.has(p))
      .sort();
    expect(nowDocumented).toEqual([]);
  });

  it("keeps the known-undocumented list free of deleted routes", () => {
    const gone = [...UNDOCUMENTED].filter((p) => !mounted.has(p)).sort();
    expect(gone).toEqual([]);
  });
});

// Referenced so the repo-root constant isn't flagged as unused if the
// docs-side assertions move; keeps the intent visible.
void REPO_API;
