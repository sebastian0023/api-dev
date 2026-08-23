import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import test from "node:test";
import { buildApp } from "../../src/core/app.js";
import { db } from "../../src/core/db.js";
import { redis } from "../../src/core/redis.js";
import { verifySignature } from "../../src/modules/webhooks/infrastructure/hmacPayloadSigner.js";

let server: Server;
let baseUrl = "";
let shutdown: (() => Promise<void>) | undefined;
const createdUserIds: string[] = [];

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
  await db.webhookEndpoint.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.$disconnect();
  redis.disconnect();
});

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

/** A throwaway subscriber. `status` can change between requests. */
function receiver(initialStatus = 200) {
  const received: Received[] = [];
  let status = initialStatus;
  const httpServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.writeHead(status, { "content-type": "text/plain" });
      res.end(status >= 400 ? "nope" : "ok");
    });
  });

  return {
    received,
    setStatus(next: number) {
      status = next;
    },
    async listen(): Promise<string> {
      httpServer.listen(0, "127.0.0.1");
      await once(httpServer, "listening");
      const address = httpServer.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
      return `http://127.0.0.1:${address.port}/hook`;
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

async function register(): Promise<{ token: string; userId: string }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `webhooks-${Date.now()}-${Math.random()}@example.com`,
      password: "correcthorsebattery",
    }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { user: { id: string }; tokens: { accessToken: string } } };
  createdUserIds.push(body.data.user.id);
  return { token: body.data.tokens.accessToken, userId: body.data.user.id };
}

function headers(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function createEndpoint(token: string, url: string, events: string[] = ["webhook.ping"]) {
  const response = await fetch(`${baseUrl}/api/v1/webhooks/endpoints`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ url, events, description: "test subscriber" }),
  });
  assert.equal(response.status, 201);
  return ((await response.json()) as { data: { id: string; secret: string } }).data;
}

async function getDelivery(token: string, id: string) {
  const response = await fetch(`${baseUrl}/api/v1/webhooks/deliveries/${id}`, { headers: headers(token) });
  assert.equal(response.status, 200);
  return ((await response.json()) as {
    data: {
      id: string;
      status: string;
      attemptCount: number;
      lastError: string | null;
      attempts: Array<{ attempt: number; statusCode: number | null; errorMessage: string | null }>;
    };
  }).data;
}

async function listDeliveries(token: string, query = "") {
  const response = await fetch(`${baseUrl}/api/v1/webhooks/deliveries${query}`, { headers: headers(token) });
  assert.equal(response.status, 200);
  return ((await response.json()) as { data: Array<{ id: string; eventType: string; status: string }> }).data;
}

/**
 * Polls until `predicate` holds — the dispatcher settles deliveries
 * asynchronously. The interval is deliberately slower than the dispatcher's:
 * these reads are billed against the caller's real `webhooks-read` budget,
 * and a tight loop would earn a 429 rather than an answer.
 */
