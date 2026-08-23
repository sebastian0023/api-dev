import type { RetryPolicy } from "../../webhooks/domain/retryPolicy.js";

export interface ExponentialBackoffOptions {
  maxAttempts: number;
  baseSeconds: number;
  maxSeconds: number;
  /** Fraction of the delay added as jitter (0 disables it — used by tests). */
  jitterRatio?: number;
  random?: () => number;
}

/**
 * base * 2^(n-1), capped, plus jitter. The jitter matters when one
 * subscriber's outage fails many deliveries at once: without it they all
 * retry in the same instant and hammer the endpoint the moment it recovers.
 */
export class ExponentialBackoff implements RetryPolicy {
  readonly maxAttempts: number;
  private readonly baseSeconds: number;
  private readonly maxSeconds: number;
  private readonly jitterRatio: number;
  private readonly random: () => number;

  constructor(options: ExponentialBackoffOptions) {
    this.maxAttempts = options.maxAttempts;
    this.baseSeconds = options.baseSeconds;
    this.maxSeconds = options.maxSeconds;
    this.jitterRatio = options.jitterRatio ?? 0.2;
    this.random = options.random ?? Math.random;
  }

  nextDelaySeconds(attemptsMade: number): number | null {
    if (attemptsMade >= this.maxAttempts) return null;
    const exponential = this.baseSeconds * 2 ** Math.max(0, attemptsMade - 1);
    const capped = Math.min(exponential, this.maxSeconds);
    const jitter = capped * this.jitterRatio * this.random();
    return Math.round(capped + jitter);
  }
}
