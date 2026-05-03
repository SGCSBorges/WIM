/**
 * OpenAPI document for the WIM API.
 *
 * The document is generated from the Zod schemas already used at runtime
 * for request validation, so endpoint shapes can't drift from what the
 * server actually accepts. To document a new endpoint:
 *
 *   1. Add an entry under `paths` below.
 *   2. Reference its Zod input/output schemas inline.
 *
 * What's covered today: the auth, articles, and locations modules. The
 * remaining modules can be filled in incrementally — anything missing here
 * still works at runtime, it just isn't in the spec yet.
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
            "List the caller's articles, optionally filtered by location.",
          security: [cookieAuth],
          parameters: [
            {
              name: "locationId",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1 },
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

      "/health": {
        get: {
          tags: ["meta"],
          summary: "Liveness probe — verifies database connectivity.",
          responses: {
            "200": { description: "OK" },
            "503": { description: "Database unavailable" },
          },
        },
      },
    },
  });
}
