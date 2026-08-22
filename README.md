# API Dev Platform

A developer-facing API platform built as a **modular monolith**. It provides reusable developer APIs for authentication, QR generation, and URL shortening, while keeping each feature independently organized under `src/modules/`.

Current modules:

- `auth` — JWT sessions, refresh-token rotation, and scoped API keys.
- `qr` — QR image generation and optional tracked redirects.
- `url` — authenticated URL management and public, counted short-link redirects.
- `pdf` — authenticated, synchronous HTML and public-URL PDF rendering.

New modules are auto-discovered, dependency-ordered, initialized, and mounted without a central registration file.

## Stack

- **Backend:** Node.js + Express 5 + TypeScript
- **Database:** PostgreSQL + Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg` driver adapter)
- **Validation:** Zod 4, doubling as the source for the generated OpenAPI spec (`zod-openapi`)
- **Cache / rate limiting:** Redis + `rate-limiter-flexible`
- **Auth:** JWT access + refresh tokens (with rotation) for humans, API keys for programmatic access
- **Docs:** Swagger UI at `/docs`, generated from the same Zod schemas that validate requests
- **QR generation:** `qrcode`, server-side, no external service
- **PDF generation:** Playwright Chromium, isolated per-render browser contexts
- **Frontend:** React + Vite, with a typed client generated from the OpenAPI spec (`openapi-typescript` + `openapi-fetch`)

## Getting started

The whole stack — Postgres, Redis, the API, and the web app — runs from one compose file:

```bash
docker compose up --build     # api: :3000 (docs at /docs), web: :5173
```

Both `api` and `web` run in dev/watch mode with the source bind-mounted, so edits on the host reload live. The `api` container runs `prisma generate` + `prisma migrate deploy` on every start, so schema changes take effect on a restart with no manual step.

<details>
<summary>Running without Docker (two terminals)</summary>

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run db:migrate            # applies prisma/migrations, generates the Prisma client
npm run dev                   # http://localhost:3000, docs at /docs
```

In a second terminal, for the frontend:

```bash
npm run openapi:dump          # writes openapi.json from the built app (no server needed)
npm run web:generate          # generates web/src/api/schema.d.ts from openapi.json
npm --prefix web install
npm run web:dev               # http://localhost:5173
```

</details>

## Architecture

```text
React + Vite web app
        │ typed OpenAPI client
        ▼
Express API ── request context, auth, errors, rate limits, idempotency
        │
        ▼
Module loader ──► auth ──► qr
        │               ├─► url
        │               └─► pdf
        ▼
PostgreSQL (Prisma) + Redis
```

The core owns shared HTTP, security, persistence, cache, OpenAPI, and module-loading infrastructure. Feature modules own their routes, schemas, controllers, application logic, and database models. This keeps the project deployable as one application while preserving strong boundaries between capabilities.

### The module contract

Every module lives at `src/modules/<name>/` and exports one manifest, its default export:

```ts
export default {
  name: string,
  version: string,
  basePath: string,          // e.g. '/api/v1/qr'
  routes: Router,             // a self-contained express.Router()
  requiresAuth: boolean,
  dependencies: string[],     // other module names that must init first
  onInit: async ({ db, eventBus, redis, logger }) => { ... },
} satisfies ModuleManifest;
```

`src/core/moduleLoader.ts`:

