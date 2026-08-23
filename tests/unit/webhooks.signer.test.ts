import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { HmacPayloadSigner, verifySignature } from "../../src/modules/webhooks/infrastructure/hmacPayloadSigner.js";

const secret = "whsec_test-secret";
const body = JSON.stringify({ id: "d-1", type: "webhook.ping", data: { message: "hi" } });

test("signs the timestamp and body together with a versioned scheme", () => {
  const signed = new HmacPayloadSigner().sign({ body, secret, timestamp: 1_710_000_000 });

  const expected = createHmac("sha256", secret).update(`1710000000.${body}`, "utf8").digest("hex");
  assert.equal(signed.timestamp, 1_710_000_000);
  assert.equal(signed.signature, `t=1710000000,v1=${expected}`);
  // The body alone must not be what gets signed — otherwise a captured
  // payload stays valid forever.
  assert.notEqual(expected, createHmac("sha256", secret).update(body, "utf8").digest("hex"));
});

test("defaults the timestamp to now and produces a fresh signature each second", () => {
  const before = Math.floor(Date.now() / 1_000);
  const signed = new HmacPayloadSigner().sign({ body, secret });
  assert.ok(signed.timestamp >= before);
  assert.match(signed.signature, /^t=\d+,v1=[0-9a-f]{64}$/);
});

test("verification accepts a genuine signature and rejects every tampered variant", () => {
  const signer = new HmacPayloadSigner();
  const { signature } = signer.sign({ body, secret, timestamp: 1_710_000_000 });

  assert.equal(verifySignature({ header: signature, body, secret }), true);
  assert.equal(verifySignature({ header: signature, body: `${body} `, secret }), false);
  assert.equal(verifySignature({ header: signature, body, secret: "whsec_other" }), false);
  // Same digest, different claimed timestamp.
  assert.equal(verifySignature({ header: signature.replace("t=1710000000", "t=1710000001"), body, secret }), false);
  assert.equal(verifySignature({ header: "v1=deadbeef", body, secret }), false);
  assert.equal(verifySignature({ header: "t=1710000000", body, secret }), false);
  assert.equal(verifySignature({ header: "garbage", body, secret }), false);
  assert.equal(verifySignature({ header: "t=1710000000,v1=short", body, secret }), false);
});

test("verification tolerates whitespace around header parts", () => {
  const { signature } = new HmacPayloadSigner().sign({ body, secret, timestamp: 1_710_000_000 });
  const spaced = signature.replace(",", ", ");
  assert.equal(verifySignature({ header: spaced, body, secret }), true);
});
