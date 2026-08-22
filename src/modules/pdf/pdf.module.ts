import { Router } from "express";
import { config } from "../../core/config.js";
import type { ModuleContext, ModuleManifest } from "../../core/moduleContract.js";
import { createPdfService } from "./application/pdf.service.js";
import { createPdfController } from "./pdf.controller.js";
import { createPdfRoutes } from "./pdf.routes.js";
import { BrowserManager } from "./infrastructure/browserManager.js";
import { ChromiumPdfRenderer } from "./infrastructure/chromiumPdfRenderer.js";
import { DestinationPolicy } from "./infrastructure/destinationPolicy.js";

const routerHandle = Router();
let browserManager: BrowserManager | undefined;

const manifest: ModuleManifest = {
  name: "pdf",
  version: "1.0.0",
  basePath: "/api/v1/pdf",
  routes: routerHandle,
  requiresAuth: true,
  dependencies: ["auth"],
  async onInit(ctx: ModuleContext) {
    browserManager = new BrowserManager({
      maxConcurrent: config.PDF_MAX_CONCURRENT_RENDERS,
      maxQueued: config.PDF_MAX_QUEUED_RENDERS,
      queueTimeoutMs: config.PDF_QUEUE_TIMEOUT_MS,
      renderTimeoutMs: config.PDF_RENDER_TIMEOUT_MS,
    });
    const destinationPolicy = new DestinationPolicy();
    const renderer = new ChromiumPdfRenderer(browserManager, destinationPolicy, ctx.logger, config.PDF_RENDER_TIMEOUT_MS);
    const service = createPdfService({ renderer, destinationPolicy, logger: ctx.logger });
    routerHandle.use(createPdfRoutes(createPdfController(service)));
  },
  async onDestroy() {
    await browserManager?.close();
    browserManager = undefined;
  },
};

export default manifest;
