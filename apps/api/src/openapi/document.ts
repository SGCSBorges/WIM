/**
 * OpenAPI document for the WIM API.
 *
 * Hand-built from the Zod schemas already used at runtime for request
 * validation, so endpoint shapes can't drift from what the server
 * actually accepts. To document a new endpoint, add an entry under
 * `paths` below and reference its Zod input/output schemas inline.
 *
 * Auth, articles, locations, warranties, alerts, attachments, notes,
 * shares, transfers, messaging, tags, saved-views, calendar, push,
 * billing, profile, admin, statistics, loans, insurance, maintenance,
 * the public item page, and the meta endpoints are all listed below.
 */

import { z } from "zod";
import { createDocument } from "zod-openapi";
import { RegisterSchema, LoginSchema } from "../modules/auth/auth.schemas";
import {
  ArticleCreateSchema,
  ArticleUpdateSchema,
} from "../modules/articles/article.schemas";
import {
  LocationCreateSchema,
  LocationUpdateSchema,
} from "../modules/locations/location.schemas";

const ErrorResponse = z.object({
  error: z.string(),
});

const UserShape = z.object({
  userId: z.number().int(),
  email: z.string().email(),
  role: z.enum(["USER", "POWER_USER", "ADMIN"]),
});

const AuthSuccess = z.object({
  user: UserShape,
});

const cookieAuth = {
  cookieAuth: [],
};

const json = (schema: z.ZodTypeAny) => ({
  content: { "application/json": { schema } },
});