async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 20_000;
  let last: T = await read();
  while (Date.now() < deadline) {
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 400));
    last = await read();
  }
  throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(last)}`);
}

test("test-fires a signed delivery that a real subscriber receives and verifies", async () => {
  const { token } = await register();
  const subscriber = receiver();
  const url = await subscriber.listen();

  try {
    const endpoint = await createEndpoint(token, url);
    assert.match(endpoint.secret, /^whsec_/);

    const fired = await fetch(`${baseUrl}/api/v1/webhooks/endpoints/${endpoint.id}/test`, {
      method: "POST",
      headers: headers(token),
    });
    assert.equal(fired.status, 202);
    const firedBody = (await fired.json()) as { data: { queued: number; eventType: string } };
    assert.deepEqual(firedBody.data, { queued: 1, eventType: "webhook.ping" });

    const deliveries = await waitFor(
      () => listDeliveries(token),
      (rows) => rows.length > 0 && rows[0]!.status === "succeeded",
      "the ping delivery to succeed",
    );
    assert.equal(deliveries[0]!.eventType, "webhook.ping");

    const detail = await getDelivery(token, deliveries[0]!.id);
    assert.equal(detail.attemptCount, 1);
    assert.equal(detail.attempts.length, 1);
    assert.equal(detail.attempts[0]!.statusCode, 200);

    // What the subscriber actually got over the wire.
    assert.equal(subscriber.received.length, 1);
    const request = subscriber.received[0]!;
    assert.equal(request.headers["x-webhook-event"], "webhook.ping");
    assert.equal(request.headers["x-webhook-id"], detail.id);
    assert.equal(request.headers["x-webhook-attempt"], "1");
    assert.equal(request.headers["content-type"], "application/json");

    const signature = request.headers["x-webhook-signature"];
    assert.ok(typeof signature === "string" && signature.startsWith("t="), "expected a signature header");
    const endpointSecret = (await db.webhookEndpoint.findFirstOrThrow({ where: { url } })).secret;
    assert.equal(verifySignature({ header: signature, body: request.body, secret: endpointSecret }), true);
    assert.equal(
      verifySignature({ header: signature, body: request.body, secret: "whsec_wrong" }),
      false,
      "a wrong secret must not verify",
    );

    const payload = JSON.parse(request.body) as { id: string; type: string; data: { endpointId: string } };
    assert.equal(payload.type, "webhook.ping");
    assert.equal(payload.id, detail.id);
    assert.equal(payload.data.endpointId, endpoint.id);
  } finally {
    await subscriber.close();
  }
});

test("retries a failing subscriber, settles as failed, and replays on demand", async () => {
  const { token } = await register();
  const subscriber = receiver(500);
  const url = await subscriber.listen();

  try {
    const endpoint = await createEndpoint(token, url);
    await fetch(`${baseUrl}/api/v1/webhooks/endpoints/${endpoint.id}/test`, {
      method: "POST",
      headers: headers(token),
    });

    const queued = await waitFor(
      () => listDeliveries(token),
      (rows) => rows.length > 0,
      "the delivery row to appear",
    );
    const deliveryId = queued[0]!.id;

    // WEBHOOKS_BACKOFF_BASE_SECONDS is 1s under test, so the 5-attempt
    // budget burns down in a few seconds.
    const failed = await waitFor(
      () => getDelivery(token, deliveryId),
      (row) => row.status === "failed",
      "the delivery to exhaust its retries",
    );
    assert.ok(failed.attemptCount > 1, `expected more than one attempt, got ${failed.attemptCount}`);
    assert.equal(failed.attempts.length, failed.attemptCount);
    assert.equal(failed.attempts[0]!.statusCode, 500);
    assert.match(failed.lastError ?? "", /500/);
    assert.ok(subscriber.received.length >= 2, "the subscriber should have been retried");

    // Recover the endpoint and replay the settled delivery.
    subscriber.setStatus(200);
    const replay = await fetch(`${baseUrl}/api/v1/webhooks/deliveries/${deliveryId}/replay`, {
      method: "POST",
      headers: headers(token),
    });
    assert.equal(replay.status, 202);

    const replayed = await waitFor(
      () => getDelivery(token, deliveryId),
      (row) => row.status === "succeeded",
      "the replayed delivery to succeed",
    );
    // The replay gets a fresh retry budget, so its attempt numbering
    // restarts — the trail is chronological, and the newest entry is the
    // successful re-send.
    assert.equal(replayed.attemptCount, 1);
    assert.equal(replayed.attempts.at(-1)!.statusCode, 200);
    assert.ok(
      replayed.attempts.length > failed.attempts.length,
      "the earlier failed attempts must survive the replay",
    );

    // Replaying something already queued is a conflict, not a duplicate send.
    const secondReplay = await fetch(`${baseUrl}/api/v1/webhooks/deliveries/${deliveryId}/replay`, {
      method: "POST",
      headers: headers(token),
    });
    assert.equal(secondReplay.status, 202);
  } finally {
    await subscriber.close();
  }
});

test("fans out an event emitted by another module", async () => {
  const { token } = await register();
  const subscriber = receiver();
  const url = await subscriber.listen();

  try {
    await createEndpoint(token, url, ["qr.code.created"]);

    // The qr module emits qr.code.created and knows nothing about webhooks.
    const qr = await fetch(`${baseUrl}/api/v1/qr`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ payload: "https://example.com", format: "png", mode: "static" }),
    });
    assert.equal(qr.status, 201);
    const qrId = ((await qr.json()) as { data: { id: string } }).data.id;

    const deliveries = await waitFor(
      () => listDeliveries(token, "?status=succeeded"),
      (rows) => rows.length > 0,
      "a qr.code.created delivery",
    );
    assert.equal(deliveries[0]!.eventType, "qr.code.created");

    const payload = JSON.parse(subscriber.received[0]!.body) as { type: string; data: { qrCodeId: string } };
    assert.equal(payload.type, "qr.code.created");
    assert.equal(payload.data.qrCodeId, qrId);
  } finally {
    await subscriber.close();
  }
});

test("scopes CRUD to the owner and validates registration input", async () => {
  const { token } = await register();
  const { token: otherToken } = await register();

  const unauthenticated = await fetch(`${baseUrl}/api/v1/webhooks/endpoints`, { method: "GET" });
  assert.equal(unauthenticated.status, 401);

  const unknownEvent = await fetch(`${baseUrl}/api/v1/webhooks/endpoints`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ url: "https://subscriber.test/hook", events: ["qr.code.exploded"] }),
  });
  assert.equal(unknownEvent.status, 422);
  assert.equal(
    ((await unknownEvent.json()) as { error: { code: string } }).error.code,
    "WEBHOOKS_UNKNOWN_EVENT",
  );

  const malformed = await fetch(`${baseUrl}/api/v1/webhooks/endpoints`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ url: "not-a-url", events: ["webhook.ping"] }),
  });
  assert.equal(malformed.status, 422);

  const noEvents = await fetch(`${baseUrl}/api/v1/webhooks/endpoints`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ url: "https://subscriber.test/hook", events: [] }),
  });
  assert.equal(noEvents.status, 422);

  const endpoint = await createEndpoint(token, "http://127.0.0.1:9/unused");

  // The secret is returned once and never again.
  const fetched = await fetch(`${baseUrl}/api/v1/webhooks/endpoints/${endpoint.id}`, { headers: headers(token) });
  assert.equal(fetched.status, 200);
  const fetchedBody = (await fetched.json()) as { data: Record<string, unknown> };
  assert.equal("secret" in fetchedBody.data, false);

  const patched = await fetch(`${baseUrl}/api/v1/webhooks/endpoints/${endpoint.id}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ active: false, events: ["webhook.ping", "auth.apikey.created"] }),
  });
  assert.equal(patched.status, 200);
  const patchedBody = (await patched.json()) as { data: { active: boolean; events: string[] } };
  assert.equal(patchedBody.data.active, false);
  assert.deepEqual(patchedBody.data.events.sort(), ["auth.apikey.created", "webhook.ping"]);

  const emptyPatch = await fetch(`${baseUrl}/api/v1/webhooks/endpoints/${endpoint.id}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({}),
  });
  assert.equal(emptyPatch.status, 422);

  // Another user's endpoint is invisible, not merely forbidden.
  for (const [method, path] of [
    ["GET", `/api/v1/webhooks/endpoints/${endpoint.id}`],
    ["DELETE", `/api/v1/webhooks/endpoints/${endpoint.id}`],
    ["POST", `/api/v1/webhooks/endpoints/${endpoint.id}/test`],
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`, { method, headers: headers(otherToken) });
    assert.equal(response.status, 404, `${method} ${path} should be 404 for a different user`);
  }
  assert.deepEqual(
    ((await (await fetch(`${baseUrl}/api/v1/webhooks/endpoints`, { headers: headers(otherToken) })).json()) as {
      data: unknown[];
    }).data,
    [],
  );

  const removed = await fetch(`${baseUrl}/api/v1/webhooks/endpoints/${endpoint.id}`, {
    method: "DELETE",
    headers: headers(token),
  });
  assert.equal(removed.status, 200);
});

