import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../src/core/db.js";
import {
  createPrismaWebhookDeliveryRepository,
  createPrismaWebhookEndpointRepository,
} from "../../src/modules/webhooks/infrastructure/prismaWebhooksRepository.js";

const endpoints = createPrismaWebhookEndpointRepository(db);
const deliveries = createPrismaWebhookDeliveryRepository(db);
const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const userId = `webhooks-repository-${suffix}`;
const otherUserId = `${userId}-other`;

test.after(async () => {
  // Deliveries and attempts cascade from the endpoint.
  await db.webhookEndpoint.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await db.$disconnect();
});

test("Prisma repository persists endpoints, scopes every read and write to the owner", async () => {
  const endpoint = await endpoints.create({
    userId,
    url: "https://subscriber.test/hook",
    description: "primary",
    secret: "whsec_repository",
    events: ["webhook.ping", "qr.code.created"],
  });

  assert.equal(endpoint.active, true);
  assert.equal((await endpoints.findOwned(endpoint.id, userId))?.description, "primary");
  assert.equal(await endpoints.findOwned(endpoint.id, otherUserId), null);
  assert.equal((await endpoints.listByUser(userId)).length, 1);
  assert.equal((await endpoints.listByUser(otherUserId)).length, 0);

  // findSubscribed drives fan-out: it must match on the array column and
  // exclude paused endpoints.
  assert.equal((await endpoints.findSubscribed(userId, "qr.code.created")).length, 1);
  assert.equal((await endpoints.findSubscribed(userId, "auth.apikey.created")).length, 0);
  assert.equal((await endpoints.findSubscribed(otherUserId, "qr.code.created")).length, 0);

  assert.equal(await endpoints.update(endpoint.id, otherUserId, { active: false }), null);
  const paused = await endpoints.update(endpoint.id, userId, { active: false, description: null });
  assert.equal(paused?.active, false);
  assert.equal(paused?.description, null);
  assert.equal((await endpoints.findSubscribed(userId, "qr.code.created")).length, 0);

  await endpoints.update(endpoint.id, userId, { active: true });
  assert.equal(await endpoints.deleteOwned(endpoint.id, otherUserId), false);
  assert.equal(await endpoints.deleteOwned(endpoint.id, userId), true);
  assert.equal(await endpoints.findOwned(endpoint.id, userId), null);
});

