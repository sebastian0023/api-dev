import { Router } from "express";
import type { ModuleManifest, ModuleContext } from "../../core/moduleContract.js";
import { createTemplateRepository } from "./template.repository.js";
import { createTemplateService } from "./template.service.js";
import { createTemplateController } from "./template.controller.js";
import { createTemplateRoutes } from "./template.routes.js";

// Copy this whole folder to src/modules/<your-module>/, rename every
// `template.*` filename and every `Template`/`template` identifier inside
// them, then:
//   1. Set name/basePath/dependencies below.
//   2. Add your Prisma model(s) to prisma/schema.prisma, prefixed
//      <YourModule>*, and run `npm run db:migrate`.
//   3. Replace template.repository.ts's in-memory Map with real
//      db.<yourModel> calls scoped to your own models (see
//      modules/qr/qr.repository.ts for the pattern).
//   4. Delete this comment block.
// No file under src/core/ needs to change — the loader auto-discovers any
// folder under src/modules/ that isn't prefixed with `_`.

const routerHandle = Router();

const manifest: ModuleManifest = {
  name: "template",
  version: "0.1.0",
  basePath: "/api/v1/template",
  routes: routerHandle,
  requiresAuth: true,
  dependencies: [],
  async onInit(ctx: ModuleContext) {
    const repo = createTemplateRepository();
    const service = createTemplateService({ repo, eventBus: ctx.eventBus });
    const controller = createTemplateController(service);
    routerHandle.use(createTemplateRoutes(controller));
  },
};

export default manifest;
