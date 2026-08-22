import assert from "node:assert/strict";
import test from "node:test";
import { PdfBlockedDestinationError, PdfInvalidUrlError } from "../../src/modules/pdf/domain/pdf.errors.js";
import { DestinationPolicy } from "../../src/modules/pdf/infrastructure/destinationPolicy.js";

function policy(addresses: string[]) {
  return new DestinationPolicy(async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
}

test("accepts public HTTP(S) destinations and rejects malformed or unsupported URLs", async () => {
  const destinationPolicy = policy(["8.8.8.8"]);
  await destinationPolicy.assertAllowed("https://example.test/path");
  await destinationPolicy.assertAllowed("http://example.test/path");
  assert.throws(() => destinationPolicy.parseAndValidate("not a URL"), PdfInvalidUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("file:///etc/passwd"), PdfInvalidUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("javascript:alert(1)"), PdfInvalidUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("ftp://example.test"), PdfInvalidUrlError);
  assert.throws(() => destinationPolicy.parseAndValidate("https://user:pass@example.test"), PdfInvalidUrlError);
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
    await assert.rejects(() => policy([address]).assertAllowed("https://example.test"), PdfBlockedDestinationError);
  }
  await assert.rejects(() => policy(["8.8.8.8", "10.0.0.1"]).assertAllowed("https://example.test"), PdfBlockedDestinationError);
  await assert.rejects(() => policy(["8.8.8.8"]).assertAllowed("https://localhost"), PdfBlockedDestinationError);
  await assert.rejects(() => policy(["8.8.8.8"]).assertAllowed("https://metadata.google.internal"), PdfBlockedDestinationError);
});