test("claiming a due delivery is exclusive, and the lifecycle transitions persist", async () => {
  const endpoint = await endpoints.create({
    userId,
    url: "https://subscriber.test/lifecycle",
    description: null,
    secret: "whsec_lifecycle",
    events: ["webhook.ping"],
  });

  assert.equal(
    await deliveries.createMany([
      { endpointId: endpoint.id, userId, eventType: "webhook.ping", payload: { message: "one" } },
      { endpointId: endpoint.id, userId, eventType: "webhook.ping", payload: { message: "two" } },
    ]),
    2,
  );
  assert.equal(await deliveries.createMany([]), 0);

  const listed = await deliveries.list({ userId, limit: 10 });
  assert.equal(listed.length, 2);
  assert.equal(listed[0]!.status, "pending");
  assert.equal((await deliveries.list({ userId: otherUserId, limit: 10 })).length, 0);
  assert.equal((await deliveries.list({ userId, limit: 10, status: "succeeded" })).length, 0);
  assert.equal((await deliveries.list({ userId, limit: 10, endpointId: endpoint.id })).length, 2);

  // Two dispatchers race for the same rows; between them each row is
  // claimed exactly once.
  const now = new Date();
  const [first, second] = await Promise.all([
    deliveries.claimDue("claim-a", now, 10),
    deliveries.claimDue("claim-b", now, 10),
  ]);
  const claimedIds = [...first!, ...second!].map((row) => row.id);
  assert.equal(claimedIds.length, 2, "each delivery must be claimed exactly once across both dispatchers");
  assert.equal(new Set(claimedIds).size, 2);
  assert.equal((await deliveries.claimDue("claim-c", new Date(), 10)).length, 0);

  const claimed = first!.length > 0 ? first![0]! : second![0]!;
  assert.equal(claimed.endpoint.secret, "whsec_lifecycle");
  assert.equal(claimed.status, "delivering");

  // Settle the delivery this test isn't driving. Left in `delivering` it
  // would look like an abandoned claim to the stale-claim sweeper below.
  const other = claimedIds.find((id) => id !== claimed.id)!;
  await deliveries.markSucceeded(other, 1, new Date());

  await deliveries.recordAttempt({
    deliveryId: claimed.id,
    attempt: 1,
    statusCode: 500,
    responseBody: "nope",
    errorMessage: "Endpoint responded with 500",
    durationMs: 7,
  });
  const retryAt = new Date(Date.now() + 60_000);
  await deliveries.scheduleRetry(claimed.id, 1, retryAt, "Endpoint responded with 500");

  const retrying = await deliveries.findOwned(claimed.id, userId);
  assert.equal(retrying?.status, "pending");
  assert.equal(retrying?.attemptCount, 1);
  assert.equal(retrying?.claimId, null);
  assert.equal(retrying?.nextAttemptAt?.getTime(), retryAt.getTime());
  // Not due yet, so a poll now must leave it alone.
  assert.equal((await deliveries.claimDue("claim-d", new Date(), 10)).length, 0);

  await deliveries.markFailed(claimed.id, 5, "Endpoint responded with 500", new Date());
  const failed = await deliveries.findOwned(claimed.id, userId);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.completedAt !== null, true);
  assert.equal((await deliveries.listAttempts(claimed.id)).length, 1);

  // Replay puts it back in the queue with a clean counter.
  assert.equal(await deliveries.requeue(claimed.id, otherUserId), null);
  const requeued = await deliveries.requeue(claimed.id, userId);
  assert.equal(requeued?.status, "pending");
  assert.equal(requeued?.attemptCount, 0);
  assert.equal(requeued?.completedAt, null);
  assert.equal((await deliveries.listAttempts(claimed.id)).length, 1, "replay preserves the attempt history");

  const reclaimed = await deliveries.claimDue("claim-e", new Date(), 10);
  assert.equal(reclaimed.length, 1);
  await deliveries.markSucceeded(claimed.id, 1, new Date());
  const succeeded = await deliveries.findOwned(claimed.id, userId);
  assert.equal(succeeded?.status, "succeeded");
  assert.equal(succeeded?.lastError, null);
  assert.equal(await deliveries.findOwned(claimed.id, otherUserId), null);
});

test("stale claims from a crashed dispatcher are released back to pending", async () => {
  const endpoint = await endpoints.create({
    userId,
    url: "https://subscriber.test/stale",
    description: null,
    secret: "whsec_stale",
    events: ["webhook.ping"],
  });
  await deliveries.createMany([
    { endpointId: endpoint.id, userId, eventType: "webhook.ping", payload: { message: "stuck" } },
  ]);

  const claimed = await deliveries.claimDue("crashed-instance", new Date(), 10);
  assert.equal(claimed.length, 1);
  const stuckId = claimed[0]!.id;

  // The sweep and the claim query are both global by design, so this test
  // asserts on its own row rather than on counts another suite could move.
  await deliveries.releaseStaleClaims(new Date(Date.now() - 60_000));
  assert.equal((await deliveries.findOwned(stuckId, userId))?.status, "delivering", "not stale yet");
  assert.equal(
    (await deliveries.claimDue("healthy", new Date(), 10)).some((row) => row.id === stuckId),
    false,
    "a live claim must not be re-claimable",
  );

  // Sweeping with a future cutoff treats the claim as abandoned.
  assert.ok((await deliveries.releaseStaleClaims(new Date(Date.now() + 60_000))) >= 1);
  const released = await deliveries.findOwned(stuckId, userId);
  assert.equal(released?.status, "pending");
  assert.equal(released?.claimId, null);
  assert.ok(
    (await deliveries.claimDue("healthy", new Date(), 10)).some((row) => row.id === stuckId),
    "the released delivery should be picked up again",
  );
});
