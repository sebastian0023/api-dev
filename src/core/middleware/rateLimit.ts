import type { RequestHandler } from "express";
import { RateLimiterRedis, type RateLimiterRes } from "rate-limiter-flexible";
import { redis } from "../redis.js";
import { config } from "../config.js";
import { tooManyRequests } from "../../shared/http/errors.js";
import type { RouteRateLimit } from "../../shared/http/routeRegistry.js";

// rate-limiter-flexible needs one limiter instance per (points, duration)
// pair — API keys carry their own ApiKey.rateLimit budget, so instances
// are memoised lazily rather than declared up front.
const limiters = new Map<string, RateLimiterRedis>();

function getLimiter(points: number, durationSeconds: number, bucket?: string): RateLimiterRedis {
  const cacheKey = `${bucket ?? "default"}:${points}:${durationSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: bucket ? `rl:${bucket}:${points}:${durationSeconds}` : `rl:${points}:${durationSeconds}`,
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
export function createRateLimit(policy?: RouteRateLimit): RequestHandler {
  return async (req, res, next) => {
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

  const policyPoints = policy ? Math.min(points, policy.points) : points;
  const durationSeconds = policy?.durationSeconds ?? config.DEFAULT_RATE_LIMIT_WINDOW_SECONDS;
  const limiter = getLimiter(policyPoints, durationSeconds, policy?.bucket);

  try {
    const result = await limiter.consume(identity, 1);
    res.setHeader("RateLimit-Limit", String(policyPoints));
    res.setHeader("RateLimit-Remaining", String(result.remainingPoints));
    res.setHeader("RateLimit-Reset", String(Math.ceil(result.msBeforeNext / 1000)));
    next();
  } catch (rejection) {
    if (!isRateLimiterRes(rejection)) {
      next(rejection instanceof Error ? rejection : new Error("Rate limiter failure"));
      return;
    }
    res.setHeader("RateLimit-Limit", String(policyPoints));
    res.setHeader("RateLimit-Remaining", "0");
    res.setHeader("RateLimit-Reset", String(Math.ceil(rejection.msBeforeNext / 1000)));
    next(tooManyRequests());
  }
  };
}

/** Default limiter used by all routes that do not declare a specific policy. */
export const rateLimit = createRateLimit();
