import assert from "node:assert/strict";
import test from "node:test";
import { createBase64Service } from "../../src/modules/developer-tools/application/base64.service.js";
import { InvalidBase64Error, ToolInputTooLargeError } from "../../src/modules/developer-tools/domain/developer-tools.errors.js";
import { Base64EncodingStrategy } from "../../src/modules/developer-tools/infrastructure/encoding/base64EncodingStrategy.js";

const logger = { info() {}, warn() {}, error() {} };

function service() {
  return createBase64Service({ strategy: new Base64EncodingStrategy(), logger });
}

test("Base64 encodes ASCII and round-trips Unicode and empty UTF-8 text", () => {
  const base64 = service();
  assert.deepEqual(base64.encode("Hello World"), { encoding: "base64", value: "SGVsbG8gV29ybGQ=" });
  assert.deepEqual(base64.decode("5pel5pys6KqeIPCfjI0="), { encoding: "utf8", value: "日本語 🌍" });
  assert.deepEqual(base64.encode(""), { encoding: "base64", value: "" });
  assert.deepEqual(base64.decode(""), { encoding: "utf8", value: "" });
});

test("Base64 decoding rejects malformed characters, padding, non-canonical values, and non-UTF-8 bytes", () => {
  const base64 = service();
  for (const value of ["SGV sbG8=", "SGVsbG8", "SGVsbG8==", "A===", "_w=="]) {
    assert.throws(() => base64.decode(value), InvalidBase64Error);
  }
});

test("Base64 service rejects values beyond the text input limit", () => {
  assert.throws(() => service().encode("x".repeat(1_048_577)), ToolInputTooLargeError);
});
