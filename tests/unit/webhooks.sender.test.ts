import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { DestinationPolicy } from "../../src/shared/net/destinationPolicy.js";
import { FetchWebhookSender } from "../../src/modules/webhooks/infrastructure/fetchWebhookSender.js";
import { HmacPayloadSigner, verifySignature } from "../../src/modules/webhooks/infrastructure/hmacPayloadSigner.js";
import { webhookDestinationErrors } from "../../src/modules/webhooks/infrastructure/webhookDestinationErrors.js";
import type { SendInput } from "../../src/modules/webhooks/domain/webhookSender.js";

const payload = {
  id: "d-1",
  type: "webhook.ping",
  createdAt: "2026-08-23T12:00:00.000Z",
  data: { message: "hi" },
};

function sender(options: { allowPrivate?: boolean; timeoutMs?: number; maxResponseBytes?: number } = {}) {
  return new FetchWebhookSender({
    destinationPolicy: new DestinationPolicy(async () => [{ address: "127.0.0.1", family: 4 }], {
      errors: webhookDestinationErrors,
      allowPrivate: options.allowPrivate ?? true,
    }),
    signer: new HmacPayloadSigner(),
    timeoutMs: options.timeoutMs ?? 2_000,
    maxResponseBytes: options.maxResponseBytes ?? 2_048,
  });
}

function input(url: string): SendInput {
  return { url, secret: "whsec_secret", attempt: 1, deliveryId: "d-1", payload };
}

async function withServer(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
  try {
    await run(`http://127.0.0.1:${address.port}/hook`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("posts a signed, self-describing request a subscriber can verify", async () => {
  await withServer(
    (req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const signature = req.headers["x-webhook-signature"];
        const verified =
          typeof signature === "string" && verifySignature({ header: signature, body, secret: "whsec_secret" });
        res.writeHead(verified ? 200 : 400, { "content-type": "text/plain" });
        res.end(verified ? "verified" : "bad signature");
      });
    },
    async (url) => {
      const result = await sender().send(input(url));
      assert.equal(result.ok, true, `expected the receiver to verify the signature, got ${result.responseBody}`);
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody, "verified");
      assert.equal(result.terminal, false);
    },
  );
});

test("reports a non-2xx as retryable and keeps the response for the log", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("overloaded");
    },
    async (url) => {
      const result = await sender().send(input(url));
      assert.equal(result.ok, false);
      assert.equal(result.statusCode, 503);
      assert.equal(result.responseBody, "overloaded");
      assert.equal(result.terminal, false);
      assert.match(result.errorMessage ?? "", /503/);
    },
  );
});

test("truncates a chatty response body to the configured cap", async () => {
  await withServer(
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("x".repeat(5_000));
    },
    async (url) => {
      const result = await sender({ maxResponseBytes: 64 }).send(input(url));
      assert.equal(result.responseBody?.length, 64);
    },
  );
});

test("does not follow a redirect, since the new location was never validated", async () => {
  let hookCalls = 0;
  await withServer(
    (req, res) => {
      if (req.url === "/hook") {
        hookCalls += 1;
        res.writeHead(302, { location: "/elsewhere" });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end("followed");
    },
    async (url) => {
      const result = await sender().send(input(url));
      assert.equal(hookCalls, 1);
      assert.equal(result.statusCode, 302);
      assert.equal(result.ok, false, "a redirect is not a successful delivery");
    },
  );
});

test("a blocked destination fails terminally without any HTTP request", async () => {
  const blocking = new FetchWebhookSender({
    destinationPolicy: new DestinationPolicy(async () => [{ address: "127.0.0.1", family: 4 }], {
      errors: webhookDestinationErrors,
      allowPrivate: false,
    }),
    signer: new HmacPayloadSigner(),
    timeoutMs: 2_000,
    maxResponseBytes: 2_048,
  });

  const result = await blocking.send(input("https://subscriber.test/hook"));
  assert.equal(result.ok, false);
  assert.equal(result.terminal, true);
  assert.equal(result.statusCode, null);
  assert.match(result.errorMessage ?? "", /blocked destination/i);
});

test("surfaces the underlying transport failure rather than a bare 'fetch failed'", async () => {
  // Bind a port, then release it, so the connection is guaranteed refused.
  let closedPort = 0;
  await withServer(
    (_req, res) => res.end("ok"),
    async (url) => {
      closedPort = Number(new URL(url).port);
    },
  );

  const result = await sender().send(input(`http://127.0.0.1:${closedPort}/hook`));
  assert.equal(result.ok, false);
  assert.equal(result.terminal, false);
  // undici would otherwise report only "fetch failed", which tells a
  // subscriber nothing about why their endpoint was unreachable.
  assert.match(result.errorMessage ?? "", /ECONNREFUSED|refused/i);
});

test("a slow endpoint is abandoned at the configured timeout", async () => {
  await withServer(
    () => {
      // Never responds.
    },
    async (url) => {
      const result = await sender({ timeoutMs: 300 }).send(input(url));
      assert.equal(result.ok, false);
      assert.equal(result.terminal, false);
      assert.match(result.errorMessage ?? "", /timed out after 300ms/);
    },
  );
});
