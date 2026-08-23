import type { RequestHandler } from "express";
import type { DeliveryService } from "./application/delivery.service.js";
import type { EndpointService } from "./application/endpoint.service.js";
import { WEBHOOK_EVENTS } from "./domain/eventCatalog.js";
import type {
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookEndpoint,
} from "./domain/webhooks.types.js";
import type { CreateEndpointBody, IdParam, ListDeliveriesQuery, UpdateEndpointBody } from "./webhooks.schemas.js";

function toEndpointResource(endpoint: WebhookEndpoint) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    events: endpoint.events,
    active: endpoint.active,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

function toDeliveryResource(delivery: WebhookDelivery) {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    eventType: delivery.eventType,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    lastError: delivery.lastError,
    completedAt: delivery.completedAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
  };
}

function toAttemptResource(attempt: WebhookDeliveryAttempt) {
  return {
    id: attempt.id,
    attempt: attempt.attempt,
    statusCode: attempt.statusCode,
    responseBody: attempt.responseBody,
    errorMessage: attempt.errorMessage,
    durationMs: attempt.durationMs,
    createdAt: attempt.createdAt.toISOString(),
  };
}

export function createWebhooksController(deps: {
  endpointService: EndpointService;
  deliveryService: DeliveryService;
}) {
  const { endpointService, deliveryService } = deps;

  const createEndpoint: RequestHandler = async (req, res) => {
    // req.user is guaranteed — every route here is registered auth: true.
    const endpoint = await endpointService.create(req.user!.id, req.validated.body as CreateEndpointBody);
    // The only response that ever carries the secret.
    res.ok({ ...toEndpointResource(endpoint), secret: endpoint.secret }, 201);
  };

  const listEndpoints: RequestHandler = async (req, res) => {
    const endpoints = await endpointService.list(req.user!.id);
    res.ok(endpoints.map(toEndpointResource));
  };

  const getEndpoint: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as IdParam;
    res.ok(toEndpointResource(await endpointService.get(req.user!.id, id)));
  };

  const updateEndpoint: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as IdParam;
    const updated = await endpointService.update(req.user!.id, id, req.validated.body as UpdateEndpointBody);
    res.ok(toEndpointResource(updated));
  };

  const deleteEndpoint: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as IdParam;
    await endpointService.remove(req.user!.id, id);
    res.ok({ success: true });
  };

  const testEndpoint: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as IdParam;
    const userId = req.user!.id;
    const ping = await endpointService.buildPingPayload(userId, id);
    const queued = await deliveryService.enqueue({ userId, eventType: ping.eventType, data: ping.data });
    res.ok({ queued, eventType: ping.eventType }, 202);
  };

  const listDeliveries: RequestHandler = async (req, res) => {
    const query = req.validated.query as ListDeliveriesQuery;
    const deliveries = await deliveryService.list({ userId: req.user!.id, ...query });
    res.ok(deliveries.map(toDeliveryResource));
  };

  const getDelivery: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as IdParam;
    const { delivery, attempts } = await deliveryService.get(req.user!.id, id);
    res.ok({
      ...toDeliveryResource(delivery),
      payload: delivery.payload,
      attempts: attempts.map(toAttemptResource),
    });
  };

  const replayDelivery: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as IdParam;
    res.ok(toDeliveryResource(await deliveryService.replay(req.user!.id, id)), 202);
  };

  const listEvents: RequestHandler = (_req, res) => {
    res.ok(WEBHOOK_EVENTS.map((event) => ({ ...event })));
  };

  return {
    createEndpoint,
    listEndpoints,
    getEndpoint,
    updateEndpoint,
    deleteEndpoint,
    testEndpoint,
    listDeliveries,
    getDelivery,
    replayDelivery,
    listEvents,
  };
}

export type WebhooksController = ReturnType<typeof createWebhooksController>;
