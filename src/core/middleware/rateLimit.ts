import type { RequestHandler } from "express";
import { RateLimiterRedis, type RateLimiterRes } from "rate-limiter-flexible";
import { redis } from "../redis.js";
import { config } from "../config.js";
import { tooManyRequests } from "../../shared/http/errors.js";

// rate-limiter-flexible needs one limiter instance per (points, duration)
// pair — API keys carry their own ApiKey.rateLimit budget, so instances
// are memoised lazily rather than declared up front.
const limiters = new Map<string, RateLimiterRedis>();

function getLimiter(points: number, durationSeconds: number): RateLimiterRedis {
  const cacheKey = `${points}:${durationSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `rl:${points}:${durationSeconds}`,
      points,
      duration: durationSeconds,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

function isRateLimiterRes(v: unknown): v is RateLimiterRes {
  return typeof v === "object" && v !== null && "msBeforeNext" in v;
}

/**
 * Mounted by the loader after the auth guard, so req.user (and therefore
 * the API key's own rate budget) is already resolved. API keys are limited
 * by ApiKey.rateLimit; authenticated-but-keyless requests and anonymous
 * requests fall back to the configured default, keyed by user id / IP.
 */
export const rateLimit: RequestHandler = async (req, res, next) => {
  const user = req.user;

  let points: number;
  let identity: string;

  if (user?.authType === "apikey") {
    points = user.rateLimit ?? config.DEFAULT_RATE_LIMIT_POINTS;
    identity = `key:${user.apiKeyId ?? user.id}`;
  } else if (user) {
    points = config.DEFAULT_RATE_LIMIT_POINTS;
    identity = `user:${user.id}`;
  } else {
    points = config.DEFAULT_RATE_LIMIT_POINTS;
    identity = `ip:${req.ip ?? "unknown"}`;
  }

  const limiter = getLimiter(points, config.DEFAULT_RATE_LIMIT_WINDOW_SECONDS);

  try {
    const result = await limiter.consume(identity, 1);
    res.setHeader("RateLimit-Limit", String(points));
    res.setHeader("RateLimit-Remaining", String(result.remainingPoints));
    res.setHeader("RateLimit-Reset", String(Math.ceil(result.msBeforeNext / 1000)));
    next();
  } catch (rejection) {
    if (!isRateLimiterRes(rejection)) {
      next(rejection instanceof Error ? rejection : new Error("Rate limiter failure"));
      return;
    }
    res.setHeader("RateLimit-Limit", String(points));
    res.setHeader("RateLimit-Remaining", "0");
    res.setHeader("RateLimit-Reset", String(Math.ceil(rejection.msBeforeNext / 1000)));
    next(tooManyRequests());
  }
};
