import { config } from "../../core/config.js";
import { createModuleRouter } from "../../shared/http/moduleRouter.js";
import type { PdfController } from "./pdf.controller.js";
import { PdfBinaryResponse, RenderHtmlPdfBody, RenderUrlPdfBody } from "./pdf.schemas.js";

const renderRateLimit = {
  bucket: "pdf-render",
  points: config.PDF_RATE_LIMIT_POINTS,
  durationSeconds: config.PDF_RATE_LIMIT_WINDOW_SECONDS,
};

export function createPdfRoutes(controller: PdfController) {
  const { router, route } = createModuleRouter({ name: "pdf", basePath: "/api/v1/pdf", tag: "PDF" });

  route({
    method: "post",
    path: "/html",
    summary: "Render HTML as a PDF",
    description:
      "Renders supplied HTML with JavaScript disabled. Public HTTP(S) subresources are allowed only after destination checks. " +
      `PDF requests share a ${config.PDF_RATE_LIMIT_POINTS}/${config.PDF_RATE_LIMIT_WINDOW_SECONDS}s render budget.`,
    auth: true,
    scopes: ["pdf:generate"],
    rateLimit: renderRateLimit,
    request: { body: RenderHtmlPdfBody },
    response: { status: 200, schema: PdfBinaryResponse, contentType: "application/pdf" },
    errors: [401, 403, 413, 422, 429, 500, 503, 504],
    handler: controller.html,
  });

  route({
    method: "post",
    path: "/url",
    summary: "Render a public URL as a PDF",
    description:
      "Only public HTTP(S) destinations are accepted. Private, loopback, link-local, metadata, and DNS-resolved private addresses are blocked. " +
      "Application-layer DNS rebinding remains a deployment egress-control concern.",
    auth: true,
    scopes: ["pdf:generate"],
    rateLimit: renderRateLimit,
    request: { body: RenderUrlPdfBody },
    response: { status: 200, schema: PdfBinaryResponse, contentType: "application/pdf" },
    errors: [400, 401, 403, 413, 422, 429, 500, 503, 504],
    handler: controller.url,
  });

  return router;
}
