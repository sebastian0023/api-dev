import type { Router } from "express";
import { z } from "zod";
import type { Db } from "./db.js";
import type { EventBus } from "./eventBus.js";
import type { Redis } from "ioredis";

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface ModuleContext {
  db: Db;
  eventBus: EventBus;
  redis: Redis;
  logger: Logger;
}

export interface ModuleManifest {
  name: string;
  version: string;
  /** e.g. '/api/v1/qr' */
  basePath: string;
  /** A self-contained express.Router() — must not import another module's internals. */
  routes: Router;
  requiresAuth: boolean;
  /** Other module `name`s that must finish onInit before this module's onInit runs. */
  dependencies: string[];
  onInit(ctx: ModuleContext): Promise<void>;
}

// Express Router instances (and async functions in general) are functions
// at runtime, so they're validated structurally rather than with
// `instanceof` — this also keeps the contract framework-agnostic on paper.
// Note: Zod 4's z.function() is a call-signature validator, not a plain
// schema usable with z.object() — z.custom<T>() is the correct tool here.
const isFunction = (v: unknown): v is (...args: unknown[]) => unknown => typeof v === "function";

export const ManifestSchema = z.object({
  name: z
    .string()
    .min(1, "name must be a non-empty string")
    .regex(/^[a-z][a-z0-9-]*$/, "name must be lowercase kebab-case (e.g. 'qr', 'auth')"),
  version: z.string().min(1, "version must be a non-empty string (e.g. '1.0.0')"),
  basePath: z
    .string()
    .min(1)
    .regex(/^\/api\/v1\/[a-z0-9\-/]+$/, "basePath must look like '/api/v1/<segment>'"),
  routes: z.custom<Router>(isFunction, { message: "routes must be an express.Router()" }),
  requiresAuth: z.boolean(),
  dependencies: z.array(z.string()),
  onInit: z.custom<ModuleManifest["onInit"]>(isFunction, {
    message: "onInit must be an async function",
  }),
}) satisfies z.ZodType<ModuleManifest>;

export class ModuleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleLoadError";
  }
}