test("enforces API-key scopes and lists the event catalog", async () => {
  const { token } = await register();

  const keyResponse = await fetch(`${baseUrl}/api/v1/auth/api-keys`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ name: "read-only", scopes: ["webhooks:read"] }),
  });
  assert.equal(keyResponse.status, 201);
  const rawKey = ((await keyResponse.json()) as { data: { key: string } }).data.key;

  const readable = await fetch(`${baseUrl}/api/v1/webhooks/events`, { headers: { "x-api-key": rawKey } });
  assert.equal(readable.status, 200);
  const events = ((await readable.json()) as { data: Array<{ name: string; description: string }> }).data;
  assert.ok(events.some((event) => event.name === "webhook.ping"));
  assert.ok(events.some((event) => event.name === "qr.code.created"));

  const writeAttempt = await fetch(`${baseUrl}/api/v1/webhooks/endpoints`, {
    method: "POST",
    headers: { "x-api-key": rawKey, "content-type": "application/json" },
    body: JSON.stringify({ url: "https://subscriber.test/hook", events: ["webhook.ping"] }),
  });
  assert.equal(writeAttempt.status, 403);
  assert.match(((await writeAttempt.json()) as { error: { message: string } }).error.message, /webhooks:write/);
});

test("OpenAPI documents every webhooks route with auth and the secret caveat", async () => {
  const response = await fetch(`${baseUrl}/openapi.json`);
  const document = (await response.json()) as {
    paths: Record<string, Record<string, { description?: string; security?: unknown; responses: Record<string, unknown> }>>;
  };

  const expected: Array<[string, string]> = [
    ["/api/v1/webhooks/events", "get"],
    ["/api/v1/webhooks/endpoints", "post"],
    ["/api/v1/webhooks/endpoints", "get"],
    ["/api/v1/webhooks/endpoints/{id}", "get"],
    ["/api/v1/webhooks/endpoints/{id}", "patch"],
    ["/api/v1/webhooks/endpoints/{id}", "delete"],
    ["/api/v1/webhooks/endpoints/{id}/test", "post"],
    ["/api/v1/webhooks/deliveries", "get"],
    ["/api/v1/webhooks/deliveries/{id}", "get"],
    ["/api/v1/webhooks/deliveries/{id}/replay", "post"],
  ];
  for (const [path, method] of expected) {
    const operation = document.paths[path]?.[method];
    assert.ok(operation, `Expected OpenAPI operation for ${method.toUpperCase()} ${path}`);
    assert.ok(operation.security, `${method.toUpperCase()} ${path} should document auth`);
  }
  assert.match(document.paths["/api/v1/webhooks/endpoints"]!.post!.description ?? "", /once/i);
});
