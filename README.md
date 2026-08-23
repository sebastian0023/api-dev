# API Dev Platform

A developer-facing API platform built as a **modular monolith**. It provides reusable developer APIs for authentication, QR generation, URL shortening, PDF rendering, everyday developer utilities, and outbound webhooks, while keeping each feature independently organized under `src/modules/`.

Current modules:

- `auth` — JWT sessions, refresh-token rotation, and scoped API keys.
- `qr` — QR image generation and optional tracked redirects.
- `url` — authenticated URL management and public, counted short-link redirects.
- `pdf` — authenticated, synchronous HTML and public-URL PDF rendering.
- `dev-tools` — stateless UUID, hashing, Base64, and JWT-decode utilities.
- `webhooks` — subscriber endpoints, HMAC-signed outbound delivery, retries, and a replayable delivery log.

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
- **Developer utilities:** `uuid` plus Node's built-in `crypto`/`Buffer` — no database, no external service
- **Webhook delivery:** in-process dispatcher polling Postgres, HMAC-SHA256 signing, exponential backoff
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

## Web app

`web/` is a sidebar-shell React app: `web/src/app/` holds the shell (`AppShell`, `Sidebar`, `Topbar`) and hash-based routing (`useNav.ts`, no router dependency — `#/qr`, `#/urls`, `#/pdf`, `#/dev-tools`, `#/webhooks`, `#/api-keys`), `web/src/app/screens.ts` is the single source of truth for what appears in the nav, `web/src/components/` holds the shared visual primitives (`Card`, `SegmentedControl`, `Callout`, `StatusPill`, `Disclosure`, `EmptyState`), and each API module gets one screen under `web/src/features/<name>/`. Styling is token-based (`web/src/styles/tokens.css` defines the palette/spacing/shadow custom properties consumed by `base.css`, `shell.css`, and `components.css`).

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

### Developer tools

Five stateless utilities under `/api/v1/dev-tools`, each requiring authentication and its own API-key scope:

| Endpoint | Scope | Notes |
| --- | --- | --- |
| `POST /uuid` | `devtools:uuid` | v4 or v7, 1–100 per call |
| `POST /hash` | `devtools:hash` | SHA-256/384/512, hex or Base64 output |
| `POST /base64/encode` | `devtools:encoding` | UTF-8 text in, Base64 out |
| `POST /base64/decode` | `devtools:encoding` | Rejects non-canonical Base64 and non-UTF-8 bytes with a 400 |
| `POST /jwt/decode` | `devtools:jwt` | Header and payload only — **no verification** |

The module owns no Prisma model and holds no state; each request is pure computation. Text inputs are capped at 1 MiB and JWTs at 32 KiB, over which the endpoints return a 413 (the shared JSON body parser's own 2 MiB cap sits above both, so a tool's limit is what a caller actually hits). Each tool has its own rate-limit bucket.

`POST /jwt/decode` decodes the header and payload for inspection and reports `iat`/`exp` metadata. It does **not** verify the signature, issuer, or audience, and a successful response says nothing about a token's authenticity — never use it as an authentication check.

### Webhooks

Register an endpoint, subscribe it to platform events, and the API delivers each one as a signed POST. `GET /api/v1/webhooks/events` lists what can be subscribed to — currently `webhook.ping` (test-fires only), `auth.user.registered`, `auth.apikey.created`, `auth.apikey.revoked`, and `qr.code.created`. Reads need the `webhooks:read` scope, writes `webhooks:write`.

This module is the event bus's first consumer: it subscribes to topics other modules already emit and imports nothing from them, so a module can start emitting a new event without either side knowing about the other. `POST /endpoints/:id/test` fires a synthetic `webhook.ping` so you can watch the whole signing/delivery/retry loop without waiting for real activity.

**Verifying a delivery.** Each request carries `X-Webhook-Id`, `-Event`, `-Attempt`, `-Timestamp`, and:

```
X-Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
```

The signature covers `<timestamp>.<raw body>` — not the body alone — so a captured payload can be rejected once its timestamp is old. Compare digests in constant time:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(header, rawBody, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((s) => s.trim())));
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(parts.v1 ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  // Reject anything older than five minutes to blunt replay of a captured body.
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  return fresh && a.length === b.length && timingSafeEqual(a, b);
}
```

Verify against the **raw** body bytes, before any JSON parse-and-reencode.

**Retries.** A non-2xx response, a timeout, or a connection failure schedules another attempt at `WEBHOOKS_BACKOFF_BASE_SECONDS * 2^(n-1)` (capped, jittered) until `WEBHOOKS_MAX_ATTEMPTS` is spent — 10s, 20s, 40s, 80s by default, then the delivery is marked `failed`. A malformed or blocked destination fails immediately, since retrying cannot help. Every attempt is recorded with its status code, truncated response body, and duration, readable at `GET /deliveries/:id`. `POST /deliveries/:id/replay` requeues a settled delivery with a fresh budget while preserving the earlier attempt history. Retry state lives in Postgres, so a restart mid-backoff resumes rather than dropping the delivery, and a claim column keeps two instances from sending the same one twice.

**Two things to know before running this anywhere real:**

- The signing secret is stored in plaintext. Unlike an API key, which is only ever compared, the server must have the secret itself to compute each HMAC — a one-way hash could not sign anything. Encrypt the `WebhookEndpoint.secret` column at rest with a managed key in production.
- `WEBHOOKS_ALLOW_PRIVATE_DESTINATIONS` is **dev-only**. It is `true` in `docker-compose.yml` and `.env.example` so you can deliver to a receiver on your own machine; it disables this module's SSRF address checks, so leave it `false` anywhere users other than you can register an endpoint. With it off, endpoint URLs are DNS-validated against the same shared policy the PDF module uses (`src/shared/net/destinationPolicy.ts`) on registration *and* before every attempt, and redirects are never followed. As with PDF rendering, DNS can still change between validation and connection, so deployments should also deny egress to private and metadata networks.

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
