import assert from "node:assert/strict";
import test from "node:test";
import { Base62ShortCodeGenerator, BASE62_ALPHABET } from "../../src/modules/url/url.base62ShortCodeGenerator.js";
import { createUrlService } from "../../src/modules/url/url.service.js";
import type { ShortUrl } from "../../src/modules/url/url.domain.js";
import type { ShortUrlRepository } from "../../src/modules/url/url.repository.js";
import {
  InvalidExpirationError,
  InvalidShortUrlError,
  ShortCodeCollisionError,
  ShortCodeGenerationError,
  ShortUrlExpiredError,
  ShortUrlNotFoundError,
} from "../../src/modules/url/url.errors.js";

const NOW = new Date("2026-08-21T12:00:00.000Z");

function record(overrides: Partial<ShortUrl> = {}): ShortUrl {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    shortCode: "AAAAAAA",
    originalUrl: "https://example.com",
    userId: "user-1",
    clickCount: 0,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: null,
    ...overrides,
  };
}

function createFakeRepository(rows: ShortUrl[] = []): ShortUrlRepository {
  const values = new Map(rows.map((row) => [row.shortCode, row]));
  return {
    async create(data) {
      if (values.has(data.shortCode)) throw new ShortCodeCollisionError();
      const value = record({ ...data, id: `id-${data.shortCode}`, updatedAt: data.createdAt });
      values.set(value.shortCode, value);
      return value;
    },
    async existsByCode(shortCode) {
      return values.has(shortCode);
    },
    async findByCode(shortCode) {
      return values.get(shortCode) ?? null;
    },
    async findOwnedByCode(shortCode, userId) {
      const value = values.get(shortCode);
      return value?.userId === userId ? value : null;
    },
    async deleteOwnedByCode(shortCode, userId) {
      const value = values.get(shortCode);
      if (!value || value.userId !== userId) return false;
      values.delete(shortCode);
      return true;
    },
    async incrementClickCount(shortCode) {
      const value = values.get(shortCode);
      if (!value) throw new ShortUrlNotFoundError();
      const next = { ...value, clickCount: value.clickCount + 1, updatedAt: NOW };
      values.set(shortCode, next);
      return next;
    },
  };
}

function generator(...values: string[]) {
  let position = 0;
  return { generate: () => values[position++] ?? "ZZZZZZZ" };
}

function service(repo: ShortUrlRepository, values: string[] = ["AAAAAAA"]) {
  return createUrlService({ repo, generator: generator(...values), now: () => NOW });
}

test("Base62 strategy returns a non-empty configured-length Base62 code", () => {
  const value = new Base62ShortCodeGenerator(12).generate();
  assert.equal(value.length, 12);
  assert.match(value, new RegExp(`^[${BASE62_ALPHABET}]+$`));
});

test("creates HTTP and HTTPS short URLs with an optional expiration", async () => {
  const repo = createFakeRepository();
  const urlService = service(repo, ["AAAAAAA", "BBBBBBB"]);
  const http = await urlService.create("user-1", { url: "http://example.com" });
  const https = await urlService.create("user-1", {
    url: "https://example.com/path",
    expiresAt: new Date("2026-08-22T12:00:00.000Z"),
  });
  assert.equal(http.shortCode, "AAAAAAA");
  assert.equal(https.expiresAt?.toISOString(), "2026-08-22T12:00:00.000Z");
});

test("rejects malformed URLs, unsupported protocols, and expired inputs", async () => {
  const urlService = service(createFakeRepository());
  await assert.rejects(() => urlService.create("user-1", { url: "not a url" }), InvalidShortUrlError);
  await assert.rejects(() => urlService.create("user-1", { url: "ftp://example.com" }), InvalidShortUrlError);
  await assert.rejects(
    () => urlService.create("user-1", { url: "https://example.com", expiresAt: NOW }),
    InvalidExpirationError,
  );
});

test("retries deterministic short-code collisions and stops after five attempts", async () => {
  const occupied = record({ shortCode: "AAAAAAA" });
  const result = await service(createFakeRepository([occupied]), ["AAAAAAA", "AAAAAAA", "BBBBBBB"]).create("user-1", {
    url: "https://example.com",
  });
  assert.equal(result.shortCode, "BBBBBBB");

  await assert.rejects(
    () => service(createFakeRepository([occupied]), Array(5).fill("AAAAAAA")).create("user-1", { url: "https://example.com" }),
    ShortCodeGenerationError,
  );
});

test("returns and deletes only URLs owned by the requesting user", async () => {
  const repo = createFakeRepository([record()]);
  const urlService = service(repo);
  assert.equal((await urlService.getForUser("user-1", "AAAAAAA")).id, record().id);
  await assert.rejects(() => urlService.getForUser("user-2", "AAAAAAA"), ShortUrlNotFoundError);
  await assert.rejects(() => urlService.deleteForUser("user-2", "AAAAAAA"), ShortUrlNotFoundError);
  await urlService.deleteForUser("user-1", "AAAAAAA");
  await assert.rejects(() => urlService.getForUser("user-1", "AAAAAAA"), ShortUrlNotFoundError);
});

test("resolves active URLs once, but never increments missing, inactive, or expired URLs", async () => {
  const repo = createFakeRepository([record(), record({ shortCode: "INACTIVE", active: false }), record({ shortCode: "EXPIRED1", expiresAt: NOW })]);
  const urlService = service(repo);
  assert.equal((await urlService.resolve("AAAAAAA")).clickCount, 1);
  await assert.rejects(() => urlService.resolve("MISSING"), ShortUrlNotFoundError);
  await assert.rejects(() => urlService.resolve("INACTIVE"), ShortUrlNotFoundError);
  await assert.rejects(() => urlService.resolve("EXPIRED1"), ShortUrlExpiredError);
});
