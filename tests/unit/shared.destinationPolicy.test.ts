import assert from "node:assert/strict";
import test from "node:test";
import {
  BlockedDestinationError,
  DestinationPolicy,
  InvalidDestinationUrlError,
  UnresolvableDestinationError,
} from "../../src/shared/net/destinationPolicy.js";
import { PdfBlockedDestinationError, PdfInvalidUrlError, PdfRenderError } from "../../src/modules/pdf/domain/pdf.errors.js";
import { pdfDestinationErrors } from "../../src/modules/pdf/infrastructure/pdfDestinationErrors.js";

function resolver(addresses: string[]) {
  return async () => addresses.map((address) => ({ address, family: address.includes(":") ? (6 as const) : (4 as const) }));
}

function policy(addresses: string[]) {
  return new DestinationPolicy(resolver(addresses));
}

test("accepts public HTTP(S) destinations and rejects malformed or unsupported URLs", async () => {
  const destinationPolicy = policy(["8.8.8.8"]);
  await destinationPolicy.assertAllowed("https://example.test/path");
  await destinationPolicy.assertAllowed("http://example.test/path");
  assert.throws(() => destinationPolicy.parseAndValidate("not a URL"), InvalidDestinationUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("file:///etc/passwd"), InvalidDestinationUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("javascript:alert(1)"), InvalidDestinationUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("ftp://example.test"), InvalidDestinationUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("https://user:pass@example.test"), InvalidDestinationUrlError);
});

test("blocks loopback, private, link-local, metadata, reserved, and mixed DNS answers", async () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ]) {
    await assert.rejects(() => policy([address]).assertAllowed("https://example.test"), BlockedDestinationError);
  }
  await assert.rejects(() => policy(["8.8.8.8", "10.0.0.1"]).assertAllowed("https://example.test"), BlockedDestinationError);
  await assert.rejects(() => policy(["8.8.8.8"]).assertAllowed("https://localhost"), BlockedDestinationError);
  await assert.rejects(() => policy(["8.8.8.8"]).assertAllowed("https://app.localhost"), BlockedDestinationError);
  await assert.rejects(() => policy(["8.8.8.8"]).assertAllowed("https://metadata.google.internal"), BlockedDestinationError);
  await assert.rejects(() => policy([]).assertAllowed("https://example.test"), BlockedDestinationError);
});

test("reports an unresolvable hostname distinctly from a blocked one", async () => {
  const failing = new DestinationPolicy(async () => {
    throw new Error("ENOTFOUND");
  });
  await assert.rejects(() => failing.assertAllowed("https://example.test"), UnresolvableDestinationError);
});

test("allowPrivate skips address checks but still enforces protocol and credential rules", async () => {
  const local = new DestinationPolicy(resolver(["127.0.0.1"]), { allowPrivate: true });
  await local.assertAllowed("http://127.0.0.1:4000/hook");
  await local.assertAllowed("http://localhost:4000/hook");
  await local.assertAllowed("http://receiver.internal/hook");
  assert.throws(() => local.parseAndValidate("ftp://127.0.0.1"), InvalidDestinationUrlError);
  await assert.rejects(() => local.assertAllowed("https://user:pass@127.0.0.1"), InvalidDestinationUrlError);
});

test("an injected error factory maps failures onto the caller's own vocabulary", async () => {
  const pdfPolicy = new DestinationPolicy(resolver(["10.0.0.1"]), { errors: pdfDestinationErrors });
  assert.throws(() => pdfPolicy.parseAndValidate("file:///etc/passwd"), PdfInvalidUrlError);
  await assert.rejects(() => pdfPolicy.assertAllowed("https://example.test"), PdfBlockedDestinationError);

  const unresolvable = new DestinationPolicy(
    async () => {
      throw new Error("ENOTFOUND");
    },
    { errors: pdfDestinationErrors },
  );
  await assert.rejects(() => unresolvable.assertAllowed("https://example.test"), PdfRenderError);
});
