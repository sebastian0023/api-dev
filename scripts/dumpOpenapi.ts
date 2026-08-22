import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildApp } from "../src/core/app.js";
import { buildOpenApiDocument } from "../src/core/openapi.js";

// Builds the app (which runs module discovery/onInit and, as a side
// effect, populates the OpenAPI route registry) without binding a port,
// so codegen works offline / in CI without Postgres or Redis reachable —
// no module's onInit issues a query, only wires dependencies together.
await buildApp();

const document = buildOpenApiDocument();
const outPath = path.join(import.meta.dirname, "..", "openapi.json");
await writeFile(outPath, JSON.stringify(document, null, 2));
console.log(`Wrote ${outPath}`);

// Force exit — ioredis keeps retrying its connection in the background
// indefinitely if Redis isn't reachable, which would otherwise hang this
// one-off script forever.
process.exit(0);
