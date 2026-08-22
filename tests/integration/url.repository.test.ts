import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../src/core/db.js";
import { createPrismaShortUrlRepository } from "../../src/modules/url/url.prismaShortUrlRepository.js";
import { ShortCodeCollisionError } from "../../src/modules/url/url.errors.js";

const repository = createPrismaShortUrlRepository(db);
const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const userId = `url-repository-${suffix}`;

test.after(async () => {
  await db.urlShortUrl.deleteMany({ where: { userId } });
  await db.$disconnect();
});

test("Prisma repository persists, scopes, atomically increments, and deletes URLs", async () => {
  const created = await repository.create({
    shortCode: `R${suffix}`.slice(0, 32),
    originalUrl: "https://example.com/repository",
    userId,
    createdAt: new Date("2026-08-21T12:00:00.000Z"),
    expiresAt: new Date("2026-08-22T12:00:00.000Z"),
  });
  assert.equal(await repository.existsByCode(created.shortCode), true);
  await assert.rejects(
    () =>
      repository.create({
        shortCode: created.shortCode,
        originalUrl: "https://example.com/duplicate",
        userId,
        createdAt: new Date("2026-08-21T12:00:00.000Z"),
        expiresAt: null,
      }),
    ShortCodeCollisionError,
  );
  assert.equal((await repository.findByCode(created.shortCode))?.expiresAt?.toISOString(), "2026-08-22T12:00:00.000Z");
  assert.equal(await repository.findOwnedByCode(created.shortCode, "other-user"), null);

  await Promise.all(Array.from({ length: 10 }, () => repository.incrementClickCount(created.shortCode)));
  assert.equal((await repository.findByCode(created.shortCode))?.clickCount, 10);
  assert.equal(await repository.deleteOwnedByCode(created.shortCode, "other-user"), false);
  assert.equal(await repository.deleteOwnedByCode(created.shortCode, userId), true);
});
