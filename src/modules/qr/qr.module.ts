import { Router } from "express";
import type { ModuleManifest, ModuleContext } from "../../core/moduleContract.js";
import { createQrRepository } from "./qr.repository.js";
import { createQrService } from "./qr.service.js";
import { createQrController } from "./qr.controller.js";
import { createQrRoutes } from "./qr.routes.js";

// Same pass-through-router pattern as auth.module.ts — see the comment
// there for why this exists.
const routerHandle = Router();

const manifest: ModuleManifest = {
  name: "qr",
  version: "1.0.0",
  basePath: "/api/v1/qr",
  routes: routerHandle,
  requiresAuth: true,
  dependencies: ["auth"],
  async onInit(ctx: ModuleContext) {
    const repo = createQrRepository(ctx.db);
    const service = createQrService({ repo, eventBus: ctx.eventBus });
    const controller = createQrController(service);
    routerHandle.use(createQrRoutes(controller));
  },
};

export default manifest;
