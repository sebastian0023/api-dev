import type { RequestHandler } from "express";
import { isPublicRoute } from "../../shared/http/routeRegistry.js";
import { unauthorized } from "../../shared/http/errors.js";
import type { ModuleManifest } from "../moduleContract.js";

export interface AuthPrincipal {
  id: string;
  scopes: string[];
  authType: "jwt" | "apikey";
  apiKeyId?: string;
  /** Only set for API-key principals — points per window, from ApiKey.rateLimit. */
  rateLimit?: number;
}

// Core owns this interface and the middleware that consumes it, but never
// imports the auth module — that would invert the module dependency graph
// and violate "no core changes to add a module". The auth module supplies
// the implementation via registerCredentialVerifier() during its onInit.
export interface CredentialVerifier {
  verifyBearer(token: string): Promise<AuthPrincipal | null>;
  verifyApiKey(rawKey: string): Promise<AuthPrincipal | null>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}

let verifier: CredentialVerifier | null = null;

export function registerCredentialVerifier(v: CredentialVerifier): void {
  verifier = v;
}

/** Test/reset helper — not used by the running app. */
export function _resetCredentialVerifier(): void {
  verifier = null;
}

/**
 * Resolves `Authorization: Bearer <jwt>` first, then falls back to
 * `x-api-key`. Idempotent (no-ops if req.user is already set), so it
 * composes safely whether applied by the loader's module-level guard,
 * a route declared `auth: true`, or both.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  if (req.user) {
    next();
    return;
  }

  if (!verifier) {
    next(
      new Error(
        "No CredentialVerifier registered. A module declared requiresAuth/auth:true but the " +
          "auth module's onInit (which calls registerCredentialVerifier) has not run — check " +
          "that 'auth' is listed in this module's dependencies.",
      ),
    );
    return;
  }

  try {
    const authHeader = req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      const principal = await verifier.verifyBearer(token);
      if (!principal) {
        next(unauthorized("Invalid or expired access token"));
        return;
      }
      req.user = principal;
      next();
      return;
    }

    const apiKey = req.header("x-api-key");
    if (apiKey) {
      const principal = await verifier.verifyApiKey(apiKey);
      if (!principal) {
        next(unauthorized("Invalid or revoked API key"));
        return;
      }
      req.user = principal;
      next();
      return;
    }

    next(unauthorized("Provide an 'Authorization: Bearer <token>' header or an 'x-api-key' header"));
  } catch (err) {
    next(err);
  }
};

/**
 * Mounted by the loader ahead of every `requiresAuth: true` module's
 * router. Consults the route registry so routes explicitly registered
 * with `auth: false` (webhooks, redirect/scan endpoints, ...) stay
 * reachable without credentials even though the module is protected by
 * default.
 */
export function moduleAuthGuard(module: Pick<ModuleManifest, "name" | "requiresAuth">): RequestHandler {
  return (req, res, next) => {
    if (!module.requiresAuth) {
      next();
      return;
    }
    if (isPublicRoute(module.name, req.method, req.path)) {
      next();
      return;
    }
    authenticate(req, res, next);
  };
}
