import assert from "node:assert/strict";
import test from "node:test";
import { createUuidService } from "../../src/modules/developer-tools/application/uuid.service.js";
import { DuplicateUuidGeneratorError, UnsupportedUuidVersionError } from "../../src/modules/developer-tools/domain/developer-tools.errors.js";
import { UuidGeneratorRegistry } from "../../src/modules/developer-tools/domain/uuidGenerator.js";
import { UuidV4Generator, UuidV7Generator } from "../../src/modules/developer-tools/infrastructure/uuid/uuidGenerators.js";

const logger = { info() {}, warn() {}, error() {} };

function registry(): UuidGeneratorRegistry {
  const value = new UuidGeneratorRegistry();
  value.register(new UuidV4Generator());
  value.register(new UuidV7Generator());
  return value;
}

test("UUID registry resolves generators, lists supported versions, and prevents duplicate or unknown registrations", () => {
  const value = registry();
  assert.equal(value.resolve("v4").version, "v4");
  assert.deepEqual(value.supportedVersions(), ["v4", "v7"]);
  assert.throws(() => value.resolve("v1"), UnsupportedUuidVersionError);
  assert.throws(() => value.register(new UuidV4Generator()), DuplicateUuidGeneratorError);
});

test("UUID service generates standards-shaped v4 and v7 batches", () => {
  const service = createUuidService({ registry: registry(), logger });
  const v4 = service.generate({ version: "v4", count: 1 });
  const v7 = service.generate({ version: "v7", count: 100 });

  assert.equal(v4.count, 1);
  assert.equal(v4.values.length, 1);
  assert.match(v4.values[0]!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(v7.count, 100);
  assert.ok(v7.values.every((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)));
  assert.equal(new Set(v7.values).size, v7.values.length);
});
