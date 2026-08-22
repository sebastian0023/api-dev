import { createModuleRouter } from "../../shared/http/moduleRouter.js";
import { envelope } from "../../shared/http/envelope.js";
import type { TemplateController } from "./template.controller.js";
import { CreateTemplateBody, IdParam, TemplateResource, TemplateListResource } from "./template.schemas.js";

export function createTemplateRoutes(controller: TemplateController) {
  // Rename 'template' and '/api/v1/template' to your module's name/basePath.
  const { router, route } = createModuleRouter({
    name: "template",
    basePath: "/api/v1/template",
    tag: "Template",
  });

  route({
    method: "post",
    path: "/",
    summary: "Create a template item",
    auth: true,
    idempotent: true,
    request: { body: CreateTemplateBody },
    response: { status: 201, schema: envelope(TemplateResource) },
    errors: [401, 422, 429],
    handler: controller.create,
  });

  route({
    method: "get",
    path: "/",
    summary: "List template items",
    auth: true,
    response: { status: 200, schema: envelope(TemplateListResource) },
    errors: [401, 429],
    handler: controller.list,
  });

  route({
    method: "get",
    path: "/:id",
    summary: "Get a template item",
    auth: true,
    request: { params: IdParam },
    response: { status: 200, schema: envelope(TemplateResource) },
    errors: [401, 404, 429],
    handler: controller.getById,
  });

  return router;
}
