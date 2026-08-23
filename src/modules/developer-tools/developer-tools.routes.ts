import { createModuleRouter } from "../../shared/http/moduleRouter.js";
import { envelope } from "../../shared/http/envelope.js";
import type { DeveloperToolsController } from "./developer-tools.controller.js";
import {
  Base64Body,
  Base64DecodeResource,
  Base64EncodeResource,
  DecodeJwtBody,
  DecodedJwtResource,
  GenerateUuidBody,
  GenerateUuidResource,
  HashBody,
  HashResource,
} from "./developer-tools.schemas.js";

const UUID_RATE_LIMIT = { bucket: "developer-tools-uuid", points: 100, durationSeconds: 60 };
const HASH_RATE_LIMIT = { bucket: "developer-tools-hash", points: 60, durationSeconds: 60 };
const BASE64_RATE_LIMIT = { bucket: "developer-tools-base64", points: 60, durationSeconds: 60 };
const JWT_RATE_LIMIT = { bucket: "developer-tools-jwt", points: 60, durationSeconds: 60 };

export function createDeveloperToolsRoutes(controller: DeveloperToolsController) {
  const { router, route } = createModuleRouter({
    name: "developer-tools",
    basePath: "/api/v1/dev-tools",
    tag: "Developer Tools",
  });

  route({
    method: "post",
    path: "/uuid",
    summary: "Generate RFC-compliant UUIDs",
    auth: true,
    scopes: ["devtools:uuid"],
    rateLimit: UUID_RATE_LIMIT,
    request: { body: GenerateUuidBody },
    response: { status: 200, schema: envelope(GenerateUuidResource) },
    errors: [401, 403, 422, 429],
    handler: controller.uuid,
  });

  route({
    method: "post",
    path: "/hash",
    summary: "Hash UTF-8 text",
    auth: true,
    scopes: ["devtools:hash"],
    rateLimit: HASH_RATE_LIMIT,
    request: { body: HashBody },
    response: { status: 200, schema: envelope(HashResource) },
    errors: [401, 403, 413, 422, 429],
    handler: controller.hash,
  });

  route({
    method: "post",
    path: "/base64/encode",
    summary: "Encode UTF-8 text as Base64",
    auth: true,
    scopes: ["devtools:encoding"],
    rateLimit: BASE64_RATE_LIMIT,
    request: { body: Base64Body },
    response: { status: 200, schema: envelope(Base64EncodeResource) },
    errors: [401, 403, 413, 422, 429],
    handler: controller.base64Encode,
  });

  route({
    method: "post",
    path: "/base64/decode",
    summary: "Decode canonical Base64 UTF-8 text",
    auth: true,
    scopes: ["devtools:encoding"],
    rateLimit: BASE64_RATE_LIMIT,
    request: { body: Base64Body },
    response: { status: 200, schema: envelope(Base64DecodeResource) },
    errors: [400, 401, 403, 413, 422, 429],
    handler: controller.base64Decode,
  });

  route({
    method: "post",
    path: "/jwt/decode",
    summary: "Decode a compact JWT without verification",
    description:
      "Decodes the JWT header and payload only. This endpoint does not verify the signature, issuer, audience, or trustworthiness of the token.",
    auth: true,
    scopes: ["devtools:jwt"],
    rateLimit: JWT_RATE_LIMIT,
    request: { body: DecodeJwtBody },
    response: { status: 200, schema: envelope(DecodedJwtResource) },
    errors: [400, 401, 403, 413, 422, 429],
    handler: controller.jwtDecode,
  });

  return router;
}
