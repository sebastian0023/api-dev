// Populates process.env from .env before anything (notably core/config.ts)
// reads it. A no-op if .env doesn't exist, which is the case in
// production, where real env vars are injected by the platform instead.
import "dotenv/config";
import { buildApp } from "./core/app.js";
import { config } from "./core/config.js";

const app = await buildApp();

app.listen(config.PORT, () => {
  console.log(`API listening on ${config.PUBLIC_URL}`);
  console.log(`Docs:            ${config.PUBLIC_URL}/docs`);
  console.log(`OpenAPI spec:    ${config.PUBLIC_URL}/openapi.json`);
});
