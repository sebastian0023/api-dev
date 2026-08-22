import { Router } from "express";
import type { ModuleManifest, ModuleContext } from "../../core/moduleContract.js";
import { registerCredentialVerifier } from "../../core/middleware/auth.js";
import { createAuthRepository } from "./auth.repository.js";
import { createAuthService } from "./auth.service.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRoutes } from "./auth.routes.js";

// The manifest's `routes` field must exist synchronously at import time,
// but the real router needs `db`/`eventBus`, which only arrive in onInit.
// This empty Router is mounted by the loader immediately; onInit then
// `.use()`s the fully-wired router into it. Express routers are just
// middleware stacks checked per-request, so layers added after mounting
// still take effect — see modules/_template for the same pattern.
const routerHandle = Router();

const manifest: ModuleManifest = {
  name: "auth",
  version: "1.0.0",
  basePath: "/api/v1/auth",
  routes: routerHandle,
  requiresAuth: false,
  dependencies: [],
  async onInit(ctx: ModuleContext) {
    const repo = createAuthRepository(ctx.db);
    const service = createAuthService({ repo, eventBus: ctx.eventBus });
    const controller = createAuthController(service);
    routerHandle.use(createAuthRoutes(controller));

    // Core's auth middleware verifies credentials through this interface
    // without ever importing this module directly.
    registerCredentialVerifier(service.verifier);
  },
};

export default manifest;
