import assert from "node:assert/strict";
import test from "node:test";
import { ExponentialBackoff } from "../../src/modules/webhooks/infrastructure/exponentialBackoff.js";
import {
  PING_EVENT,
  isKnownEvent,
  subscribableEventNames,
  unknownEvents,
  WEBHOOK_EVENTS,
} from "../../src/modules/webhooks/domain/eventCatalog.js";

function backoff(overrides: Partial<ConstructorParameters<typeof ExponentialBackoff>[0]> = {}) {
  return new ExponentialBackoff({
    maxAttempts: 5,
    baseSeconds: 10,
    maxSeconds: 3_600,
    jitterRatio: 0,
    ...overrides,
  });
}

test("doubles the delay per attempt and returns null once the budget is spent", () => {
  const policy = backoff();
  assert.deepEqual(
    [1, 2, 3, 4].map((attempt) => policy.nextDelaySeconds(attempt)),
    [10, 20, 40, 80],
  );
  // The 5th attempt is the last one allowed, so after it there is no delay.
  assert.equal(policy.nextDelaySeconds(5), null);
  assert.equal(policy.nextDelaySeconds(6), null);
  assert.equal(policy.maxAttempts, 5);
});

test("caps the delay and never schedules past maxSeconds", () => {
  const policy = backoff({ maxAttempts: 12, baseSeconds: 60, maxSeconds: 300 });
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((attempt) => policy.nextDelaySeconds(attempt)),
    [60, 120, 240, 300, 300],
  );
});

test("jitter stays within the configured fraction above the base delay", () => {
  const jittered = backoff({ jitterRatio: 0.2, random: () => 1 });
  assert.equal(jittered.nextDelaySeconds(1), 12);
  const none = backoff({ jitterRatio: 0.2, random: () => 0 });
  assert.equal(none.nextDelaySeconds(1), 10);
});

test("a single-attempt policy never retries", () => {
  assert.equal(backoff({ maxAttempts: 1 }).nextDelaySeconds(1), null);
});

test("the event catalog names known topics and rejects everything else", () => {
  assert.ok(isKnownEvent(PING_EVENT));
  assert.ok(isKnownEvent("qr.code.created"));
  assert.equal(isKnownEvent("qr.code.deleted"), false);
  assert.deepEqual(unknownEvents(["qr.code.created", "nope", "nope", "also.nope"]), ["nope", "also.nope"]);
  assert.deepEqual(unknownEvents([]), []);

  // The ping is fired directly by the test-fire route, so subscribing the
  // bus to it would double-deliver.
  assert.equal(subscribableEventNames().includes(PING_EVENT), false);
  assert.equal(subscribableEventNames().length, WEBHOOK_EVENTS.length - 1);
  for (const event of WEBHOOK_EVENTS) {
    assert.ok(event.description.length > 0, `${event.name} needs a description`);
  }
});
