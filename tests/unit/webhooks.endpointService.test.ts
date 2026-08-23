import assert from "node:assert/strict";
import test from "node:test";
import { DestinationPolicy } from "../../src/shared/net/destinationPolicy.js";
import { createEndpointService } from "../../src/modules/webhooks/application/endpoint.service.js";
import { createDeliveryService } from "../../src/modules/webhooks/application/delivery.service.js";
import { webhookDestinationErrors } from "../../src/modules/webhooks/infrastructure/webhookDestinationErrors.js";
import {
  UnknownWebhookEventError,
  WebhookBlockedDestinationError,
  WebhookDeliveryNotFoundError,
  WebhookDeliveryNotReplayableError,
  WebhookEndpointNotFoundError,
} from "../../src/modules/webhooks/domain/webhooks.errors.js";
import type {
  CreateDeliveryRecord,
  WebhookDeliveryRepository,
  WebhookEndpointRepository,
} from "../../src/modules/webhooks/domain/webhooks.repository.js";
import type {
  DeliveryStatus,
  WebhookDelivery,
  WebhookEndpoint,
} from "../../src/modules/webhooks/domain/webhooks.types.js";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const logger = { info() {}, warn() {}, error() {} };

function policy(address = "8.8.8.8") {
  return new DestinationPolicy(async () => [{ address, family: address.includes(":") ? 6 : 4 }], {
    errors: webhookDestinationErrors,
  });
}

function fakeEndpointRepository(seed: WebhookEndpoint[] = []) {
  const rows = new Map(seed.map((row) => [row.id, row]));
  let sequence = seed.length;

  const repo: WebhookEndpointRepository = {
    async create(data) {
      sequence += 1;
      const row: WebhookEndpoint = { id: `e-${sequence}`, createdAt: NOW, updatedAt: NOW, active: true, ...data };
      rows.set(row.id, row);
      return row;
    },
    async listByUser(userId) {
      return [...rows.values()].filter((row) => row.userId === userId);
    },
    async findOwned(id, userId) {
      const row = rows.get(id);
      return row && row.userId === userId ? row : null;
    },
    async findSubscribed(userId, eventType) {
      return [...rows.values()].filter(
        (row) => row.userId === userId && row.active && row.events.includes(eventType),
      );
    },
    async update(id, userId, data) {
      const row = rows.get(id);
      if (!row || row.userId !== userId) return null;
      const updated = { ...row, ...data, updatedAt: NOW };
      rows.set(id, updated);
      return updated;
    },
    async deleteOwned(id, userId) {
      const row = rows.get(id);
      if (!row || row.userId !== userId) return false;
      rows.delete(id);
      return true;
    },
  };
  return { repo, rows };
}

function endpointService(repo: WebhookEndpointRepository, destinationPolicy = policy()) {
  return createEndpointService({ repo, destinationPolicy, now: () => NOW });
}

