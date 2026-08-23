import { createModuleRouter } from "../../shared/http/moduleRouter.js";
import { envelope } from "../../shared/http/envelope.js";
import { SuccessResource } from "../../shared/validation/common.js";
import type { WebhooksController } from "./webhooks.controller.js";
import {
  CreateEndpointBody,
  DeliveryDetailResource,
  DeliveryListResource,
  DeliveryResource,
  EndpointCreatedResource,
  EndpointListResource,
  EndpointResource,
  IdParam,
  ListDeliveriesQuery,
  TestFireResource,
  UpdateEndpointBody,
  WebhookEventListResource,
} from "./webhooks.schemas.js";

const READ_RATE_LIMIT = { bucket: "webhooks-read", points: 120, durationSeconds: 60 };
const WRITE_RATE_LIMIT = { bucket: "webhooks-write", points: 30, durationSeconds: 60 };
// Test-fires are the one write that costs an outbound request per call.
const TEST_RATE_LIMIT = { bucket: "webhooks-test", points: 10, durationSeconds: 60 };

export function createWebhooksRoutes(controller: WebhooksController) {
  const { router, route } = createModuleRouter({
    name: "webhooks",
    basePath: "/api/v1/webhooks",
    tag: "Webhooks",
  });

  route({
    method: "get",
    path: "/events",
    summary: "List subscribable event types",
    auth: true,
    scopes: ["webhooks:read"],
    rateLimit: READ_RATE_LIMIT,
    response: { status: 200, schema: envelope(WebhookEventListResource) },
    errors: [401, 403, 429],
    handler: controller.listEvents,
  });

  route({
    method: "post",
    path: "/endpoints",
    summary: "Register a webhook endpoint",
    description:
      "Returns the signing secret exactly once. Store it — it is required to verify the HMAC on every delivery and cannot be retrieved later.",
    auth: true,
    idempotent: true,
    scopes: ["webhooks:write"],
    rateLimit: WRITE_RATE_LIMIT,
    request: { body: CreateEndpointBody },
    response: { status: 201, schema: envelope(EndpointCreatedResource) },
    errors: [401, 403, 409, 422, 429],
    handler: controller.createEndpoint,
  });

  route({
    method: "get",
    path: "/endpoints",
    summary: "List your webhook endpoints",
    auth: true,
    scopes: ["webhooks:read"],
    rateLimit: READ_RATE_LIMIT,
    response: { status: 200, schema: envelope(EndpointListResource) },
    errors: [401, 403, 429],
    handler: controller.listEndpoints,
  });

  route({
    method: "get",
    path: "/endpoints/:id",
    summary: "Get a webhook endpoint",
    auth: true,
    scopes: ["webhooks:read"],
    rateLimit: READ_RATE_LIMIT,
    request: { params: IdParam },
    response: { status: 200, schema: envelope(EndpointResource) },
    errors: [401, 403, 404, 429],
    handler: controller.getEndpoint,
  });

  route({
    method: "patch",
    path: "/endpoints/:id",
    summary: "Update a webhook endpoint",
    auth: true,
    scopes: ["webhooks:write"],
    rateLimit: WRITE_RATE_LIMIT,
    request: { params: IdParam, body: UpdateEndpointBody },
    response: { status: 200, schema: envelope(EndpointResource) },
    errors: [401, 403, 404, 422, 429],
    handler: controller.updateEndpoint,
  });

  route({
    method: "delete",
    path: "/endpoints/:id",
    summary: "Delete a webhook endpoint",
    auth: true,
    scopes: ["webhooks:write"],
    rateLimit: WRITE_RATE_LIMIT,
    request: { params: IdParam },
    response: { status: 200, schema: envelope(SuccessResource) },
    errors: [401, 403, 404, 429],
    handler: controller.deleteEndpoint,
  });

  route({
    method: "post",
    path: "/endpoints/:id/test",
    summary: "Send a test event to an endpoint",
    description:
      "Queues a synthetic webhook.ping delivery so you can watch the full signing, delivery, and retry loop without waiting for real activity.",
    auth: true,
    scopes: ["webhooks:write"],
    rateLimit: TEST_RATE_LIMIT,
    request: { params: IdParam },
    response: { status: 202, schema: envelope(TestFireResource), description: "Accepted — delivery queued" },
    errors: [401, 403, 404, 429],
    handler: controller.testEndpoint,
  });

  route({
    method: "get",
    path: "/deliveries",
    summary: "List webhook deliveries",
    auth: true,
    scopes: ["webhooks:read"],
    rateLimit: READ_RATE_LIMIT,
    request: { query: ListDeliveriesQuery },
    response: { status: 200, schema: envelope(DeliveryListResource) },
    errors: [401, 403, 422, 429],
    handler: controller.listDeliveries,
  });

  route({
    method: "get",
    path: "/deliveries/:id",
    summary: "Get a delivery with its attempt history",
    auth: true,
    scopes: ["webhooks:read"],
    rateLimit: READ_RATE_LIMIT,
    request: { params: IdParam },
    response: { status: 200, schema: envelope(DeliveryDetailResource) },
    errors: [401, 403, 404, 429],
    handler: controller.getDelivery,
  });

  route({
    method: "post",
    path: "/deliveries/:id/replay",
    summary: "Replay a settled delivery",
    description: "Requeues a succeeded or failed delivery with its original payload. Its attempt history is preserved.",
    auth: true,
    scopes: ["webhooks:write"],
    rateLimit: WRITE_RATE_LIMIT,
    request: { params: IdParam },
    response: { status: 202, schema: envelope(DeliveryResource), description: "Accepted — delivery requeued" },
    errors: [401, 403, 404, 409, 429],
    handler: controller.replayDelivery,
  });

  return router;
}
