import { Router, type RequestHandler } from "express";
import { authenticate } from "../../core/middleware/auth.js";
import { rateLimit } from "../../core/middleware/rateLimit.js";
import { idempotency } from "../../core/middleware/idempotency.js";
import { forbidden } from "./errors.js";
import {
  registerRoute,
  type HttpMethod,
  type RouteRequestSchemas,
  type RouteResponseSpec,
} from "./routeRegistry.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Populated by createModuleRouter()'s route() chain — never write
       * validated data back onto req.query (Express 5 made it a read-only
       * getter) or req.body. Controllers cast the relevant field with the
       * route's own Zod schema, e.g. `req.validated.body as CreateQrBody`.
       */
      validated: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export interface RouteDef {
  method: HttpMethod;
  /** express-style path relative to the module's basePath, e.g. '/:id/scan' */
  path: string;
  summary: string;
  description?: string;
  auth: boolean;
  scopes?: string[];
  idempotent?: boolean;
  request?: RouteRequestSchemas;
  response: RouteResponseSpec;
  /** Non-2xx status codes this route can return, for the generated docs. */
  errors?: number[];
  handler: RequestHandler;
}

/**
 * Registers one Express route, its Zod-driven request validation, and its
 * OpenAPI fragment in a single declaration — this is what lets new modules
 * appear in /docs and enforce auth/idempotency without editing any core
 * file. See modules/_template for the intended usage pattern.
 */
export function createModuleRouter(opts: { name: string; basePath: string; tag: string }) {
  const router = Router();
  const normalizedBasePath = opts.basePath.replace(/\/$/, "");

  function route(def: RouteDef): void {
    const fullPath = def.path === "/" ? normalizedBasePath || "/" : normalizedBasePath + def.path;

    registerRoute({
      moduleName: opts.name,
      method: def.method,
      path: def.path,
      fullPath,
      summary: def.summary,
      description: def.description,
      tags: [opts.tag],
      auth: def.auth,
      scopes: def.scopes,
      idempotent: def.idempotent,
      request: def.request,
      response: def.response,
      errors: def.errors,
    });

    const chain: RequestHandler[] = [];

    if (def.auth) {
      // The loader's moduleAuthGuard may have already resolved req.user for
      // requiresAuth:true modules — authenticate() no-ops in that case.
      // This still runs for modules that are requiresAuth:false overall
      // but opt individual routes in (e.g. auth's own /api-keys).
      chain.push(authenticate);
      if (def.scopes && def.scopes.length > 0) {
        chain.push(requireScopes(def.scopes));
      }
    }

    // Placed after auth resolution (not at the loader/module level) so the
    // rate limiter always sees the resolved req.user — and therefore an API
    // key's own ApiKey.rateLimit budget — regardless of whether auth was
    // resolved by the module-level guard or by this route's own `auth: true`.
    chain.push(rateLimit);

    if (def.idempotent) {
      chain.push(idempotency);
    }

    chain.push(validate(def.request));
    chain.push(def.handler);

    router[def.method](def.path, ...chain);
  }

  return { router, route };
}

function requireScopes(scopes: string[]): RequestHandler {
  return (req, _res, next) => {
    const userScopes = req.user?.scopes ?? [];
    if (userScopes.includes("*")) {
      // JWT-authenticated (human) sessions carry the "*" scope — full
      // access to their own resources. Only API keys carry a real,
      // narrowed scope list.
      next();
      return;
    }
    const missing = scopes.filter((s) => !userScopes.includes(s));
    if (missing.length > 0) {
      next(forbidden(`Missing required scope(s): ${missing.join(", ")}`));
      return;
    }
    next();
  };
}

function validate(schemas?: RouteRequestSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      const validated: { body?: unknown; query?: unknown; params?: unknown } = {};
      if (schemas?.params) validated.params = schemas.params.parse(req.params);
      if (schemas?.query) validated.query = schemas.query.parse(req.query);
      if (schemas?.body) validated.body = schemas.body.parse(req.body);
      req.validated = validated;
      next();
    } catch (err) {
      next(err); // ZodError is mapped to a 422 by core/middleware/errorHandler.ts
    }
  };
}
