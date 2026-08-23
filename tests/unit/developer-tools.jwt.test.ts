import assert from "node:assert/strict";
import test from "node:test";
import { InvalidJwtEncodingError, InvalidJwtJsonError, InvalidJwtStructureError } from "../../src/modules/developer-tools/domain/developer-tools.errors.js";
import { StandardJwtDecoder } from "../../src/modules/developer-tools/infrastructure/jwt/standardJwtDecoder.js";

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function token(header: object, payload: object, signature = "c2ln"): string {
  return `${base64Url(header)}.${base64Url(payload)}.${signature}`;
}

test("JWT decoder parses header and payload, handles Base64URL variants, and derives NumericDate metadata", () => {
  const decoder = new StandardJwtDecoder(() => new Date("2026-08-22T12:00:00.000Z"));
  const value = token({ alg: "none", typ: "JWT", marker: "\uffff" }, { sub: "123", iat: 1_710_000_000, exp: 1_800_000_000 });
  assert.match(value, /[-_]/);
  const decoded = decoder.decode(value);
  assert.deepEqual(decoded.header, { alg: "none", typ: "JWT", marker: "\uffff" });
  assert.equal(decoded.payload.sub, "123");
  assert.equal(decoded.metadata.issuedAt, "2024-03-09T16:00:00.000Z");
  assert.equal(decoded.metadata.expiresAt, "2027-01-15T08:00:00.000Z");
  assert.equal(decoded.metadata.expired, false);
  assert.equal("valid" in decoded, false);
  assert.equal("verified" in decoded, false);
});

test("JWT decoder detects expiration and leaves absent or invalid NumericDates nullable", () => {
  const decoder = new StandardJwtDecoder(() => new Date("2026-08-22T12:00:00.000Z"));
  assert.equal(decoder.decode(token({ alg: "HS256" }, { exp: 0 })).metadata.expired, true);
  assert.deepEqual(decoder.decode(token({ alg: "HS256" }, { iat: "no", exp: null })).metadata, {
    issuedAt: null,
    expiresAt: null,
    expired: null,
  });
});

test("JWT decoder rejects invalid compact structure, Base64URL, and JSON", () => {
  const decoder = new StandardJwtDecoder(() => new Date());
  assert.throws(() => decoder.decode("only.two"), InvalidJwtStructureError);
  assert.throws(() => decoder.decode("a.eyJzdWIiOiIxIn0.signature"), InvalidJwtEncodingError);
  assert.throws(() => decoder.decode("bm90LWpzb24.eyJzdWIiOiIxIn0.signature"), InvalidJwtJsonError);
  assert.throws(() => decoder.decode(`${base64Url({ alg: "none" })}.${base64Url({ sub: "1" })}.bad=`), InvalidJwtEncodingError);
});
