import { createModuleRouter } from "../../shared/http/moduleRouter.js";
import { envelope } from "../../shared/http/envelope.js";
import { SuccessResource } from "../../shared/validation/common.js";
import type { AuthController } from "./auth.controller.js";
import {
  RegisterBody,
  LoginBody,
  RefreshBody,
  LogoutBody,
  CreateApiKeyBody,
  IdParam,
  AuthSessionResource,
  RefreshResultResource,
  ApiKeyCreatedResource,
  ApiKeyListResource,
} from "./auth.schemas.js";

export function createAuthRoutes(controller: AuthController) {
  const { router, route } = createModuleRouter({ name: "auth", basePath: "/api/v1/auth", tag: "Auth" });

  route({
    method: "post",
    path: "/register",
    summary: "Register a new account",
    auth: false,
    idempotent: true,
    request: { body: RegisterBody },
    response: { status: 201, schema: envelope(AuthSessionResource) },
    errors: [400, 409, 422, 429],
    handler: controller.register,
  });

  route({
    method: "post",
    path: "/login",
    summary: "Log in with email + password",
    auth: false,
    request: { body: LoginBody },
    response: { status: 200, schema: envelope(AuthSessionResource) },
    errors: [401, 422, 429],
    handler: controller.login,
  });

  route({
    method: "post",
    path: "/refresh",
    summary: "Rotate a refresh token for a new access + refresh token pair",
    description: "Refresh tokens are single-use. Reusing an already-rotated token revokes its whole family.",
    auth: false,
    request: { body: RefreshBody },
    response: { status: 200, schema: envelope(RefreshResultResource) },
    errors: [401, 422, 429],
    handler: controller.refresh,
  });

  route({
    method: "post",
    path: "/logout",
    summary: "Revoke a refresh token",
    auth: false,
    request: { body: LogoutBody },
    response: { status: 200, schema: envelope(SuccessResource) },
    errors: [422, 429],
    handler: controller.logout,
  });

  route({
    method: "post",
    path: "/api-keys",
    summary: "Create an API key",
    description: "The raw key is returned exactly once — only its hash is persisted.",
    auth: true,
    idempotent: true,
    request: { body: CreateApiKeyBody },
    response: { status: 201, schema: envelope(ApiKeyCreatedResource) },
    errors: [401, 422, 429],
    handler: controller.createApiKey,
  });

  route({
    method: "get",
    path: "/api-keys",
    summary: "List your API keys",
    auth: true,
    response: { status: 200, schema: envelope(ApiKeyListResource) },
    errors: [401, 429],
    handler: controller.listApiKeys,
  });

  route({
    method: "delete",
    path: "/api-keys/:id",
    summary: "Revoke an API key",
    auth: true,
    request: { params: IdParam },
    response: { status: 200, schema: envelope(SuccessResource) },
    errors: [401, 404, 422, 429],
    handler: controller.revokeApiKey,
  });

  return router;
}