export function buildOpenApiDocument() {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "WIM API",
      description:
        "Warranty & Inventory Manager — REST API. Cookie-based JWT auth via the `wim_token` httpOnly cookie. Most endpoints below also accept an `Authorization: Bearer <jwt>` header.",
      version: "0.1.0",
    },
    servers: [
      { url: "https://wimapi.onrender.com", description: "Production" },
      { url: "http://localhost:3000", description: "Local dev" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "wim_token",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths: {
      "/api/auth/register": {
        post: {
          tags: ["auth"],
          summary: "Create a new user account and receive an auth cookie.",
          requestBody: { ...json(RegisterSchema), required: true },
          responses: {
            "201": { description: "Created", ...json(AuthSuccess) },
            "409": {
              description: "Email already registered",
              ...json(ErrorResponse),
            },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["auth"],
          summary: "Exchange credentials for an auth cookie.",
          requestBody: { ...json(LoginSchema), required: true },
          responses: {
            "200": { description: "Authenticated", ...json(AuthSuccess) },
            "401": {
              description: "Invalid credentials",
              ...json(ErrorResponse),
            },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["auth"],
          summary:
            "Invalidate the current token (added to Redis denylist) and clear the cookie.",
          security: [cookieAuth],
          responses: {
            "204": { description: "Logged out" },
            "401": { description: "Missing or invalid token" },
          },
        },
      },
      "/api/auth/seed-demo": {
        post: {
          tags: ["auth"],
          summary:
            "Temporary demo-data loader (login-screen button). Appends 100 users × 100 articles + the full feature set in the background and returns 202 immediately. Append-only; demo accounts start after a reserved id margin. Idempotent: refused once the user count passes DEMO_SEED_MAX_EXISTING_USERS. Disable with DEMO_SEED_ENABLED=false.",
          responses: {
            "202": { description: "Seeding started (returns shared password)" },
            "403": { description: "Demo seeding disabled" },
            "409": {
              description:
                "A seed is already running, or demo data is already loaded",
            },
          },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["auth"],
          summary: "Return the authenticated user's profile.",
          security: [cookieAuth],
          responses: {
            "200": { description: "OK", ...json(UserShape) },
            "401": { description: "Missing or invalid token" },
          },
        },
      },

      "/api/articles": {
        get: {
          tags: ["articles"],
          summary:
            "List the caller's articles with search, filters, sort + pagination.",
          security: [cookieAuth],
          parameters: [
            {
              name: "locationId",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "tag",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "q",
              in: "query",
              required: false,
              description: "Trigram substring search over name/model/etc.",
              schema: { type: "string", maxLength: 200 },
            },
            {
              name: "warrantyStatus",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["valid", "expiringSoon", "expired", "none"],
              },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "ACTIVE",
                  "IN_REPAIR",
                  "LOANED",
                  "SOLD",
                  "DISPOSED",
                  "LOST",
                ],
              },
            },
            {
              name: "category",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "ELECTRONICS",
                  "APPLIANCE",
                  "FURNITURE",
                  "TOOL",
                  "VEHICLE",
                  "CLOTHING",
                  "JEWELRY",
                  "SPORTS",
                  "COLLECTIBLE",
                  "OTHER",
                ],
              },
            },
            {
              name: "priceMin",
              in: "query",
              required: false,
              schema: { type: "number", minimum: 0 },
            },
            {
              name: "priceMax",
              in: "query",
              required: false,
              schema: { type: "number", minimum: 0 },
            },
            {
              name: "createdFrom",
              in: "query",
              required: false,
              schema: { type: "string", format: "date" },
            },
            {
              name: "createdTo",
              in: "query",
              required: false,
              schema: { type: "string", format: "date" },
            },
            {
              name: "sort",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["articleId", "articleNom", "purchasePrice", "createdAt"],
              },
            },
            {
              name: "dir",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["asc", "desc"] },
            },
            {
              name: "page",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, default: 1 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 500,
                default: 50,
              },
            },
          ],
          responses: {
            "200": { description: "Paginated list of articles" },
            "401": { description: "Missing or invalid token" },
          },
        },
        post: {
          tags: ["articles"],
          summary: "Create a new article.",
          security: [cookieAuth],
          requestBody: {
            ...json(ArticleCreateSchema.omit({ ownerUserId: true })),
            required: true,
          },
          responses: {
            "201": { description: "Created" },
            "400": { description: "Validation error", ...json(ErrorResponse) },
          },
        },
      },
      "/api/articles/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["articles"],
          summary: "Get one article by id.",
          security: [cookieAuth],
          responses: {
            "200": { description: "OK" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
        put: {
          tags: ["articles"],
          summary: "Patch an article (partial update + warranty mgmt).",
          security: [cookieAuth],
          requestBody: { ...json(ArticleUpdateSchema), required: true },
          responses: {
            "200": { description: "Updated" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
        delete: {
          tags: ["articles"],
          summary: "Delete an article.",
          security: [cookieAuth],
          responses: {
            "204": { description: "Deleted" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
      },

      "/api/locations": {
        get: {
          tags: ["locations"],
          summary: "List the caller's locations.",
          security: [cookieAuth],
          responses: {
            "200": { description: "Paginated list of locations" },
            "401": { description: "Missing or invalid token" },
          },
        },
        post: {
          tags: ["locations"],
          summary: "Create a location.",
          security: [cookieAuth],
          requestBody: {
            ...json(LocationCreateSchema.omit({ ownerUserId: true })),
            required: true,
          },
          responses: {
            "201": { description: "Created" },
            "400": { description: "Validation error", ...json(ErrorResponse) },
          },
        },
      },
      "/api/locations/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["locations"],
          summary: "Get one location by id.",
          security: [cookieAuth],
          responses: {
            "200": { description: "OK" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
        put: {
          tags: ["locations"],
          summary: "Patch a location.",
          security: [cookieAuth],
          requestBody: {
            ...json(LocationUpdateSchema.partial()),
            required: true,
          },
          responses: {
            "200": { description: "Updated" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
        delete: {
          tags: ["locations"],
          summary: "Delete a location.",
          security: [cookieAuth],
          responses: {
            "204": { description: "Deleted" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
      },

      "/api/warranties": {
        get: {
          tags: ["warranties"],
          summary: "List the caller's warranties.",
          security: [cookieAuth],
          responses: { "200": { description: "Paginated list" } },
        },
        post: {
          tags: ["warranties"],
          summary: "Create a warranty (linked to an article).",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/warranties/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["warranties"],
          summary: "Get one warranty.",
          security: [cookieAuth],
          responses: {
            "200": { description: "OK" },
            "404": { description: "Not found" },
          },
        },
        put: {
          tags: ["warranties"],
          summary: "Update a warranty.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          tags: ["warranties"],
          summary: "Delete a warranty.",
          security: [cookieAuth],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/api/warranties/{id}/claim": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        patch: {
          tags: ["warranties"],
          summary: "Update the warranty claim workflow (status + note).",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },

      "/api/alerts": {
        get: {
          tags: ["alerts"],
          summary: "List the caller's alerts, optionally filtered by status.",
          security: [cookieAuth],
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["SCHEDULED", "SENT", "CANCELLED", "FAILED"],
              },
            },
          ],
          responses: { "200": { description: "Paginated list" } },
        },
        post: {
          tags: ["alerts"],
          summary: "Create a one-shot or recurring custom alert.",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/alerts/{id}/snooze": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["alerts"],
          summary: "Snooze a SCHEDULED alert by N days.",
          security: [cookieAuth],
          responses: { "200": { description: "Snoozed" } },
        },
      },
      "/api/alerts/{id}/cancel": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["alerts"],
          summary: "Cancel an alert.",
          security: [cookieAuth],
          responses: { "200": { description: "Cancelled" } },
        },
      },

      "/api/attachments": {
        get: {
          tags: ["attachments"],
          summary: "List the caller's attachments.",
          security: [cookieAuth],
          responses: { "200": { description: "Paginated list" } },
        },
        post: {
          tags: ["attachments"],
          summary: "Create an attachment metadata record.",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/attachments/upload": {
        post: {
          tags: ["attachments"],
          summary:
            "Upload a file (multipart). Generates a WebP thumbnail for images.",
          security: [cookieAuth],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                    type: {
                      type: "string",
                      enum: ["INVOICE", "WARRANTY", "OTHER"],
                    },
                    articleId: { type: "integer", minimum: 1 },
                  },
                  required: ["file"],
                },
              },
            },
            required: true,
          },
          responses: {
            "201": { description: "Uploaded" },
            "415": { description: "Unsupported file type" },
          },
        },
      },
      "/api/attachments/bulk-delete": {
        post: {
          tags: ["attachments"],
          summary:
            "Delete many attachments in one call (best-effort unlinks files).",
          security: [cookieAuth],
          responses: { "200": { description: "{ count: number }" } },
        },
      },
      "/api/attachments/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["attachments"],
          summary: "Get one attachment.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["attachments"],
          summary: "Update attachment metadata.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          tags: ["attachments"],
          summary:
            "Delete an attachment record (and the file when removeFile=true).",
          security: [cookieAuth],
          parameters: [
            {
              name: "removeFile",
              in: "query",
              required: false,
              schema: { type: "boolean", default: false },
            },
          ],
          responses: { "204": { description: "Deleted" } },
        },
      },

      "/api/articles/{id}/notes": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["notes"],
          summary: "List the article's notes.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["notes"],
          summary: "Add a note (with optional kind).",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/articles/{id}/notes/{noteId}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "noteId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        patch: {
          tags: ["notes"],
          summary: "Update a note's content and/or kind.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          tags: ["notes"],
          summary: "Delete a note.",
          security: [cookieAuth],
          responses: { "204": { description: "Deleted" } },
        },
      },

      "/api/tags": {
        get: {
          tags: ["tags"],
          summary: "List the caller's tags.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["tags"],
          summary: "Create a tag.",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/tags/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        put: {
          tags: ["tags"],
          summary: "Rename a tag (409 on owner-scoped name collision).",
          security: [cookieAuth],
          responses: {
            "200": { description: "Renamed" },
            "404": { description: "Not found", ...json(ErrorResponse) },
            "409": { description: "Name already exists" },
          },
        },
        delete: {
          tags: ["tags"],
          summary: "Delete a tag.",
          security: [cookieAuth],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/api/tags/merge": {
        post: {
          tags: ["tags"],
          summary:
            "Fold one tag into another. Transactional: dedupes articles already on the target, then deletes the source.",
          security: [cookieAuth],
          responses: { "200": { description: "{ articlesAffected: number }" } },
        },
      },

      "/api/saved-views": {
        get: {
          tags: ["saved-views"],
          summary: "List saved Articles filter presets.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["saved-views"],
          summary: "Save the current filter querystring under a name.",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/saved-views/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        delete: {
          tags: ["saved-views"],
          summary: "Delete a saved view.",
          security: [cookieAuth],
          responses: { "204": { description: "Deleted" } },
        },
      },

      "/api/shares/invites": {
        post: {
          tags: ["shares"],
          summary: "Mint a share invite for a POWER_USER recipient.",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/shares/invites/accept": {
        post: {
          tags: ["shares"],
          summary: "Accept a share invite token.",
          security: [cookieAuth],
          responses: { "200": { description: "Accepted" } },
        },
      },
      "/api/shares/invites/sent": {
        get: {
          tags: ["shares"],
          summary: "List invites the caller has sent.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/shares/owned": {
        get: {
          tags: ["shares"],
          summary: "List active InventoryShares the caller owns.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/shares/{targetUserId}": {
        parameters: [
          {
            name: "targetUserId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        delete: {
          tags: ["shares"],
          summary: "Revoke a per-user inventory share.",
          security: [cookieAuth],
          responses: { "204": { description: "Revoked" } },
        },
      },
      "/api/shared/articles": {
        get: {
          tags: ["shares"],
          summary: "List articles shared with the caller (per-user + public).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/shared/articles/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        put: {
          tags: ["shares"],
          summary: "Edit a shared article (WRITE permission only).",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },

      "/api/articles/{id}/transfer/push": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["transfers"],
          summary:
            "Owner offers (pushes) an article to another POWER_USER by email.",
          security: [cookieAuth],
          responses: { "201": { description: "Transfer request created" } },
        },
      },
      "/api/articles/{id}/transfer/pull": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["transfers"],
          summary:
            "Requester asks (pulls) ownership of an article already shared with them.",
          security: [cookieAuth],
          responses: { "201": { description: "Transfer request created" } },
        },
      },
      "/api/articles/transfers/incoming": {
        get: {
          tags: ["transfers"],
          summary: "List transfer requests awaiting the caller's decision.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/articles/transfers/outgoing": {
        get: {
          tags: ["transfers"],
          summary: "List transfer requests the caller initiated.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/articles/transfers/{token}/accept": {
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        post: {
          tags: ["transfers"],
          summary:
            "Accept a pending transfer (atomically re-owns the article).",
          security: [cookieAuth],
          responses: { "200": { description: "Accepted" } },
        },
      },
      "/api/articles/transfers/{token}/reject": {
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        post: {
          tags: ["transfers"],
          summary: "Reject a pending transfer.",
          security: [cookieAuth],
          responses: { "200": { description: "Rejected" } },
        },
      },
      "/api/articles/transfers/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        delete: {
          tags: ["transfers"],
          summary: "Revoke a transfer request the caller initiated.",
          security: [cookieAuth],
          responses: { "204": { description: "Revoked" } },
        },
      },

      "/api/messages/unread-count": {
        get: {
          tags: ["messaging"],
          summary:
            "Count threads with unread activity for the caller (nav badge).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/messages/threads": {
        get: {
          tags: ["messaging"],
          summary:
            "Inbox — every negotiation thread the caller participates in.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["messaging"],
          summary:
            "Open (or append to) the thread for a shared article and post a message.",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/messages/threads/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["messaging"],
          summary:
            "Full conversation, oldest first (marks the thread read for the caller).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/messages/threads/{id}/messages": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["messaging"],
          summary: "Reply to an existing thread.",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/messages/threads/{id}/offer": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["messaging"],
          summary: "Requester proposes a purchase price (OFFER message).",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/messages/offers/{messageId}/accept": {
        parameters: [
          {
            name: "messageId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["messaging"],
          summary:
            "Owner accepts an offer — fires a PUSH transfer to the requester.",
          security: [cookieAuth],
          responses: { "200": { description: "Accepted" } },
        },
      },
      "/api/messages/offers/{messageId}/decline": {
        parameters: [
          {
            name: "messageId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["messaging"],
          summary: "Owner declines an offer.",
          security: [cookieAuth],
          responses: { "200": { description: "Declined" } },
        },
      },

      "/api/articles/{id}/share": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["articles"],
          summary: "Toggle the public share flag on an article.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          tags: ["articles"],
          summary: "Unshare an article publicly.",
          security: [cookieAuth],
          responses: { "204": { description: "Unshared" } },
        },
      },
      "/api/articles/{id}/shares": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["articles"],
          summary: "Read the share state for one article.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/articles/bulk-delete": {
        post: {
          tags: ["articles"],
          summary: "Delete multiple articles owned by the caller.",
          security: [cookieAuth],
          responses: { "200": { description: "Deleted" } },
        },
      },
      "/api/articles/bulk-share": {
        post: {
          tags: ["articles"],
          summary: "Bulk toggle the public share flag.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/articles/bulk-assign": {
        post: {
          tags: ["articles"],
          summary: "Bulk add locations and/or tags to articles.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/articles/import": {
        post: {
          tags: ["articles"],
          summary:
            "Import articles from parsed CSV rows; ?dryRun=1 validates without writing.",
          security: [cookieAuth],
          parameters: [
            {
              name: "dryRun",
              in: "query",
              required: false,
              schema: { type: "boolean", default: false },
            },
          ],
          responses: { "200": { description: "Per-row report" } },
        },
      },
      "/api/articles/export/inventory.pdf": {
        get: {
          tags: ["articles"],
          summary: "Stream the full-inventory manifest PDF.",
          security: [cookieAuth],
          responses: { "200": { description: "PDF" } },
        },
      },
      "/api/articles/export/inventory.csv": {
        get: {
          tags: ["articles"],
          summary:
            "Stream a CSV export honouring the same filters as GET /api/articles.",
          security: [cookieAuth],
          responses: { "200": { description: "CSV (text/csv)" } },
        },
      },
      "/api/articles/{id}/duplicate": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["articles"],
          summary:
            "Duplicate identity + locations + tags into a new article (no warranty/attachments).",
          security: [cookieAuth],
          responses: {
            "201": { description: "Created (the new article)" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
      },
      "/api/articles/trash": {
        get: {
          tags: ["articles"],
          summary: "List soft-deleted articles (Trash view).",
          security: [cookieAuth],
          responses: {
            "200": { description: "{ items: FetchedArticle[] }" },
          },
        },
      },
      "/api/articles/{id}/restore": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["articles"],
          summary:
            "Restore a soft-deleted article. Re-arms warranty reminders.",
          security: [cookieAuth],
          responses: {
            "200": { description: "Restored" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
      },
      "/api/articles/{id}/purge": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        delete: {
          tags: ["articles"],
          summary:
            "Permanently delete a (already soft-deleted) article; skips the retention window.",
          security: [cookieAuth],
          responses: {
            "204": { description: "Purged" },
            "404": { description: "Not found", ...json(ErrorResponse) },
          },
        },
      },
      "/api/articles/trash/bulk-restore": {
        post: {
          tags: ["articles"],
          summary: "Restore many soft-deleted articles in one call.",
          security: [cookieAuth],
          responses: { "200": { description: "{ count: number }" } },
        },
      },
      "/api/articles/trash/bulk-purge": {
        post: {
          tags: ["articles"],
          summary: "Permanently delete many trashed articles in one call.",
          security: [cookieAuth],
          responses: { "200": { description: "{ count: number }" } },
        },
      },
      "/api/articles/export/labels.pdf": {
        get: {
          tags: ["articles"],
          summary: "Stream a printable QR-label sheet (one per article).",
          security: [cookieAuth],
          responses: { "200": { description: "PDF" } },
        },
      },
      "/api/articles/{id}/claim.pdf": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["articles"],
          summary: "Stream the single-article insurance/claim PDF.",
          security: [cookieAuth],
          responses: { "200": { description: "PDF" } },
        },
      },

      "/api/calendar/token": {
        post: {
          tags: ["calendar"],
          summary: "Mint (or rotate) the read-only iCalendar feed token.",
          security: [cookieAuth],
          responses: { "200": { description: "Token issued" } },
        },
        delete: {
          tags: ["calendar"],
          summary: "Disable the feed (revokes the token).",
          security: [cookieAuth],
          responses: { "204": { description: "Disabled" } },
        },
      },
      "/api/calendar/feed/{token}.ics": {
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        ],
        get: {
          tags: ["calendar"],
          summary:
            "Serve the user's calendar (no auth cookie required — token is the capability).",
          responses: { "200": { description: "text/calendar" } },
        },
      },

      "/api/push/public-key": {
        get: {
          tags: ["push"],
          summary:
            "Return the VAPID public key, or 404 when push isn't configured.",
          security: [cookieAuth],
          responses: {
            "200": { description: "Key" },
            "404": { description: "Not configured" },
          },
        },
      },
      "/api/push/subscribe": {
        post: {
          tags: ["push"],
          summary: "Register a browser push subscription.",
          security: [cookieAuth],
          responses: { "204": { description: "Subscribed" } },
        },
      },
      "/api/push/unsubscribe": {
        post: {
          tags: ["push"],
          summary: "Drop a push subscription by endpoint.",
          security: [cookieAuth],
          responses: { "204": { description: "Unsubscribed" } },
        },
      },

      "/api/billing/upgrade/power-user/checkout": {
        post: {
          tags: ["billing"],
          summary: "Create a Stripe Checkout session for the POWER_USER plan.",
          security: [cookieAuth],
          responses: { "200": { description: "Redirect URL" } },
        },
      },
      "/api/billing/portal": {
        post: {
          tags: ["billing"],
          summary: "Open a Stripe Customer Portal session.",
          security: [cookieAuth],
          responses: { "200": { description: "Portal URL" } },
        },
      },
      "/api/billing/cancel/power-user": {
        post: {
          tags: ["billing"],
          summary: "Cancel the subscription at period end.",
          security: [cookieAuth],
          responses: { "200": { description: "Scheduled" } },
        },
      },
      "/api/billing/me": {
        get: {
          tags: ["billing"],
          summary: "Live-from-Stripe subscription + role lookup.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/billing/sync": {
        post: {
          tags: ["billing"],
          summary:
            "Force-resync subscription state from Stripe (post-checkout fallback).",
          security: [cookieAuth],
          responses: { "200": { description: "Synced" } },
        },
      },
      "/api/billing/webhook": {
        post: {
          tags: ["billing"],
          summary: "Stripe webhook (signature-verified).",
          responses: { "200": { description: "Received" } },
        },
      },

      "/api/profile/me": {
        get: {
          tags: ["profile"],
          summary: "Return the caller's profile.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
        delete: {
          tags: ["profile"],
          summary: "Delete the caller's account (requires currentPassword).",
          security: [cookieAuth],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/api/profile/me/email": {
        put: {
          tags: ["profile"],
          summary: "Change the caller's email address.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/profile/me/password": {
        put: {
          tags: ["profile"],
          summary: "Change the caller's password (bumps tokenVersion).",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/profile/me/currency": {
        put: {
          tags: ["profile"],
          summary: "Set the caller's display currency (ISO 4217).",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/profile/me/email-reminders": {
        put: {
          tags: ["profile"],
          summary: "Toggle the caller's email-reminders opt-out.",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/profile/me/weekly-digest": {
        put: {
          tags: ["profile"],
          summary:
            "Toggle the caller's weekly warranty-digest email opt-in (Mondays 09:00 UTC).",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/profile/me/budget": {
        put: {
          tags: ["profile"],
          summary:
            "Set the caller's monthly/annual spend budgets (gated: budget feature). Null clears a budget.",
          security: [cookieAuth],
          responses: {
            "200": { description: "Updated" },
            "403": { description: "Feature not available" },
          },
        },
      },

      "/api/statistics/dashboard": {
        get: {
          tags: ["statistics"],
          summary: "Aggregate dashboard statistics for the caller.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/statistics/basic": {
        get: {
          tags: ["statistics"],
          summary: "Lightweight counts (articles / warranties / alerts).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/statistics/admin": {
        get: {
          tags: ["statistics"],
          summary: "Global statistics across every user (ADMIN only).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/statistics/analytics": {
        get: {
          tags: ["statistics"],
          summary:
            "Spending & portfolio-value analytics (gated: analytics feature).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/statistics/budget": {
        get: {
          tags: ["statistics"],
          summary:
            "Spend-against-budget for the current month + year (gated: budget feature).",
          security: [cookieAuth],
          responses: {
            "200": { description: "BudgetStatus" },
            "403": { description: "Feature not available" },
          },
        },
      },

      "/api/loans": {
        get: {
          tags: ["loans"],
          summary:
            "List the caller's loans (gated: loans feature). Filter with ?active=1 and/or ?articleId=.",
          security: [cookieAuth],
          parameters: [
            { name: "active", in: "query", schema: { type: "boolean" } },
            {
              name: "articleId",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            "200": { description: "{ items: LoanItem[] }" },
            "403": { description: "Feature not available" },
          },
        },
        post: {
          tags: ["loans"],
          summary:
            "Lend an item out (gated: loans feature). Sets the article LOANED; a due date schedules a reminder.",
          security: [cookieAuth],
          responses: {
            "201": { description: "Created loan" },
            "403": { description: "Feature not available" },
            "404": { description: "Article not found" },
          },
        },
      },
      "/api/loans/{id}/return": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["loans"],
          summary:
            "Mark a loan returned (reverts the article to ACTIVE if still LOANED, cancels the reminder). Stays open so a downgraded user can always close out a loan.",
          security: [cookieAuth],
          responses: {
            "200": { description: "Updated loan" },
            "404": { description: "Open loan not found" },
          },
        },
      },
      "/api/loans/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        delete: {
          tags: ["loans"],
          summary: "Delete a loan record (cancels any reminder).",
          security: [cookieAuth],
          responses: {
            "204": { description: "Deleted" },
            "404": { description: "Not found" },
          },
        },
      },

      "/api/insurance": {
        get: {
          tags: ["insurance"],
          summary:
            "List the caller's insurance policies (gated: insurance feature). ?articleId= scopes to policies covering one item.",
          security: [cookieAuth],
          parameters: [
            {
              name: "articleId",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            "200": { description: "{ items: InsurancePolicyItem[] }" },
            "403": { description: "Feature not available" },
          },
        },
        post: {
          tags: ["insurance"],
          summary:
            "Create an insurance policy (gated). A renewal date schedules a reminder.",
          security: [cookieAuth],
          responses: {
            "201": { description: "Created policy" },
            "403": { description: "Feature not available" },
          },
        },
      },
      "/api/insurance/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        patch: {
          tags: ["insurance"],
          summary:
            "Update a policy (gated). Editing the renewal date reschedules the reminder.",
          security: [cookieAuth],
          responses: {
            "200": { description: "Updated policy" },
            "403": { description: "Feature not available" },
            "404": { description: "Not found" },
          },
        },
        delete: {
          tags: ["insurance"],
          summary:
            "Delete a policy (cancels its reminder). Stays open so a downgraded user can clean up.",
          security: [cookieAuth],
          responses: {
            "204": { description: "Deleted" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/insurance/{id}/articles": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["insurance"],
          summary:
            "Cover an article under this policy (gated). Idempotent re-link.",
          security: [cookieAuth],
          responses: {
            "204": { description: "Linked" },
            "403": { description: "Feature not available" },
            "404": { description: "Policy or article not found" },
          },
        },
      },
      "/api/insurance/{id}/articles/{articleId}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "articleId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        delete: {
          tags: ["insurance"],
          summary:
            "Stop covering an article under this policy. Stays open for cleanup.",
          security: [cookieAuth],
          responses: { "204": { description: "Unlinked" } },
        },
      },

      "/api/service-records": {
        get: {
          tags: ["maintenance"],
          summary:
            "List an article's service/maintenance log (gated: maintenance feature). Requires ?articleId=.",
          security: [cookieAuth],
          parameters: [
            {
              name: "articleId",
              in: "query",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            "200": { description: "{ items: ServiceRecordItem[] }" },
            "403": { description: "Feature not available" },
          },
        },
        post: {
          tags: ["maintenance"],
          summary:
            "Log a service entry (gated). A next-service date schedules a reminder.",
          security: [cookieAuth],
          responses: {
            "201": { description: "Created record" },
            "403": { description: "Feature not available" },
            "404": { description: "Article not found" },
          },
        },
      },
      "/api/service-records/due": {
        get: {
          tags: ["maintenance"],
          summary:
            "Services coming due or overdue across all the caller's articles (gated: maintenance feature).",
          security: [cookieAuth],
          responses: {
            "200": { description: "{ items: ServiceDueItem[] }" },
            "403": { description: "Feature not available" },
          },
        },
      },
      "/api/service-records/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        delete: {
          tags: ["maintenance"],
          summary:
            "Delete a service record (cancels any reminder). Stays open for cleanup.",
          security: [cookieAuth],
          responses: {
            "204": { description: "Deleted" },
            "404": { description: "Not found" },
          },
        },
      },

      "/api/articles/{articleId}/public-link": {
        parameters: [
          {
            name: "articleId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["public"],
          summary:
            "Get the article's current public-page token (or null). Open so a downgraded user can still see/disable an existing link.",
          security: [cookieAuth],
          responses: {
            "200": { description: "{ token: string | null }" },
            "404": { description: "Not found" },
          },
        },
        post: {
          tags: ["public"],
          summary:
            "Generate (or rotate) the article's public-page token (gated: public_page feature).",
          security: [cookieAuth],
          responses: {
            "201": { description: "{ token: string }" },
            "403": { description: "Feature not available" },
          },
        },
        delete: {
          tags: ["public"],
          summary: "Disable the public page. Stays open for cleanup.",
          security: [cookieAuth],
          responses: { "204": { description: "Disabled" } },
        },
      },
      "/api/public/items/{token}": {
        parameters: [
          {
            name: "token",
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        ],
        get: {
          tags: ["public"],
          summary:
            "Public, unauthenticated item view (QR-label target). Returns only privacy-safe fields — never price, serial, owner, or location.",
          responses: {
            "200": { description: "PublicItem" },
            "404": { description: "Not found" },
          },
        },
      },

      "/api/admin/users": {
        get: {
          tags: ["admin"],
          summary: "List every user (ADMIN only).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
        post: {
          tags: ["admin"],
          summary: "Create a user (ADMIN only).",
          security: [cookieAuth],
          responses: { "201": { description: "Created" } },
        },
      },
      "/api/admin/users/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        patch: {
          tags: ["admin"],
          summary: "Update a user's role or email (ADMIN only).",
          security: [cookieAuth],
          responses: { "200": { description: "Updated" } },
        },
        delete: {
          tags: ["admin"],
          summary: "Delete a user (ADMIN only).",
          security: [cookieAuth],
          responses: { "204": { description: "Deleted" } },
        },
      },
      "/api/admin/users/{id}/reset-password": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["admin"],
          summary: "Set a user's password (ADMIN only). Bumps tokenVersion.",
          security: [cookieAuth],
          responses: { "200": { description: "Reset" } },
        },
      },
      "/api/admin/users/{id}/force-logout": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        post: {
          tags: ["admin"],
          summary:
            "Bump a user's tokenVersion (invalidates every active session).",
          security: [cookieAuth],
          responses: { "200": { description: "Done" } },
        },
      },
      "/api/admin/users/{id}/inventory": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        get: {
          tags: ["admin"],
          summary: "Read another user's inventory (ADMIN only).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/admin/audit-log": {
        get: {
          tags: ["admin"],
          summary: "Cursor-paginated audit log (ADMIN only).",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/admin/db/export": {
        get: {
          tags: ["admin"],
          summary: "Dump every table as one JSON file (ADMIN only).",
          security: [cookieAuth],
          responses: { "200": { description: "JSON dump" } },
        },
      },
      "/api/admin/db/import": {
        post: {
          tags: ["admin"],
          summary:
            "Replace every table from a JSON dump (ADMIN only — destructive).",
          security: [cookieAuth],
          responses: { "200": { description: "Imported" } },
        },
      },
      "/api/admin/jobs": {
        get: {
          tags: ["admin"],
          summary:
            "BullMQ queue snapshot (counts + next audit-prune run) — ADMIN.",
          security: [cookieAuth],
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/admin/failed-jobs": {
        get: {
          tags: ["admin"],
          summary:
            "Last failed jobs across both queues (cap 50) — ADMIN. Powers the Jobs tab's 'Recent failures' expander.",
          security: [cookieAuth],
          responses: { "200": { description: "{ items: FailedJob[] }" } },
        },
      },

      "/health": {
        get: {
          tags: ["meta"],
          summary: "Readiness probe — reports db + redis + queue depth.",
          responses: {
            "200": {
              description: "OK or degraded (db up, redis/queue may fail)",
            },
            "503": { description: "Database unreachable" },
          },
        },
      },
    },
  });
}
