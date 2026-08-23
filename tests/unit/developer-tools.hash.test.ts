import assert from "node:assert/strict";
import test from "node:test";
import { createHashService } from "../../src/modules/developer-tools/application/hash.service.js";
import { DuplicateHashStrategyError, ToolInputTooLargeError, UnsupportedHashAlgorithmError } from "../../src/modules/developer-tools/domain/developer-tools.errors.js";
import { HashStrategyRegistry } from "../../src/modules/developer-tools/domain/hashStrategy.js";
import { Sha256HashStrategy, Sha384HashStrategy, Sha512HashStrategy } from "../../src/modules/developer-tools/infrastructure/hash/hashStrategies.js";

const logger = { info() {}, warn() {}, error() {} };

function registry(): HashStrategyRegistry {
  const value = new HashStrategyRegistry();
  value.register(new Sha256HashStrategy());
  value.register(new Sha384HashStrategy());
  value.register(new Sha512HashStrategy());
  return value;
}

test("hash registry resolves algorithms, lists support, and rejects unknown or duplicate strategies", () => {
  const value = registry();
  assert.equal(value.resolve("sha384").algorithm, "sha384");
  assert.deepEqual(value.supportedAlgorithms(), ["sha256", "sha384", "sha512"]);
  assert.throws(() => value.resolve("sha3"), UnsupportedHashAlgorithmError);
  assert.throws(() => value.register(new Sha256HashStrategy()), DuplicateHashStrategyError);
});

test("hash strategies produce known SHA vectors in hex and base64", async () => {
  const service = createHashService({ registry: registry(), logger });
  assert.equal(
    (await service.hash({ value: "", algorithm: "sha256", encoding: "hex" })).hash,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    (await service.hash({ value: "hello", algorithm: "sha384", encoding: "hex" })).hash,
    "59e1748777448c69de6b800d7a33bbfb9ff1b463e44354c3553bcdb9c666fa90125a3c79f90397bdf5f6a13de828684f",
  );
  assert.equal(
    (await service.hash({ value: "hello world", algorithm: "sha512", encoding: "hex" })).hash,
    "309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f",
  );
  assert.equal(
    (await service.hash({ value: "hello world", algorithm: "sha256", encoding: "base64" })).hash,
    "uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=",
  );
});

test("hash service rejects text that exceeds the byte limit", async () => {
  const service = createHashService({ registry: registry(), logger });
  await assert.rejects(() => service.hash({ value: "x".repeat(1_048_577), algorithm: "sha256", encoding: "hex" }), ToolInputTooLargeError);
});