1. Discovers every folder under `src/modules/` (skipping any starting with `_`, e.g. `_template`).
2. Validates each manifest against a Zod schema and topologically sorts modules by `dependencies` (Kahn's algorithm, deterministic tie-breaking).
3. Runs `onInit` for every module, in dependency order.
4. Mounts each module's router at its `basePath`, guarded by auth when `requiresAuth: true`.

Every failure mode — a missing manifest file, a malformed manifest, a missing dependency, a circular dependency, a duplicate `basePath` — throws a `ModuleLoadError` with a specific, actionable message. The app refuses to boot rather than partially load.

### Module isolation

Modules never import each other's `repository.ts` or `service.ts` directly. Cross-module communication happens only via:

- the shared **event bus** (`src/core/eventBus.ts`, in-process pub/sub), or
- an explicit `*.public.ts` surface a module chooses to publish.

This isn't just a convention — `eslint.config.js` has a `no-restricted-imports` rule scoped to `src/modules/**` that rejects any import reaching into a sibling module's non-public files.

### Auth without a core → module dependency

`core/middleware/auth.ts` needs to verify JWTs and API keys, but core cannot import the `auth` module — that would invert the dependency graph this whole architecture is built to avoid. Instead, core owns a `CredentialVerifier` interface; the `auth` module supplies the implementation via `registerCredentialVerifier()` during its own `onInit`. If a protected route is hit before that registration happens (e.g. a module lists `requiresAuth: true` but forgot `auth` in its `dependencies`), the failure is loud and specific rather than a silent 401.

### Routes, validation, and OpenAPI in one declaration

There's no hand-maintained file listing every route for the docs. `src/shared/http/moduleRouter.ts` exports `createModuleRouter()`, whose `route()` function does four things from a single call: registers the Express handler, validates the request against your Zod schemas (results land in `req.validated`, never on `req.query` — Express 5 made `req.query` a read-only getter), records the OpenAPI fragment, and — if the route is `auth: false` inside an otherwise `requiresAuth: true` module — marks it public so the module-level auth guard skips it (this is how `GET /api/v1/qr/:id/scan` stays reachable by an unauthenticated phone camera even though the rest of `qr` requires credentials).

`src/core/openapi.ts` assembles the full OpenAPI document from that registry after every module has loaded, and serves it at `/openapi.json` and `/docs`.

### Response envelope, errors, idempotency, rate limiting

Every response is `{ data, error, meta: { requestId } }` (`res.ok()`, attached by `core/middleware/requestContext.ts`). `core/middleware/errorHandler.ts` is the single place that turns a thrown `ApiError`, `ZodError`, or known Prisma error into that shape. `Idempotency-Key` support (`core/middleware/idempotency.ts`) and per-key rate limiting (`core/middleware/rateLimit.ts`, reading `ApiKey.rateLimit` from Redis-backed `rate-limiter-flexible`) are opt-in per route via `idempotent: true` — rate limiting runs on every route registered through `createModuleRouter()`, keyed by API key when present, falling back to user id or IP.

## Design patterns

- **Modular monolith / plugin architecture:** each module exports a manifest; the loader discovers and mounts it after resolving declared dependencies.
- **Dependency inversion and composition root:** modules receive infrastructure through `onInit`, while core authentication depends on the `CredentialVerifier` interface rather than importing the auth module.
- **Repository pattern:** application logic depends on repository contracts. The URL module’s Prisma repository is the only place that accesses `UrlShortUrl` through Prisma.
- **Strategy pattern:** `ShortCodeGenerator` abstracts URL-code generation; `Base62ShortCodeGenerator` is the cryptographically secure V1 implementation.
- **Adapter pattern:** Prisma repositories adapt database access to module contracts, and the auth module adapts JWT/API-key verification to core’s credential-verifier port.
- **Declarative routing / middleware pipeline:** one `route()` declaration composes validation, authentication, scopes, rate limiting, idempotency, Express registration, and OpenAPI documentation.
- **Event-driven integration:** modules may communicate through the in-process event bus when an asynchronous domain event is appropriate; direct imports of another module’s internals are blocked by ESLint.

## Adding a new module

1. Copy `src/modules/_template/` to `src/modules/<your-module>/`.
2. Rename every `template.*.ts` file and every `Template`/`template` identifier inside them to your module's name.
3. In `<your-module>.module.ts`, set `name`, `basePath`, and `dependencies` (list `'auth'` if your routes need `requiresAuth: true`).
4. Add your Prisma model(s) to `prisma/schema.prisma`, prefixed `<YourModule>*` (e.g. `PaymentInvoice`), then `npm run db:migrate`.
5. Replace the template's in-memory `repository.ts` with real `db.<yourModel>` calls, scoped to the model(s) you own — see `src/modules/qr/qr.repository.ts` for the pattern.
6. Define your routes with `route()` calls in `<your-module>.routes.ts` — auth, validation, idempotency, and OpenAPI docs all follow from that one declaration.

**No file under `src/core/` needs to change.** The loader discovers the new folder automatically; `/docs` picks up the new routes automatically; auth and rate limiting apply automatically based on what you declared.

## API conventions

- All routes are versioned under `/api/v1/`.
- All responses use the envelope: `{ "data": {}, "error": null, "meta": { "requestId": "uuid" } }`.
- POST endpoints that create a resource accept an optional `Idempotency-Key` header.
- All input is validated with Zod at the controller boundary.
- Rate limits are enforced per API key (`ApiKey.rateLimit`), falling back to a per-user or per-IP default.

### PDF rendering

`POST /api/v1/pdf/html` and `POST /api/v1/pdf/url` require authentication and the `pdf:generate` API-key scope. They return raw `application/pdf` bytes with an inline `document.pdf` disposition rather than the normal JSON envelope. HTML scripts are disabled; public HTTP(S) assets and URL-rendering subrequests are DNS-checked and blocked when they target local, private, link-local, metadata, or otherwise non-public addresses. Both endpoints share a stricter PDF-specific rate limit.

The SSRF protection validates DNS answers before navigation and on intercepted browser requests. DNS can still change between that validation and Chromium's connection, so production deployments should additionally deny browser egress to private and metadata networks.

The Docker API image includes Chromium and runs it as the non-root `node` user with Chromium sandbox support. The Playwright seccomp profile is applied by Compose; use equivalent egress and seccomp controls in other deployments.

## Verification

```bash
npm run typecheck && npm run lint
```

End-to-end flow (see the plan's verification section for the full checklist — refresh rotation, rate-limit 429s, idempotency replay, the loader's failure-mode messages):

```bash
curl -sX POST localhost:3000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"correcthorsebattery"}'

curl -sX POST localhost:3000/api/v1/auth/api-keys -H "authorization: Bearer <accessToken>" \
  -H 'content-type: application/json' -d '{"name":"cli","scopes":["qr:write","qr:read"]}'

curl -sX POST localhost:3000/api/v1/qr -H "x-api-key: <rawKey>" \
  -H 'content-type: application/json' \
  -d '{"payload":"https://example.com","format":"png"}'
```
