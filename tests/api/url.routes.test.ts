import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import test from "node:test";
import { buildApp } from "../../src/core/app.js";
import { db } from "../../src/core/db.js";
import { redis } from "../../src/core/redis.js";

let server: Server;
let baseUrl = "";

test.before(async () => {
  const app = await buildApp();
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await db.$disconnect();
  redis.disconnect();
});

async function register(): Promise<string> {
  const email = `url-api-${Date.now()}-${Math.random()}@example.com`;
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "correcthorsebattery" }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return body.data.tokens.accessToken;
}

function authorization(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("create, retrieve, redirect, and delete URL resources", async () => {
  const token = await register();
  const create = await fetch(`${baseUrl}/api/v1/urls`, {
    method: "POST",
    headers: authorization(token),
    body: JSON.stringify({ url: "https://example.com/long/path" }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()) as { data: { shortCode: string; shortUrl: string; clickCount: number } };
  assert.match(created.data.shortUrl, /\/api\/v1\/urls\/[0-9A-Za-z]+\/redirect$/);
  assert.equal(created.data.clickCount, 0);

  const metadata = await fetch(`${baseUrl}/api/v1/urls/${created.data.shortCode}`, { headers: authorization(token) });
  assert.equal(metadata.status, 200);

  const redirect = await fetch(`${baseUrl}/api/v1/urls/${created.data.shortCode}/redirect`, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "https://example.com/long/path");

  const counted = await fetch(`${baseUrl}/api/v1/urls/${created.data.shortCode}`, { headers: authorization(token) });
  assert.equal(((await counted.json()) as { data: { clickCount: number } }).data.clickCount, 1);

  const deleted = await fetch(`${baseUrl}/api/v1/urls/${created.data.shortCode}`, {
    method: "DELETE",
    headers: authorization(token),
  });
  assert.equal(deleted.status, 204);
});

test("validates inputs and protects ownership", async () => {
  const first = await register();
  const second = await register();
  const malformed = await fetch(`${baseUrl}/api/v1/urls`, {
    method: "POST",
    headers: authorization(first),
    body: JSON.stringify({ url: "javascript:alert(1)" }),
  });
  assert.equal(malformed.status, 422);
  const invalid = await fetch(`${baseUrl}/api/v1/urls`, {
    method: "POST",
    headers: authorization(first),
    body: JSON.stringify({ url: "not-a-url" }),
  });
  assert.equal(invalid.status, 422);
  const past = await fetch(`${baseUrl}/api/v1/urls`, {
    method: "POST",
    headers: authorization(first),
    body: JSON.stringify({ url: "https://example.com", expiresAt: "2000-01-01T00:00:00.000Z" }),
  });
  assert.equal(past.status, 422);

  const create = await fetch(`${baseUrl}/api/v1/urls`, {
    method: "POST",
    headers: authorization(first),
    body: JSON.stringify({ url: "https://example.com/private" }),
  });
  const body = (await create.json()) as { data: { shortCode: string } };
  const otherGet = await fetch(`${baseUrl}/api/v1/urls/${body.data.shortCode}`, { headers: authorization(second) });
  assert.equal(otherGet.status, 404);
  const otherDelete = await fetch(`${baseUrl}/api/v1/urls/${body.data.shortCode}`, {
    method: "DELETE",
    headers: authorization(second),
  });
  assert.equal(otherDelete.status, 404);
  const unauthenticated = await fetch(`${baseUrl}/api/v1/urls/${body.data.shortCode}`);
  assert.equal(unauthenticated.status, 401);
  const unknownGet = await fetch(`${baseUrl}/api/v1/urls/UNKNOWN`, { headers: authorization(first) });
  assert.equal(unknownGet.status, 404);
  const unknownDelete = await fetch(`${baseUrl}/api/v1/urls/UNKNOWN`, {
    method: "DELETE",
    headers: authorization(first),
  });
  assert.equal(unknownDelete.status, 404);
});

test("redirects missing codes as 404 and expired codes as 410 without counting", async () => {
  const missing = await fetch(`${baseUrl}/api/v1/urls/UNKNOWN/redirect`, { redirect: "manual" });
  assert.equal(missing.status, 404);

  const code = `E${Date.now()}`;
  const userId = `expired-${Date.now()}`;
  await db.urlShortUrl.create({
    data: { shortCode: code, originalUrl: "https://example.com/expired", userId, expiresAt: new Date(0) },
  });
  const expired = await fetch(`${baseUrl}/api/v1/urls/${code}/redirect`, { redirect: "manual" });
  assert.equal(expired.status, 410);
  assert.equal((await db.urlShortUrl.findUnique({ where: { shortCode: code } }))?.clickCount, 0);
  await db.urlShortUrl.deleteMany({ where: { userId } });
});

test("OpenAPI documents URL routes and bodyless redirect/delete responses", async () => {
  const response = await fetch(`${baseUrl}/openapi.json`);
  const document = (await response.json()) as { paths: Record<string, Record<string, { responses: Record<string, { content?: unknown }> }>> };
  assert.ok(document.paths["/api/v1/urls"]?.post);
  assert.ok(document.paths["/api/v1/urls/{shortCode}"]?.get);
  const managed = document.paths["/api/v1/urls/{shortCode}"];
  const redirect = document.paths["/api/v1/urls/{shortCode}/redirect"];
  assert.ok(managed?.delete);
  assert.ok(redirect?.get);
  assert.equal(managed.delete.responses["204"]?.content, undefined);
  assert.equal(redirect.get.responses["302"]?.content, undefined);
});
