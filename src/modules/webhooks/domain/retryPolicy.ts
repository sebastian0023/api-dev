export interface RetryPolicy {
  /**
   * Delay before the attempt that follows `attemptsMade`, or null when the
   * budget is spent and the delivery should be marked failed.
   */
  nextDelaySeconds(attemptsMade: number): number | null;
  readonly maxAttempts: number;
}