test("creating an endpoint mints a secret, dedupes events, and defaults the description", async () => {
  const { repo } = fakeEndpointRepository();
  const created = await endpointService(repo).create("user-1", {
    url: "https://subscriber.test/hook",
    events: ["qr.code.created", "qr.code.created", "webhook.ping"],
  });

  assert.match(created.secret, /^whsec_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(created.events, ["qr.code.created", "webhook.ping"]);
  assert.equal(created.description, null);
  assert.equal(created.active, true);
});

test("registration rejects unknown events and destinations the SSRF policy blocks", async () => {
  const { repo } = fakeEndpointRepository();
  const service = endpointService(repo);

  await assert.rejects(
    () => service.create("user-1", { url: "https://subscriber.test/hook", events: ["qr.code.exploded"] }),
    UnknownWebhookEventError,
  );
  await assert.rejects(
    () => endpointService(repo, policy("127.0.0.1")).create("user-1", {
      url: "https://subscriber.test/hook",
      events: ["webhook.ping"],
    }),
    WebhookBlockedDestinationError,
  );
  // A rejected registration must not have persisted anything.
  assert.deepEqual(await service.list("user-1"), []);
});

test("reads and writes are scoped to the owner", async () => {
  const { repo } = fakeEndpointRepository();
  const service = endpointService(repo);
  const mine = await service.create("user-1", { url: "https://mine.test/hook", events: ["webhook.ping"] });

  assert.equal((await service.get("user-1", mine.id)).id, mine.id);
  await assert.rejects(() => service.get("user-2", mine.id), WebhookEndpointNotFoundError);
  await assert.rejects(() => service.update("user-2", mine.id, { active: false }), WebhookEndpointNotFoundError);
  await assert.rejects(() => service.remove("user-2", mine.id), WebhookEndpointNotFoundError);
  assert.equal((await service.list("user-2")).length, 0);

  await service.remove("user-1", mine.id);
  await assert.rejects(() => service.get("user-1", mine.id), WebhookEndpointNotFoundError);
});

test("update applies only the provided fields and re-validates them", async () => {
  const { repo } = fakeEndpointRepository();
  const service = endpointService(repo);
  const created = await service.create("user-1", {
    url: "https://mine.test/hook",
    description: "first",
    events: ["webhook.ping"],
  });

  const paused = await service.update("user-1", created.id, { active: false });
  assert.equal(paused.active, false);
  assert.equal(paused.url, "https://mine.test/hook");
  assert.equal(paused.description, "first");

  const cleared = await service.update("user-1", created.id, { description: null });
  assert.equal(cleared.description, null);

  await assert.rejects(
    () => service.update("user-1", created.id, { events: ["nope"] }),
    UnknownWebhookEventError,
  );
});

test("a test-fire builds a ping payload naming the endpoint", async () => {
  const { repo } = fakeEndpointRepository();
  const service = endpointService(repo);
  const created = await service.create("user-1", { url: "https://mine.test/hook", events: ["webhook.ping"] });

  const ping = await service.buildPingPayload("user-1", created.id);
  assert.equal(ping.eventType, "webhook.ping");
  assert.equal(ping.data.endpointId, created.id);
  assert.equal(ping.data.firedAt, NOW.toISOString());
  await assert.rejects(() => service.buildPingPayload("user-2", created.id), WebhookEndpointNotFoundError);
});

function fakeDeliveryRepository(seed: WebhookDelivery[] = []) {
  const rows = new Map(seed.map((row) => [row.id, row]));
  const created: CreateDeliveryRecord[] = [];

  const repo: WebhookDeliveryRepository = {
    async createMany(records) {
      created.push(...records);
      return records.length;
    },
    async list(filter) {
      return [...rows.values()].filter((row) => row.userId === filter.userId).slice(0, filter.limit);
    },
    async findOwned(id, userId) {
      const row = rows.get(id);
      return row && row.userId === userId ? row : null;
    },
    listAttempts: async () => [],
    claimDue: async () => [],
    recordAttempt: async () => {},
    markSucceeded: async () => {},
    markFailed: async () => {},
    scheduleRetry: async () => {},
    async requeue(id, userId) {
      const row = rows.get(id);
      if (!row || row.userId !== userId) return null;
      const requeued: WebhookDelivery = { ...row, status: "pending", attemptCount: 0, completedAt: null };
      rows.set(id, requeued);
      return requeued;
    },
    releaseStaleClaims: async () => 0,
  };
  return { repo, created, rows };
}

function deliveryRow(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: "d-1",
    endpointId: "e-1",
    userId: "user-1",
    eventType: "qr.code.created",
    payload: { qrCodeId: "q-1" },
    status: "failed" as DeliveryStatus,
    attemptCount: 5,
    nextAttemptAt: null,
    claimId: null,
    lastError: "Endpoint responded with 500",
    completedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test("fan-out queues one delivery per subscribed endpoint and skips unsubscribed users", async () => {
  const { repo: endpoints } = fakeEndpointRepository();
  const service = endpointService(endpoints);
  await service.create("user-1", { url: "https://a.test/hook", events: ["qr.code.created"] });
  await service.create("user-1", { url: "https://b.test/hook", events: ["qr.code.created", "webhook.ping"] });
  await service.create("user-1", { url: "https://c.test/hook", events: ["auth.apikey.created"] });
  const paused = await service.create("user-1", { url: "https://d.test/hook", events: ["qr.code.created"] });
  await service.update("user-1", paused.id, { active: false });
  await service.create("user-2", { url: "https://other.test/hook", events: ["qr.code.created"] });

  const { repo: deliveries, created } = fakeDeliveryRepository();
  const deliveryService = createDeliveryService({ deliveries, endpoints, logger });

  const queued = await deliveryService.enqueue({
    userId: "user-1",
    eventType: "qr.code.created",
    data: { qrCodeId: "q-1", userId: "user-1" },
  });

  // Two subscribed and active; the inactive one, the differently-subscribed
  // one, and the other tenant's endpoint are all excluded.
  assert.equal(queued, 2);
  assert.deepEqual(created.map((record) => record.endpointId).sort(), ["e-1", "e-2"]);
  assert.equal(await deliveryService.enqueue({ userId: "user-1", eventType: "url.created", data: {} }), 0);
  assert.equal(await deliveryService.enqueue({ userId: "nobody", eventType: "qr.code.created", data: {} }), 0);
});

test("replay requeues a settled delivery and refuses one already in flight", async () => {
  const { repo: endpoints } = fakeEndpointRepository();
  const { repo: deliveries } = fakeDeliveryRepository([
    deliveryRow(),
    deliveryRow({ id: "d-2", status: "pending", attemptCount: 1, completedAt: null }),
    deliveryRow({ id: "d-3", status: "delivering", completedAt: null }),
    deliveryRow({ id: "d-4", status: "succeeded" }),
  ]);
  const service = createDeliveryService({ deliveries, endpoints, logger });

  const replayed = await service.replay("user-1", "d-1");
  assert.equal(replayed.status, "pending");
  assert.equal(replayed.attemptCount, 0);
  assert.equal(replayed.completedAt, null);
  assert.equal((await service.replay("user-1", "d-4")).status, "pending");

  await assert.rejects(() => service.replay("user-1", "d-2"), WebhookDeliveryNotReplayableError);
  await assert.rejects(() => service.replay("user-1", "d-3"), WebhookDeliveryNotReplayableError);
  await assert.rejects(() => service.replay("user-2", "d-1"), WebhookDeliveryNotFoundError);
  await assert.rejects(() => service.replay("user-1", "missing"), WebhookDeliveryNotFoundError);
});
