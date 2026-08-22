import { z } from "zod";
import { createModuleRouter } from "../../shared/http/moduleRouter.js";
import { envelope } from "../../shared/http/envelope.js";
import type { QrController } from "./qr.controller.js";
import { CreateQrBody, IdParam, ListQrQuery, QrCodeResource, QrCodeSummaryListResource } from "./qr.schemas.js";

export function createQrRoutes(controller: QrController) {
  const { router, route } = createModuleRouter({ name: "qr", basePath: "/api/v1/qr", tag: "QR" });

  route({
    method: "post",
    path: "/",
    summary: "Generate a QR code",
    description:
      "Returns the rendered image inline (base64 data URL for PNG, raw markup for SVG) rather than a stored-asset URL.",
    auth: true,
    idempotent: true,
    scopes: ["qr:write"],
    request: { body: CreateQrBody },
    response: { status: 201, schema: envelope(QrCodeResource) },
    errors: [400, 401, 403, 422, 429],
    handler: controller.create,
  });

  route({
    method: "get",
    path: "/",
    summary: "List your QR codes",
    auth: true,
    scopes: ["qr:read"],
    request: { query: ListQrQuery },
    response: { status: 200, schema: envelope(QrCodeSummaryListResource) },
    errors: [401, 403, 429],
    handler: controller.list,
  });

  route({
    method: "get",
    path: "/:id",
    summary: "Get QR code metadata",
    description:
      "Increments scanCount when mode is 'redirect' (per spec) — GET /:id/scan is the endpoint that reflects real-world scans.",
    auth: true,
    scopes: ["qr:read"],
    request: { params: IdParam },
    response: { status: 200, schema: envelope(QrCodeResource) },
    errors: [401, 403, 404, 429],
    handler: controller.getById,
  });

  route({
    method: "get",
    path: "/:id/scan",
    summary: "Redirect to the QR's destination and record a scan",
    description: "Public — no credentials required. Only valid for QR codes created with mode: 'redirect'.",
    auth: false,
    request: { params: IdParam },
    response: { status: 302, schema: z.object({}), description: "Redirect to the encoded destination" },
    errors: [404],
    handler: controller.scan,
  });

  return router;
}
