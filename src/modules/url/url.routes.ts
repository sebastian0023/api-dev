import { createModuleRouter } from "../../shared/http/moduleRouter.js";
import { envelope } from "../../shared/http/envelope.js";
import type { UrlController } from "./url.controller.js";
import { createCreateShortUrlBody, ShortCodeParam, ShortUrlResource } from "./url.schemas.js";

export function createUrlRoutes(controller: UrlController, now: () => Date) {
  const { router, route } = createModuleRouter({ name: "url", basePath: "/api/v1/urls", tag: "URL" });

  route({
    method: "post",
    path: "/",
    summary: "Create a short URL",
    auth: true,
    scopes: ["url:write"],
    idempotent: true,
    request: { body: createCreateShortUrlBody(now) },
    response: { status: 201, schema: envelope(ShortUrlResource) },
    errors: [401, 403, 409, 422, 429, 503],
    handler: controller.create,
  });

  route({
    method: "get",
    path: "/:shortCode",
    summary: "Get metadata for one of your short URLs",
    auth: true,
    scopes: ["url:read"],
    request: { params: ShortCodeParam },
    response: { status: 200, schema: envelope(ShortUrlResource) },
    errors: [401, 403, 404, 422, 429],
    handler: controller.getByCode,
  });

  route({
    method: "delete",
    path: "/:shortCode",
    summary: "Delete one of your short URLs",
    auth: true,
    scopes: ["url:write"],
    request: { params: ShortCodeParam },
    response: { status: 204, description: "Short URL deleted" },
    errors: [401, 403, 404, 422, 429],
    handler: controller.deleteByCode,
  });

  route({
    method: "get",
    path: "/:shortCode/redirect",
    summary: "Redirect to a short URL destination",
    description: "Public. Valid redirects increment clickCount atomically and return a Location header.",
    auth: false,
    request: { params: ShortCodeParam },
    response: { status: 302, description: "Redirect to the original URL" },
    errors: [404, 410, 422, 429],
    handler: controller.redirect,
  });

  return router;
}
