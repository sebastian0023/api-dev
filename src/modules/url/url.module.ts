import { Router } from "express";
import { config } from "../../core/config.js";
import type { ModuleContext, ModuleManifest } from "../../core/moduleContract.js";
import { createUrlService } from "./url.service.js";
import { Base62ShortCodeGenerator } from "./url.base62ShortCodeGenerator.js";
import { createPrismaShortUrlRepository } from "./url.prismaShortUrlRepository.js";
import { createUrlController } from "./url.controller.js";
import { createUrlRoutes } from "./url.routes.js";

const routerHandle = Router();
const now = () => new Date();

const manifest: ModuleManifest = {
  name: "url",
  version: "1.0.0",
  basePath: "/api/v1/urls",
  routes: routerHandle,
  requiresAuth: true,
  dependencies: ["auth"],
  async onInit(ctx: ModuleContext) {
    const repository = createPrismaShortUrlRepository(ctx.db);
    const generator = new Base62ShortCodeGenerator(config.URL_SHORT_CODE_LENGTH);
    const service = createUrlService({ repo: repository, generator, now });
    const controller = createUrlController(service, config.PUBLIC_URL);
    routerHandle.use(createUrlRoutes(controller, now));
  },
};

export default manifest;
