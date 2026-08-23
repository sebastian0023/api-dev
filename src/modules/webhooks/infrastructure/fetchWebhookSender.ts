import type { ApiError } from "../../../shared/http/errors.js";
import type { DestinationPolicy } from "../../../shared/net/destinationPolicy.js";
import type { PayloadSigner } from "../../webhooks/domain/payloadSigner.js";
import type { SendInput, SendResult, WebhookSender } from "../../webhooks/domain/webhookSender.js";
import { WebhookBlockedDestinationError, WebhookInvalidUrlError } from "../../webhooks/domain/webhooks.errors.js";

const USER_AGENT = "api-dev-webhooks/1.0";

/**
 * A malformed or blocked URL cannot start working on its own, so retrying
 * only burns the budget. A DNS failure can — that one stays retryable.
 */
function isTerminalDestinationFailure(error: unknown): error is ApiError {
  return error instanceof WebhookInvalidUrlError || error instanceof WebhookBlockedDestinationError;
}

/**
 * undici reports every transport problem as a bare "fetch failed" and hides
 * the real reason (ECONNREFUSED, certificate failure, DNS) in `cause`. The
 * delivery log is the only place a subscriber can debug from, so the cause
 * is unwrapped into the message.
 */
function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const cause = error.cause;
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    return `${error.message}: ${cause.message}`;
  }
  return error.message || "Request failed";
}

export class FetchWebhookSender implements WebhookSender {
  constructor(
    private readonly deps: {
      destinationPolicy: DestinationPolicy;
      signer: PayloadSigner;
      timeoutMs: number;
      maxResponseBytes: number;
    },
  ) {}

  async send(input: SendInput): Promise<SendResult> {
    const startedAt = Date.now();

    // Re-checked on every attempt rather than only at registration: DNS
    // can be repointed at a private address between the two. A rebind
    // between this check and the socket connect is still possible, which
    // is why deployments should also deny egress to internal ranges.
    try {
      await this.deps.destinationPolicy.assertAllowed(input.url);
    } catch (error) {
      return {
        ok: false,
        statusCode: null,
        responseBody: null,
        errorMessage: error instanceof Error ? error.message : "Destination rejected",
        durationMs: Date.now() - startedAt,
        terminal: isTerminalDestinationFailure(error),
      };
    }

    const body = JSON.stringify(input.payload);
    const { timestamp, signature } = this.deps.signer.sign({ body, secret: input.secret });

    try {
      const response = await fetch(input.url, {
        method: "POST",
        // Following a redirect would re-open the SSRF hole the policy just
        // closed — the new location is never validated.
        redirect: "manual",
        signal: AbortSignal.timeout(this.deps.timeoutMs),
        headers: {
          "content-type": "application/json",
          "user-agent": USER_AGENT,
          "x-webhook-id": input.deliveryId,
          "x-webhook-event": input.payload.type,
          "x-webhook-attempt": String(input.attempt),
          "x-webhook-timestamp": String(timestamp),
          "x-webhook-signature": signature,
        },
        body,
      });

      const responseBody = await this.readCapped(response);
      return {
        ok: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        responseBody,
        errorMessage: response.ok ? null : `Endpoint responded with ${response.status}`,
        durationMs: Date.now() - startedAt,
        terminal: false,
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        statusCode: null,
        responseBody: null,
        errorMessage: timedOut ? `Request timed out after ${this.deps.timeoutMs}ms` : describeFetchFailure(error),
        durationMs: Date.now() - startedAt,
        terminal: false,
      };
    }
  }

  /** Keeps a hostile or chatty endpoint from filling the attempt log. */
  private async readCapped(response: Response): Promise<string | null> {
    if (this.deps.maxResponseBytes === 0 || !response.body) return null;
    try {
      const text = await response.text();
      return text.length > this.deps.maxResponseBytes ? text.slice(0, this.deps.maxResponseBytes) : text;
    } catch {
      return null;
    }
  }
}
