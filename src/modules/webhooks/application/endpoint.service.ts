import type { DestinationPolicy } from "../../../shared/net/destinationPolicy.js";
import { generateOpaqueToken } from "../../../shared/utils/hash.js";
import { PING_EVENT, unknownEvents } from "../../webhooks/domain/eventCatalog.js";
import type { UpdateEndpointRecord, WebhookEndpointRepository } from "../../webhooks/domain/webhooks.repository.js";
import { UnknownWebhookEventError, WebhookEndpointNotFoundError } from "../../webhooks/domain/webhooks.errors.js";
import type { WebhookEndpoint } from "../../webhooks/domain/webhooks.types.js";

export interface CreateEndpointInput {
  url: string;
  description?: string;
  events: string[];
}

export interface UpdateEndpointInput {
  url?: string;
  description?: string | null;
  events?: string[];
  active?: boolean;
}

export function createEndpointService(deps: {
  repo: WebhookEndpointRepository;
  destinationPolicy: DestinationPolicy;
  /** Injected so the ping's payload is deterministic under test. */
  now: () => Date;
}) {
  const { repo, destinationPolicy, now } = deps;

  function assertKnownEvents(events: readonly string[]): void {
    const unknown = unknownEvents(events);
    if (unknown.length > 0) throw new UnknownWebhookEventError(unknown);
  }

  // Validated at registration so a bad URL is a 422 the caller sees
  // immediately, rather than a delivery that quietly fails later. The
  // sender re-validates before every attempt regardless.
  async function assertDeliverable(url: string): Promise<void> {
    await destinationPolicy.assertAllowed(url);
  }

  async function create(userId: string, input: CreateEndpointInput): Promise<WebhookEndpoint> {
    assertKnownEvents(input.events);
    await assertDeliverable(input.url);
    return repo.create({
      userId,
      url: input.url,
      description: input.description ?? null,
      secret: `whsec_${generateOpaqueToken(32)}`,
      events: [...new Set(input.events)],
    });
  }

  function list(userId: string): Promise<WebhookEndpoint[]> {
    return repo.listByUser(userId);
  }

  async function get(userId: string, id: string): Promise<WebhookEndpoint> {
    const endpoint = await repo.findOwned(id, userId);
    if (!endpoint) throw new WebhookEndpointNotFoundError();
    return endpoint;
  }

  async function update(userId: string, id: string, input: UpdateEndpointInput): Promise<WebhookEndpoint> {
    if (input.events) assertKnownEvents(input.events);
    if (input.url) await assertDeliverable(input.url);

    const data: UpdateEndpointRecord = {};
    if (input.url !== undefined) data.url = input.url;
    if (input.description !== undefined) data.description = input.description;
    if (input.events !== undefined) data.events = [...new Set(input.events)];
    if (input.active !== undefined) data.active = input.active;

    const updated = await repo.update(id, userId, data);
    if (!updated) throw new WebhookEndpointNotFoundError();
    return updated;
  }

  async function remove(userId: string, id: string): Promise<void> {
    if (!(await repo.deleteOwned(id, userId))) throw new WebhookEndpointNotFoundError();
  }

  /** Payload for a test-fire — the "simulate a connection" affordance. */
  async function buildPingPayload(userId: string, id: string) {
    const endpoint = await get(userId, id);
    return {
      endpoint,
      data: {
        message: "Test delivery from the API Dev Platform",
        endpointId: endpoint.id,
        firedAt: now().toISOString(),
      } satisfies Record<string, unknown>,
      eventType: PING_EVENT,
    };
  }

  return { create, list, get, update, remove, buildPingPayload };
}

export type EndpointService = ReturnType<typeof createEndpointService>;
