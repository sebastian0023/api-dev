import type { WebhookEventPayload } from "./webhooks.types.js";

export interface SendResult {
  /** True only for a 2xx response. */
  ok: boolean;
  statusCode: number | null;
  /** Truncated response body, kept for the attempt log. */
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number;
  /**
   * Set when retrying could not possibly help — a blocked destination or a
   * malformed URL. The dispatcher fails these immediately instead of
   * burning the retry budget.
   */
  terminal: boolean;
}

export interface SendInput {
  url: string;
  secret: string;
  attempt: number;
  deliveryId: string;
  payload: WebhookEventPayload;
}

/** The HTTP boundary — swapped for a fake in the dispatcher's unit tests. */
export interface WebhookSender {
  send(input: SendInput): Promise<SendResult>;
}
