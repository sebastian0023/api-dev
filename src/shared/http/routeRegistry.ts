import { match } from "path-to-regexp";
import type { ZodObject, ZodType } from "zod";

// The single place OpenAPI fragments and "this route skips auth" facts get
// recorded. Populated exclusively by createModuleRouter()'s route() calls
// (see moduleRouter.ts) — no module hand-edits a shared file to appear in
// the docs or to declare a public endpoint.

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface RouteRequestSchemas {
  body?: ZodType;
  // OpenAPI path/query parameters are always a flat object of named
  // fields — zod-openapi's requestParams requires an object schema
  // specifically (its output must satisfy Record<string, unknown>).
  query?: ZodObject;
  params?: ZodObject;
}

export interface RouteResponseSpec {
  status: number;
  schema: ZodType;
  description?: string;
}

export interface RouteDefinition {
  moduleName: string;
  method: HttpMethod;
  /** express-style path, relative to the module's basePath, e.g. '/:id/scan' */
  path: string;
  /** express-style path, prefixed with basePath, e.g. '/api/v1/qr/:id/scan' */
  fullPath: string;
  summary: string;
  description?: string;
  tags: string[];
  auth: boolean;
  scopes?: string[];
  idempotent?: boolean;
  request?: RouteRequestSchemas;
  response: RouteResponseSpec;
  /** HTTP status codes (besides the success response) documented as possible errors. */
  errors?: number[];
}

const routes: RouteDefinition[] = [];
const publicMatchersByModule = new Map<
  string,
  Array<{ method: HttpMethod; matcher: ReturnType<typeof match> }>
>();

export function registerRoute(def: RouteDefinition): void {
  const dup = routes.find((r) => r.method === def.method && r.fullPath === def.fullPath);
  if (dup) {
    throw new Error(
      `Duplicate route registration: ${def.method.toUpperCase()} ${def.fullPath} ` +
        `(already registered by module "${dup.moduleName}", conflicting registration from "${def.moduleName}")`,
    );
  }
  routes.push(def);

  if (!def.auth) {
    const list = publicMatchersByModule.get(def.moduleName) ?? [];
    list.push({ method: def.method, matcher: match(def.path, { decode: decodeURIComponent }) });
    publicMatchersByModule.set(def.moduleName, list);
  }
}

/** Used by the loader's per-module auth guard: is `method path` (relative to the module's basePath) public? */
export function isPublicRoute(moduleName: string, method: string, path: string): boolean {
  const list = publicMatchersByModule.get(moduleName);
  if (!list) return false;
  const lowerMethod = method.toLowerCase();
  return list.some((entry) => entry.method === lowerMethod && entry.matcher(path) !== false);
}

export function getRoutes(): readonly RouteDefinition[] {
  return routes;
}

/** Reset registry state — used only by scripts/tests that rebuild the app in-process. */
export function resetRouteRegistry(): void {
  routes.length = 0;
  publicMatchersByModule.clear();
}
