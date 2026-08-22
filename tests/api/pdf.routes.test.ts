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
    body: JSON.stringify({ email: `pdf-api-${Date.now()}-${Math.random()}@example.com`, password: "correcthorsebattery" }),
  });
  assert.equal(response.status, 201);
  return ((await response.json()) as { data: { tokens: { accessToken: string } } }).data.tokens.accessToken;
}

function headers(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("renders authenticated HTML as raw PDF bytes and documents the binary media type", async () => {
  const token = await register();
  const response = await fetch(`${baseUrl}/api/v1/pdf/html`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ html: "<html><body><h1>PDF API Test</h1></body></html>" }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/pdf/);
  assert.equal(response.headers.get("content-disposition"), 'inline; filename="document.pdf"');
  assert.ok(Buffer.from(await response.arrayBuffer()).subarray(0, 5).equals(Buffer.from("%PDF-")));

  const unauthenticated = await fetch(`${baseUrl}/api/v1/pdf/html`, { method: "POST" });
  assert.equal(unauthenticated.status, 401);

  const invalidOptions = await fetch(`${baseUrl}/api/v1/pdf/html`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ html: "<p>ok</p>", options: { format: "Tabloid" } }),
  });
  assert.equal(invalidOptions.status, 422);

  const malformedUrl = await fetch(`${baseUrl}/api/v1/pdf/url`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ url: "not a url" }),
  });
  assert.equal(malformedUrl.status, 400);

  const blockedUrl = await fetch(`${baseUrl}/api/v1/pdf/url`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ url: "http://127.0.0.1" }),
  });
  assert.equal(blockedUrl.status, 403);

  const document = (await (await fetch(`${baseUrl}/openapi.json`)).json()) as {
    paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, unknown> }> }>>;
  };
  assert.ok(document.paths["/api/v1/pdf/html"]?.post?.responses["200"]?.content?.["application/pdf"]);
  assert.ok(document.paths["/api/v1/pdf/url"]?.post?.responses["200"]?.content?.["application/pdf"]);
});
