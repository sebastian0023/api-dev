import { Router } from "express";
import { config } from "../../core/config.js";
import type { ModuleContext, ModuleManifest } from "../../core/moduleContract.js";
import { DestinationPolicy, systemDnsResolver } from "../../shared/net/destinationPolicy.js";
import { createDeliveryService } from "./application/delivery.service.js";
import { createEndpointService } from "./application/endpoint.service.js";
import { subscribableEventNames } from "./domain/eventCatalog.js";
import { DeliveryDispatcher } from "./infrastructure/deliveryDispatcher.js";
import { ExponentialBackoff } from "./infrastructure/exponentialBackoff.js";
import { FetchWebhookSender } from "./infrastructure/fetchWebhookSender.js";
import { HmacPayloadSigner } from "./infrastructure/hmacPayloadSigner.js";
import {
  createPrismaWebhookDeliveryRepository,
  createPrismaWebhookEndpointRepository,
} from "./infrastructure/prismaWebhooksRepository.js";
import { webhookDestinationErrors } from "./infrastructure/webhookDestinationErrors.js";
import { createWebhooksController } from "./webhooks.controller.js";
import { createWebhooksRoutes } from "./webhooks.routes.js";

const routerHandle = Router();
let dispatcher: DeliveryDispatcher | undefined;

const manifest: ModuleManifest = {
  name: "webhooks",
  version: "1.0.0",
  basePath: "/api/v1/webhooks",
  routes: routerHandle,
  requiresAuth: true,
  dependencies: ["auth"],
  async onInit(ctx: ModuleContext) {
    const endpoints = createPrismaWebhookEndpointRepository(ctx.db);
    const deliveries = createPrismaWebhookDeliveryRepository(ctx.db);
    const destinationPolicy = new DestinationPolicy(systemDnsResolver, {
      errors: webhookDestinationErrors,
      allowPrivate: config.WEBHOOKS_ALLOW_PRIVATE_DESTINATIONS,
    });

    const endpointService = createEndpointService({ repo: endpoints, destinationPolicy, now: () => new Date() });
    const deliveryService = createDeliveryService({ deliveries, endpoints, logger: ctx.logger });

    dispatcher = new DeliveryDispatcher({
      deliveries,
      sender: new FetchWebhookSender({
        destinationPolicy,
        signer: new HmacPayloadSigner(),
        timeoutMs: config.WEBHOOKS_TIMEOUT_MS,
        maxResponseBytes: config.WEBHOOKS_MAX_RESPONSE_BYTES,
      }),
      retryPolicy: new ExponentialBackoff({
        maxAttempts: config.WEBHOOKS_MAX_ATTEMPTS,
        baseSeconds: config.WEBHOOKS_BACKOFF_BASE_SECONDS,
        maxSeconds: config.WEBHOOKS_BACKOFF_MAX_SECONDS,
      }),
      logger: ctx.logger,
      pollIntervalMs: config.WEBHOOKS_POLL_INTERVAL_MS,
      maxConcurrent: config.WEBHOOKS_MAX_CONCURRENT_DELIVERIES,
    });
    dispatcher.start();

    // The whole point of the module: it reacts to what other modules
    // already announce, without importing a line of their code. A payload
    // without a userId can't be attributed to a subscriber, so it is
    // dropped rather than fanned out to everyone.
    for (const eventType of subscribableEventNames()) {
      ctx.eventBus.on(eventType, async (payload) => {
        const userId = payload.userId;
        if (typeof userId !== "string") {
          ctx.logger.warn("Skipping webhook fan-out for an event without a userId", { event: eventType });
          return;
        }
        await deliveryService.enqueue({ userId, eventType, data: payload });
      });
    }

    routerHandle.use(createWebhooksRoutes(createWebhooksController({ endpointService, deliveryService })));
  },
  async onDestroy() {
    await dispatcher?.stop();
    dispatcher = undefined;
  },
};

export default manifest;
