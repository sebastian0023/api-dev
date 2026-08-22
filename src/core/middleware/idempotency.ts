import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { redis } from "../redis.js";
import { conflict, unprocessable } from "../../shared/http/errors.js";

const TTL_SECONDS = 60 * 60 * 24; // 24h

interface StoredRecord {
  status: "in-progress" | "complete";
  bodyHash: string;
  statusCode?: number;
  responseBody?: unknown;
}

function hashBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

/**
 * Applied per-route (via createModuleRouter's `idempotent: true`), not
 * globally — only POST-a-resource endpoints need it. A request without an
 * Idempotency-Key header passes straight through untouched.
 */
export const idempotency: RequestHandler = async (req, res, next) => {
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) {
    next();
    return;
  }

  const scope = req.user?.id ?? "anon";
  const redisKey = `idem:${scope}:${req.method}:${req.baseUrl}${req.path}:${idempotencyKey}`;
  const bodyHash = hashBody(req.body);

  const inProgress: StoredRecord = { status: "in-progress", bodyHash };
  const acquired = await redis.set(redisKey, JSON.stringify(inProgress), "EX", TTL_SECONDS, "NX");

  if (acquired === null) {
    const raw = await redis.get(redisKey);
    if (!raw) {
      // Expired between our NX attempt and this GET — treat as fresh.
      next();
      return;
    }
    const stored = JSON.parse(raw) as StoredRecord;
    if (stored.status === "in-progress") {
      next(conflict("A request with this Idempotency-Key is already in progress"));
      return;
    }
    if (stored.bodyHash !== bodyHash) {
      next(unprocessable("Idempotency-Key was already used with a different request body"));
      return;
    }
    res.setHeader("Idempotency-Replayed", "true");
    res.status(stored.statusCode ?? 200).json(stored.responseBody);
    return;
  }

  // Release the lock if the connection drops before any response is sent,
  // so an aborted request doesn't block retries for the full 24h TTL.
  res.on("close", () => {
    if (!res.headersSent) {
      redis.del(redisKey).catch(() => {});
    }
  });

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 500) {
      // Don't let a transient server error poison the key for a day.
      redis.del(redisKey).catch((err) => console.error("[idempotency] cleanup failed:", err));
    } else {
      const record: StoredRecord = {
        status: "complete",
        bodyHash,
        statusCode: res.statusCode,
        responseBody: body,
      };
      redis.set(redisKey, JSON.stringify(record), "EX", TTL_SECONDS).catch((err) => {
        console.error("[idempotency] failed to persist response:", err);
      });
    }
    return originalJson(body);
  }) as typeof res.json;

  next();
};
