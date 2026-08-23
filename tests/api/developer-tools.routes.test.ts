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
let shutdown: (() => Promise<void>) | undefined;

test.before(async () => {
  const app = await buildApp();
  shutdown = app.locals.shutdown as (() => Promise<void>) | undefined;
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await shutdown?.();
  await db.$disconnect();
  redis.disconnect();
});

async function register(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `devtools-${Date.now()}-${Math.random()}@example.com`, password: "correcthorsebattery" }),
  });
  assert.equal(response.status, 201);
  return ((await response.json()) as { data: { tokens: { accessToken: string } } }).data.tokens.accessToken;
}

function headers(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

test("runs every Developer Tools utility through authenticated routes", async () => {
  const token = await register();
  const uuid = await fetch(`${baseUrl}/api/v1/dev-tools/uuid`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({}),
  });
  assert.equal(uuid.status, 200);
  const uuidBody = (await uuid.json()) as { data: { version: string; count: number; values: string[] } };
  assert.equal(uuidBody.data.version, "v4");
  assert.equal(uuidBody.data.count, 1);
  assert.match(uuidBody.data.values[0]!, /^[0-9a-f-]{36}$/i);

  const v7 = await fetch(`${baseUrl}/api/v1/dev-tools/uuid`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ version: "v7", count: 3 }),
  });
  assert.equal(v7.status, 200);
  const v7Body = (await v7.json()) as { data: { values: string[] } };
  assert.equal(v7Body.data.values.length, 3);
  assert.ok(v7Body.data.values.every((value) => value[14] === "7"));

  const hash = await fetch(`${baseUrl}/api/v1/dev-tools/hash`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ value: "hello world", algorithm: "sha384", encoding: "base64" }),
  });
  assert.equal(hash.status, 200);
  assert.equal(
    ((await hash.json()) as { data: { hash: string } }).data.hash,
    "/b2OdaZ/KfcBpOBAOF4uI5hjA+oQI5IRr5B/y7g1eLPkF8txzmRu/QgZ3YwIjeG9",
  );

  const encoded = await fetch(`${baseUrl}/api/v1/dev-tools/base64/encode`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ value: "日本語 🌍" }),
  });
  assert.equal(encoded.status, 200);
  const encodedValue = ((await encoded.json()) as { data: { value: string } }).data.value;
  const decoded = await fetch(`${baseUrl}/api/v1/dev-tools/base64/decode`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ value: encodedValue }),
  });
  assert.equal(decoded.status, 200);
  assert.equal(((await decoded.json()) as { data: { value: string } }).data.value, "日本語 🌍");

  const jwtToken = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ sub: "123", exp: 0 })}.c2ln`;
  const jwt = await fetch(`${baseUrl}/api/v1/dev-tools/jwt/decode`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ token: jwtToken }),
  });
  assert.equal(jwt.status, 200);
  const jwtBody = (await jwt.json()) as { data: { payload: { sub: string }; metadata: { expired: boolean }; valid?: boolean } };
  assert.equal(jwtBody.data.payload.sub, "123");
  assert.equal(jwtBody.data.metadata.expired, true);
  assert.equal("valid" in jwtBody.data, false);
});

test("protects scopes, validates tool inputs, and bounds input sizes", async () => {
  const token = await register();
  const unauthenticated = await fetch(`${baseUrl}/api/v1/dev-tools/hash`, { method: "POST" });
  assert.equal(unauthenticated.status, 401);

  const keyResult = await fetch(`${baseUrl}/api/v1/auth/api-keys`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ name: "without-devtools", scopes: [] }),
  });
  assert.equal(keyResult.status, 201);
  const rawKey = ((await keyResult.json()) as { data: { key: string } }).data.key;
  const forbidden = await fetch(`${baseUrl}/api/v1/dev-tools/hash`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": rawKey },
    body: JSON.stringify({ value: "hello" }),
  });
  assert.equal(forbidden.status, 403);

  const invalidUuid = await fetch(`${baseUrl}/api/v1/dev-tools/uuid`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ version: "v1", count: 101 }),
  });
  assert.equal(invalidUuid.status, 422);

  const invalidBase64 = await fetch(`${baseUrl}/api/v1/dev-tools/base64/decode`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ value: "SGVsbG8" }),
  });
  assert.equal(invalidBase64.status, 400);

  const invalidJwt = await fetch(`${baseUrl}/api/v1/dev-tools/jwt/decode`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ token: "only.two" }),
  });
  assert.equal(invalidJwt.status, 400);

  const oversizedHash = await fetch(`${baseUrl}/api/v1/dev-tools/hash`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ value: "x".repeat(1_048_577) }),
  });
  assert.equal(oversizedHash.status, 413);

  const oversizedJwt = await fetch(`${baseUrl}/api/v1/dev-tools/jwt/decode`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ token: "a".repeat(32 * 1_024 + 1) }),
  });
  assert.equal(oversizedJwt.status, 413);
});

test("OpenAPI documents all Developer Tools routes and JWT decode safety", async () => {
  const response = await fetch(`${baseUrl}/openapi.json`);
  const document = (await response.json()) as {
    paths: Record<string, Record<string, { description?: string; security?: unknown; requestBody?: unknown; responses: Record<string, unknown> }>>;
  };
  for (const path of [
    "/api/v1/dev-tools/uuid",
    "/api/v1/dev-tools/hash",
    "/api/v1/dev-tools/base64/encode",
    "/api/v1/dev-tools/base64/decode",
    "/api/v1/dev-tools/jwt/decode",
  ]) {
    const operation = document.paths[path]?.post;
    assert.ok(operation, `Expected OpenAPI operation for ${path}`);
    assert.ok(operation.requestBody);
    assert.ok(operation.responses["200"]);
    assert.ok(operation.security);
  }
  assert.match(document.paths["/api/v1/dev-tools/jwt/decode"]!.post!.description ?? "", /does not verify/i);
});
