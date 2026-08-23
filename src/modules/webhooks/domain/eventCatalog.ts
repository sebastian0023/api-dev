/**
 * The events a subscriber may register for. This list is the webhooks
 * module's own view of the platform — it names the topics other modules
 * already emit on the shared event bus, without importing anything from
 * them. A module that starts emitting a new topic only needs an entry
 * here; a module that stops emitting one simply produces no deliveries.
 */
export interface WebhookEventDefinition {
  /** Topic name on the event bus. */
  readonly name: string;
  readonly description: string;
  /** Shown in the docs and in the test-fire payload for `webhook.ping`. */
  readonly samplePayload: Record<string, unknown>;
}

/** Emitted by this module itself when a caller test-fires an endpoint. */
export const PING_EVENT = "webhook.ping";

export const WEBHOOK_EVENTS: readonly WebhookEventDefinition[] = [
  {
    name: PING_EVENT,
    description: "Synthetic event produced by POST /endpoints/:id/test — never emitted by real activity.",
    samplePayload: { message: "Test delivery from the API Dev Platform" },
  },
  {
    name: "auth.user.registered",
    description: "A new account finished registration.",
    samplePayload: { userId: "3f1a…", email: "you@example.com" },
  },
  {
    name: "auth.apikey.created",
    description: "An API key was issued for the account.",
    samplePayload: { apiKeyId: "9c2b…", userId: "3f1a…" },
  },
  {
    name: "auth.apikey.revoked",
    description: "An API key was revoked.",
    samplePayload: { apiKeyId: "9c2b…", userId: "3f1a…" },
  },
  {
    name: "qr.code.created",
    description: "A QR code was generated.",
    samplePayload: { qrCodeId: "7d4e…", userId: "3f1a…" },
  },
] as const;

const KNOWN_EVENTS = new Set(WEBHOOK_EVENTS.map((event) => event.name));

export function isKnownEvent(name: string): boolean {
  return KNOWN_EVENTS.has(name);
}

/** Returns the subset of `events` this platform does not emit. */
export function unknownEvents(events: readonly string[]): string[] {
  return [...new Set(events.filter((event) => !KNOWN_EVENTS.has(event)))];
}

/** Every topic the module subscribes to at boot (the ping is fired directly). */
export function subscribableEventNames(): string[] {
  return WEBHOOK_EVENTS.map((event) => event.name).filter((name) => name !== PING_EVENT);
}
