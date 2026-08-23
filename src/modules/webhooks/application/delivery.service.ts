import type { Logger } from "../../../core/moduleContract.js";
import type {
  ListDeliveriesFilter,
  WebhookDeliveryRepository,
  WebhookEndpointRepository,
} from "../../webhooks/domain/webhooks.repository.js";
import { WebhookDeliveryNotFoundError, WebhookDeliveryNotReplayableError } from "../../webhooks/domain/webhooks.errors.js";
import { SETTLED_STATUSES, type WebhookDelivery, type WebhookDeliveryAttempt } from "../../webhooks/domain/webhooks.types.js";

export function createDeliveryService(deps: {
  deliveries: WebhookDeliveryRepository;
  endpoints: WebhookEndpointRepository;
  logger: Logger;
}) {
  const { deliveries, endpoints, logger } = deps;

  /**
   * Fan-out for one platform event. Only writes rows — the dispatcher does
   * the sending — so an emitting module's request is never slowed down or
   * failed by a subscriber's endpoint.
   */
  async function enqueue(input: { userId: string; eventType: string; data: Record<string, unknown> }): Promise<number> {
    const subscribed = await endpoints.findSubscribed(input.userId, input.eventType);
    if (subscribed.length === 0) return 0;

    const created = await deliveries.createMany(
      subscribed.map((endpoint) => ({
        endpointId: endpoint.id,
        userId: input.userId,
        eventType: input.eventType,
        payload: input.data,
      })),
    );
    logger.info("Webhook deliveries queued", { event: input.eventType, count: created });
    return created;
  }

  function list(filter: ListDeliveriesFilter): Promise<WebhookDelivery[]> {
    return deliveries.list(filter);
  }

  async function get(
    userId: string,
    id: string,
  ): Promise<{ delivery: WebhookDelivery; attempts: WebhookDeliveryAttempt[] }> {
    const delivery = await deliveries.findOwned(id, userId);
    if (!delivery) throw new WebhookDeliveryNotFoundError();
    return { delivery, attempts: await deliveries.listAttempts(delivery.id) };
  }

  async function replay(userId: string, id: string): Promise<WebhookDelivery> {
    const existing = await deliveries.findOwned(id, userId);
    if (!existing) throw new WebhookDeliveryNotFoundError();
    // A pending or in-flight delivery is already going to be attempted;
    // requeueing it would duplicate the send.
    if (!SETTLED_STATUSES.includes(existing.status)) throw new WebhookDeliveryNotReplayableError(existing.status);

    const requeued = await deliveries.requeue(id, userId);
    if (!requeued) throw new WebhookDeliveryNotReplayableError(existing.status);
    return requeued;
  }

  return { enqueue, list, get, replay };
}

export type DeliveryService = ReturnType<typeof createDeliveryService>;
