import { ApiError } from "../../../shared/http/errors.js";

export class WebhookEndpointNotFoundError extends ApiError {
  constructor(message = "Webhook endpoint not found") {
    super(404, "WEBHOOKS_ENDPOINT_NOT_FOUND", message);
  }
}

export class WebhookDeliveryNotFoundError extends ApiError {
  constructor(message = "Webhook delivery not found") {
    super(404, "WEBHOOKS_DELIVERY_NOT_FOUND", message);
  }
}

export class UnknownWebhookEventError extends ApiError {
  constructor(events: readonly string[]) {
    super(
      422,
      "WEBHOOKS_UNKNOWN_EVENT",
      `Unknown event type(s): ${events.join(", ")}. GET /api/v1/webhooks/events lists what can be subscribed to.`,
    );
  }
}

export class WebhookInvalidUrlError extends ApiError {
  constructor(message = "Endpoint URL must be a valid HTTP or HTTPS URL without embedded credentials") {
    super(422, "WEBHOOKS_INVALID_URL", message);
  }
}

export class WebhookBlockedDestinationError extends ApiError {
  constructor(message = "Endpoint URL resolves to a blocked destination") {
    super(422, "WEBHOOKS_BLOCKED_DESTINATION", message);
  }
}

export class WebhookUnresolvableDestinationError extends ApiError {
  constructor(message = "Could not resolve the endpoint URL's hostname") {
    super(422, "WEBHOOKS_UNRESOLVABLE_DESTINATION", message);
  }
}

export class WebhookDeliveryNotReplayableError extends ApiError {
  constructor(status: string) {
    super(
      409,
      "WEBHOOKS_DELIVERY_NOT_REPLAYABLE",
      `Only settled deliveries can be replayed; this one is "${status}"`,
    );
  }
}
