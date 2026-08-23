import type { DestinationErrorFactory } from "../../../shared/net/destinationPolicy.js";
import {
  WebhookBlockedDestinationError,
  WebhookInvalidUrlError,
  WebhookUnresolvableDestinationError,
} from "../../webhooks/domain/webhooks.errors.js";

/**
 * Maps the shared SSRF policy onto this module's codes. These surface as
 * 422s rather than the shared 400/403: registering an endpoint is the
 * caller submitting a *field* the platform rejects, not the caller being
 * denied access to something.
 */
export const webhookDestinationErrors: DestinationErrorFactory = {
  invalidUrl: (message) => new WebhookInvalidUrlError(message),
  blocked: (message) => new WebhookBlockedDestinationError(message),
  unresolvable: (message) => new WebhookUnresolvableDestinationError(message),
};
