import { Router } from "express";
import type { ModuleContext, ModuleManifest } from "../../core/moduleContract.js";
import { createBase64Service } from "./application/base64.service.js";
import { createHashService } from "./application/hash.service.js";
import { createJwtService } from "./application/jwt.service.js";
import { createUuidService } from "./application/uuid.service.js";
import { createDeveloperToolsController } from "./developer-tools.controller.js";
import { createDeveloperToolsRoutes } from "./developer-tools.routes.js";
import { HashStrategyRegistry } from "./domain/hashStrategy.js";
import { UuidGeneratorRegistry } from "./domain/uuidGenerator.js";
import { Base64EncodingStrategy } from "./infrastructure/encoding/base64EncodingStrategy.js";
import { Sha256HashStrategy, Sha384HashStrategy, Sha512HashStrategy } from "./infrastructure/hash/hashStrategies.js";
import { StandardJwtDecoder } from "./infrastructure/jwt/standardJwtDecoder.js";
import { UuidV4Generator, UuidV7Generator } from "./infrastructure/uuid/uuidGenerators.js";

const routerHandle = Router();

const manifest: ModuleManifest = {
  name: "developer-tools",
  version: "1.0.0",
  basePath: "/api/v1/dev-tools",
  routes: routerHandle,
  requiresAuth: true,
  dependencies: ["auth"],
  async onInit(ctx: ModuleContext) {
    const uuidRegistry = new UuidGeneratorRegistry();
    uuidRegistry.register(new UuidV4Generator());
    uuidRegistry.register(new UuidV7Generator());

    const hashRegistry = new HashStrategyRegistry();
    hashRegistry.register(new Sha256HashStrategy());
    hashRegistry.register(new Sha384HashStrategy());
    hashRegistry.register(new Sha512HashStrategy());

    const controller = createDeveloperToolsController({
      uuidService: createUuidService({ registry: uuidRegistry, logger: ctx.logger }),
      hashService: createHashService({ registry: hashRegistry, logger: ctx.logger }),
      base64Service: createBase64Service({ strategy: new Base64EncodingStrategy(), logger: ctx.logger }),
      jwtService: createJwtService({ decoder: new StandardJwtDecoder(), logger: ctx.logger }),
    });
    routerHandle.use(createDeveloperToolsRoutes(controller));
  },
};

export default manifest;
