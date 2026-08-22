// Populates process.env from .env before anything (notably core/config.ts)
// reads it. A no-op if .env doesn't exist, which is the case in
// production, where real env vars are injected by the platform instead.
import "dotenv/config";
import { buildApp } from "./core/app.js";
import { config } from "./core/config.js";
import { db } from "./core/db.js";
import { redis } from "./core/redis.js";

const app = await buildApp();

const server = app.listen(config.PORT, () => {
  console.log(`API listening on ${config.PUBLIC_URL}`);
  console.log(`Docs:            ${config.PUBLIC_URL}/docs`);
  console.log(`OpenAPI spec:    ${config.PUBLIC_URL}/openapi.json`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await app.locals.shutdown?.();
  await db.$disconnect();
  redis.disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
