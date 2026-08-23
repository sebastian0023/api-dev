import { randomUUID } from "node:crypto";
import type { Logger } from "../../../core/moduleContract.js";
import type { RetryPolicy } from "../../webhooks/domain/retryPolicy.js";
import type { WebhookDeliveryRepository } from "../../webhooks/domain/webhooks.repository.js";
import type { WebhookSender } from "../../webhooks/domain/webhookSender.js";
import type { DeliveryWithEndpoint, WebhookEventPayload } from "../../webhooks/domain/webhooks.types.js";

export interface DeliveryDispatcherOptions {
  deliveries: WebhookDeliveryRepository;
  sender: WebhookSender;
  retryPolicy: RetryPolicy;
  logger: Logger;
  pollIntervalMs: number;
  maxConcurrent: number;
  now?: () => Date;
  /** A claim older than this is assumed abandoned by a crashed instance. */
  staleClaimMs?: number;
}

const DEFAULT_STALE_CLAIM_MS = 5 * 60_000;

/**
 * Polls Postgres for due deliveries and sends them. State lives in the
 * database rather than in memory, so a restart mid-backoff resumes instead
 * of dropping the retry — and several instances can run this loop at once
 * without double-sending, because claiming a row is what grants the right
 * to send it.
 */
export class DeliveryDispatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private tickInFlight: Promise<void> | undefined;
  private readonly now: () => Date;
  private readonly staleClaimMs: number;

  constructor(private readonly opts: DeliveryDispatcherOptions) {
    this.now = opts.now ?? (() => new Date());
    this.staleClaimMs = opts.staleClaimMs ?? DEFAULT_STALE_CLAIM_MS;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.opts.pollIntervalMs);
    // Never let the poller hold the process open: `npm run openapi:dump`
    // and the test runners build the app and exit, and a live interval
    // would hang both.
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.tickInFlight;
  }

  /** One poll cycle. Exposed for tests so they never wait on a timer. */
  async runOnce(): Promise<number> {
    const claimId = randomUUID();
    const at = this.now();
    await this.opts.deliveries.releaseStaleClaims(new Date(at.getTime() - this.staleClaimMs));

    const claimed = await this.opts.deliveries.claimDue(claimId, at, this.opts.maxConcurrent);
    if (claimed.length === 0) return 0;

    await Promise.all(claimed.map((delivery) => this.deliver(delivery)));
    return claimed.length;
  }

  /**
   * Overlapping ticks would claim each other's work and multiply
   * concurrency past the configured bound, so a tick is skipped whenever
   * the previous one is still running. Every failure is swallowed into the
   * log — an unhandled rejection here would take the process down.
   */
  private async tick(): Promise<void> {
    if (this.tickInFlight) return;
    this.tickInFlight = (async () => {
      try {
        await this.runOnce();
      } catch (error) {
        this.opts.logger.error("Webhook dispatcher tick failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })().finally(() => {
      this.tickInFlight = undefined;
    });
    await this.tickInFlight;
  }

  private async deliver(delivery: DeliveryWithEndpoint): Promise<void> {
    const attempt = delivery.attemptCount + 1;
    const payload: WebhookEventPayload = {
      id: delivery.id,
      type: delivery.eventType,
      createdAt: delivery.createdAt.toISOString(),
      data: (delivery.payload ?? {}) as Record<string, unknown>,
    };

    const result = await this.opts.sender.send({
      url: delivery.endpoint.url,
      secret: delivery.endpoint.secret,
      attempt,
      deliveryId: delivery.id,
      payload,
    });

    await this.opts.deliveries.recordAttempt({
      deliveryId: delivery.id,
      attempt,
      statusCode: result.statusCode,
      responseBody: result.responseBody,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    });

    if (result.ok) {
      await this.opts.deliveries.markSucceeded(delivery.id, attempt, this.now());
      this.opts.logger.info("Webhook delivered", {
        deliveryId: delivery.id,
        event: delivery.eventType,
        attempt,
        statusCode: result.statusCode,
      });
      return;
    }

    const error = result.errorMessage ?? "Delivery failed";
    const delaySeconds = result.terminal ? null : this.opts.retryPolicy.nextDelaySeconds(attempt);

    if (delaySeconds === null) {
      await this.opts.deliveries.markFailed(delivery.id, attempt, error, this.now());
      this.opts.logger.warn("Webhook delivery failed permanently", {
        deliveryId: delivery.id,
        event: delivery.eventType,
        attempt,
        terminal: result.terminal,
        error,
      });
      return;
    }

    await this.opts.deliveries.scheduleRetry(
      delivery.id,
      attempt,
      new Date(this.now().getTime() + delaySeconds * 1_000),
      error,
    );
    this.opts.logger.warn("Webhook delivery attempt failed; retry scheduled", {
      deliveryId: delivery.id,
      event: delivery.eventType,
      attempt,
      retryInSeconds: delaySeconds,
      error,
    });
  }
}
