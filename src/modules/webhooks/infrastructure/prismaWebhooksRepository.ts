import { Prisma } from "../../../generated/prisma/client.js";
import type { Db } from "../../../core/db.js";
import type {
  WebhookDeliveryRepository,
  WebhookEndpointRepository,
} from "../../webhooks/domain/webhooks.repository.js";
import type {
  DeliveryStatus,
  DeliveryWithEndpoint,
  WebhookDelivery,
  WebhookEndpoint,
} from "../../webhooks/domain/webhooks.types.js";

type EndpointRow = Prisma.Result<Db["webhookEndpoint"], object, "findFirstOrThrow">;
type DeliveryRow = Prisma.Result<Db["webhookDelivery"], object, "findFirstOrThrow">;

function toEndpoint(row: EndpointRow): WebhookEndpoint {
  return { ...row };
}

function toDelivery(row: DeliveryRow): WebhookDelivery {
  return { ...row, status: row.status as DeliveryStatus };
}

/** The only files in this module allowed to touch the Webhook* models. */
export function createPrismaWebhookEndpointRepository(db: Db): WebhookEndpointRepository {
  return {
    async create(data) {
      return toEndpoint(await db.webhookEndpoint.create({ data }));
    },
    async listByUser(userId) {
      const rows = await db.webhookEndpoint.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
      return rows.map(toEndpoint);
    },
    async findOwned(id, userId) {
      const row = await db.webhookEndpoint.findFirst({ where: { id, userId } });
      return row ? toEndpoint(row) : null;
    },
    async findSubscribed(userId, eventType) {
      const rows = await db.webhookEndpoint.findMany({
        where: { userId, active: true, events: { has: eventType } },
      });
      return rows.map(toEndpoint);
    },
    async update(id, userId, data) {
      // updateMany scopes the write to the owner in one statement — an
      // update() keyed on id alone would let another user's id through.
      const result = await db.webhookEndpoint.updateMany({ where: { id, userId }, data });
      if (result.count === 0) return null;
      const row = await db.webhookEndpoint.findFirst({ where: { id, userId } });
      return row ? toEndpoint(row) : null;
    },
    async deleteOwned(id, userId) {
      const result = await db.webhookEndpoint.deleteMany({ where: { id, userId } });
      return result.count === 1;
    },
  };
}

export function createPrismaWebhookDeliveryRepository(db: Db): WebhookDeliveryRepository {
  return {
    async createMany(records) {
      if (records.length === 0) return 0;
      const result = await db.webhookDelivery.createMany({
        data: records.map((record) => ({
          endpointId: record.endpointId,
          userId: record.userId,
          eventType: record.eventType,
          payload: record.payload as Prisma.InputJsonValue,
          status: "pending",
          nextAttemptAt: new Date(),
        })),
      });
      return result.count;
    },
    async list(filter) {
      const rows = await db.webhookDelivery.findMany({
        where: {
          userId: filter.userId,
          ...(filter.endpointId ? { endpointId: filter.endpointId } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: filter.limit,
        ...(filter.cursor ? { skip: 1, cursor: { id: filter.cursor } } : {}),
      });
      return rows.map(toDelivery);
    },
    async findOwned(id, userId) {
      const row = await db.webhookDelivery.findFirst({ where: { id, userId } });
      return row ? toDelivery(row) : null;
    },
    listAttempts(deliveryId) {
      // Chronological, not by attempt number: a replay restarts numbering
      // at 1 (it gets a fresh retry budget), so ordering by `attempt` would
      // interleave the new round with the old one.
      return db.webhookDeliveryAttempt.findMany({
        where: { deliveryId },
        orderBy: [{ createdAt: "asc" }, { attempt: "asc" }],
      });
    },
    async claimDue(claimId, now, limit) {
      // Two statements, but the claim is still exclusive: the updateMany
      // stamps claimId only on rows that were still due at that instant,
      // so a competing dispatcher's identical update matches zero of them.
      const due = await db.webhookDelivery.findMany({
        where: { status: "pending", nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: "asc" },
        take: limit,
        select: { id: true },
      });
      if (due.length === 0) return [];

      const ids = due.map((row) => row.id);
      await db.webhookDelivery.updateMany({
        where: { id: { in: ids }, status: "pending", nextAttemptAt: { lte: now } },
        data: { status: "delivering", claimId, nextAttemptAt: null },
      });

      const claimed = await db.webhookDelivery.findMany({
        where: { id: { in: ids }, claimId, status: "delivering" },
        include: { endpoint: true },
      });
      return claimed.map((row) => {
        const { endpoint, ...delivery } = row;
        return { ...toDelivery(delivery), endpoint: toEndpoint(endpoint) } satisfies DeliveryWithEndpoint;
      });
    },
    async recordAttempt(data) {
      await db.webhookDeliveryAttempt.create({ data });
    },
    async markSucceeded(id, attemptCount, completedAt) {
      await db.webhookDelivery.update({
        where: { id },
        data: { status: "succeeded", attemptCount, completedAt, claimId: null, nextAttemptAt: null, lastError: null },
      });
    },
    async markFailed(id, attemptCount, lastError, completedAt) {
      await db.webhookDelivery.update({
        where: { id },
        data: { status: "failed", attemptCount, completedAt, claimId: null, nextAttemptAt: null, lastError },
      });
    },
    async scheduleRetry(id, attemptCount, nextAttemptAt, lastError) {
      await db.webhookDelivery.update({
        where: { id },
        data: { status: "pending", attemptCount, nextAttemptAt, lastError, claimId: null },
      });
    },
    async requeue(id, userId) {
      const result = await db.webhookDelivery.updateMany({
        where: { id, userId, status: { in: ["succeeded", "failed"] } },
        data: { status: "pending", nextAttemptAt: new Date(), attemptCount: 0, completedAt: null, claimId: null },
      });
      if (result.count === 0) return null;
      const row = await db.webhookDelivery.findFirst({ where: { id, userId } });
      return row ? toDelivery(row) : null;
    },
    async releaseStaleClaims(olderThan) {
      const result = await db.webhookDelivery.updateMany({
        where: { status: "delivering", updatedAt: { lt: olderThan } },
        data: { status: "pending", nextAttemptAt: new Date(), claimId: null },
      });
      return result.count;
    },
  };
}
