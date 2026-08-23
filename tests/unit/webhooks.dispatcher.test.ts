import assert from "node:assert/strict";
import test from "node:test";
import { DeliveryDispatcher } from "../../src/modules/webhooks/infrastructure/deliveryDispatcher.js";
import { ExponentialBackoff } from "../../src/modules/webhooks/infrastructure/exponentialBackoff.js";
import type {
  RecordAttemptRecord,
  WebhookDeliveryRepository,
} from "../../src/modules/webhooks/domain/webhooks.repository.js";
import type { SendInput, SendResult, WebhookSender } from "../../src/modules/webhooks/domain/webhookSender.js";
import type {
  DeliveryWithEndpoint,
  WebhookEndpoint,
} from "../../src/modules/webhooks/domain/webhooks.types.js";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const logger = { info() {}, warn() {}, error() {} };

const endpoint: WebhookEndpoint = {
  id: "e-1",
  userId: "user-1",
  url: "https://subscriber.test/hook",
  description: null,
  secret: "whsec_secret",
  events: ["webhook.ping"],
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function delivery(overrides: Partial<DeliveryWithEndpoint> = {}): DeliveryWithEndpoint {
  return {
    id: "d-1",
    endpointId: endpoint.id,
    userId: endpoint.userId,
    eventType: "webhook.ping",
    payload: { message: "hi" },
    status: "delivering",
    attemptCount: 0,
    nextAttemptAt: null,
    claimId: "claim-1",
    lastError: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    endpoint,
    ...overrides,
  };
}

interface Recorded {
  attempts: RecordAttemptRecord[];
  succeeded: Array<{ id: string; attemptCount: number }>;
  failed: Array<{ id: string; attemptCount: number; lastError: string }>;
  retries: Array<{ id: string; attemptCount: number; nextAttemptAt: Date; lastError: string }>;
  released: number;
}

function fakeRepository(due: DeliveryWithEndpoint[]): { repo: WebhookDeliveryRepository; recorded: Recorded } {
  const recorded: Recorded = { attempts: [], succeeded: [], failed: [], retries: [], released: 0 };
  let remaining = [...due];

  const repo: WebhookDeliveryRepository = {
    createMany: async () => 0,
    list: async () => [],
    findOwned: async () => null,
    listAttempts: async () => [],
    async claimDue(_claimId, _now, limit) {
      const batch = remaining.slice(0, limit);
      remaining = remaining.slice(limit);
      return batch;
    },
    async recordAttempt(data) {
      recorded.attempts.push(data);
    },
    async markSucceeded(id, attemptCount) {
      recorded.succeeded.push({ id, attemptCount });
    },
    async markFailed(id, attemptCount, lastError) {
      recorded.failed.push({ id, attemptCount, lastError });
    },
    async scheduleRetry(id, attemptCount, nextAttemptAt, lastError) {
      recorded.retries.push({ id, attemptCount, nextAttemptAt, lastError });
    },
    requeue: async () => null,
    async releaseStaleClaims() {
      recorded.released += 1;
      return 0;
    },
  };
  return { repo, recorded };
}

function fakeSender(results: SendResult[]): { sender: WebhookSender; calls: SendInput[] } {
  const calls: SendInput[] = [];
  let index = 0;
  return {
    calls,
    sender: {
      async send(input) {
        calls.push(input);
        return results[Math.min(index++, results.length - 1)]!;
      },
    },
  };
}

function result(overrides: Partial<SendResult> = {}): SendResult {
  return {
    ok: false,
    statusCode: null,
    responseBody: null,
    errorMessage: null,
    durationMs: 12,
    terminal: false,
    ...overrides,
  };
}

function dispatcher(
  repo: WebhookDeliveryRepository,
  sender: WebhookSender,
  overrides: { maxAttempts?: number; maxConcurrent?: number } = {},
) {
  return new DeliveryDispatcher({
    deliveries: repo,
    sender,
    retryPolicy: new ExponentialBackoff({
      maxAttempts: overrides.maxAttempts ?? 3,
      baseSeconds: 10,
      maxSeconds: 3_600,
      jitterRatio: 0,
    }),
    logger,
    pollIntervalMs: 1_000,
    maxConcurrent: overrides.maxConcurrent ?? 5,
    now: () => NOW,
  });
}

test("a 2xx response settles the delivery and records the attempt", async () => {
  const { repo, recorded } = fakeRepository([delivery()]);
  const { sender, calls } = fakeSender([result({ ok: true, statusCode: 200, responseBody: "ok" })]);

  assert.equal(await dispatcher(repo, sender).runOnce(), 1);

  assert.deepEqual(recorded.succeeded, [{ id: "d-1", attemptCount: 1 }]);
  assert.equal(recorded.failed.length, 0);
  assert.equal(recorded.retries.length, 0);
  assert.deepEqual(recorded.attempts, [
    { deliveryId: "d-1", attempt: 1, statusCode: 200, responseBody: "ok", errorMessage: null, durationMs: 12 },
  ]);
  // The signed envelope the subscriber receives.
  assert.deepEqual(calls[0]!.payload, {
    id: "d-1",
    type: "webhook.ping",
    createdAt: NOW.toISOString(),
    data: { message: "hi" },
  });
  assert.equal(calls[0]!.secret, "whsec_secret");
  assert.equal(calls[0]!.attempt, 1);
});

test("a 5xx schedules the next attempt on the backoff curve", async () => {
  const { repo, recorded } = fakeRepository([delivery({ attemptCount: 1 })]);
  const { sender } = fakeSender([result({ statusCode: 500, errorMessage: "Endpoint responded with 500" })]);

  await dispatcher(repo, sender).runOnce();

  assert.equal(recorded.succeeded.length, 0);
  assert.equal(recorded.failed.length, 0);
  assert.deepEqual(recorded.retries, [
    {
      id: "d-1",
      attemptCount: 2,
      // Second attempt made → 10 * 2^1 seconds later.
      nextAttemptAt: new Date(NOW.getTime() + 20_000),
      lastError: "Endpoint responded with 500",
    },
  ]);
});

test("the last allowed attempt marks the delivery failed instead of retrying", async () => {
  const { repo, recorded } = fakeRepository([delivery({ attemptCount: 2 })]);
  const { sender } = fakeSender([result({ errorMessage: "Request timed out after 5000ms" })]);

  await dispatcher(repo, sender, { maxAttempts: 3 }).runOnce();

  assert.equal(recorded.retries.length, 0);
  assert.deepEqual(recorded.failed, [
    { id: "d-1", attemptCount: 3, lastError: "Request timed out after 5000ms" },
  ]);
});

test("a terminal send failure fails immediately without burning the retry budget", async () => {
  const { repo, recorded } = fakeRepository([delivery()]);
  const { sender, calls } = fakeSender([
    result({ terminal: true, errorMessage: "Endpoint URL resolves to a blocked destination" }),
  ]);

  await dispatcher(repo, sender, { maxAttempts: 5 }).runOnce();

  assert.equal(calls.length, 1);
  assert.equal(recorded.retries.length, 0);
  assert.deepEqual(recorded.failed, [
    { id: "d-1", attemptCount: 1, lastError: "Endpoint URL resolves to a blocked destination" },
  ]);
  // The blocked attempt is still logged, so the trail explains the failure.
  assert.equal(recorded.attempts[0]!.errorMessage, "Endpoint URL resolves to a blocked destination");
});

test("a poll cycle releases stale claims, respects the batch bound, and no-ops when idle", async () => {
  const batch = [delivery({ id: "d-1" }), delivery({ id: "d-2" }), delivery({ id: "d-3" })];
  const { repo, recorded } = fakeRepository(batch);
  const { sender, calls } = fakeSender([result({ ok: true, statusCode: 204 })]);
  const worker = dispatcher(repo, sender, { maxConcurrent: 2 });

  assert.equal(await worker.runOnce(), 2);
  assert.deepEqual(calls.map((call) => call.deliveryId), ["d-1", "d-2"]);
  assert.equal(await worker.runOnce(), 1);
  assert.equal(await worker.runOnce(), 0);
  // Every cycle sweeps claims abandoned by a crashed instance.
  assert.equal(recorded.released, 3);
  assert.equal(recorded.succeeded.length, 3);
});

test("stop() is safe before start and after a completed cycle", async () => {
  const { repo } = fakeRepository([]);
  const { sender } = fakeSender([result({ ok: true, statusCode: 200 })]);
  const worker = dispatcher(repo, sender);
  await worker.stop();
  worker.start();
  worker.start(); // idempotent — must not leak a second interval
  await worker.stop();
});
