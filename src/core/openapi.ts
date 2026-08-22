import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { createDocument, type ZodOpenApiPathsObject, type ZodOpenApiOperationObject } from "zod-openapi";
import { config } from "./config.js";
import { getRoutes } from "../shared/http/routeRegistry.js";
import { ErrorEnvelopeSchema } from "../shared/http/envelope.js";

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  410: "Gone",
  413: "Payload Too Large",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

// express-style ':id' -> OpenAPI-style '{id}'. Our routes never use
// path-to-regexp's richer syntax (splats, optional segments), so this
// simple substitution is sufficient.
function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

// zod-openapi keys `responses` with a template literal type
// (`${1|2|3|4|5}${string}`), not a plain `string` — our status codes are
// always valid 3-digit HTTP codes, so this cast is safe.
type StatusKey = `${1 | 2 | 3 | 4 | 5}${string}`;
function statusKey(code: number): StatusKey {
  return String(code) as StatusKey;
}

// Assembled once, after every module's routes have registered themselves
// via createModuleRouter()'s route() — there is no hand-maintained list of
// paths anywhere in core.
export function buildOpenApiDocument() {
  const paths: ZodOpenApiPathsObject = {};

  for (const route of getRoutes()) {
    const openApiPath = toOpenApiPath(route.fullPath);
    const pathItem = (paths[openApiPath] ??= {});

    const responses: ZodOpenApiOperationObject["responses"] = {
      [statusKey(route.response.status)]: {
        description: route.response.description ?? "OK",
        ...(route.response.schema
          ? { content: { [route.response.contentType ?? "application/json"]: { schema: route.response.schema } } }
          : {}),
      },
    };
    for (const code of route.errors ?? []) {
      responses[statusKey(code)] = {
        description: STATUS_TEXT[code] ?? "Error",
        content: { "application/json": { schema: ErrorEnvelopeSchema } },
      };
    }

    const operation: ZodOpenApiOperationObject = {
      summary: route.summary,
      description: route.description,
      tags: route.tags,
      responses,
      ...(route.request?.params || route.request?.query
        ? {
            requestParams: {
              ...(route.request.params ? { path: route.request.params } : {}),
              ...(route.request.query ? { query: route.request.query } : {}),
            },
          }
        : {}),
      ...(route.request?.body
        ? { requestBody: { content: { "application/json": { schema: route.request.body } } } }
        : {}),
      ...(route.auth ? { security: [{ bearerAuth: [] }, { apiKeyAuth: [] }] } : {}),
      ...(route.idempotent
        ? {
            parameters: [
              {
                name: "Idempotency-Key",
                in: "header",
                required: false,
                schema: { type: "string" },
                description: "Replay-safe key for this create operation.",
              },
            ],
          }
        : {}),
    };

    pathItem[route.method] = operation;
  }

  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "API Dev Platform",
      version: "1.0.0",
      description: "Modular monolith developer API — auth, qr, and url modules.",
    },
    servers: [{ url: config.PUBLIC_URL }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
      },
    },
    paths,
  });
}

export function mountDocs(app: Express): void {
  const document = buildOpenApiDocument();
  app.get("/openapi.json", (_req, res) => res.json(document));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(document));
}
