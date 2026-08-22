import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { requestContext } from "./middleware/requestContext.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { loadModules, shutdownModules } from "./moduleLoader.js";
import { mountDocs } from "./openapi.js";
import { notFound } from "../shared/http/errors.js";

/**
 * Builds a fully wired Express app: middleware, every discovered module
 * (see moduleLoader.ts), generated docs, and the terminal error handler.
 * Exported (rather than started) so scripts/dumpOpenapi.ts can build the
 * app and read its spec without binding a port.
 */
export async function buildApp(): Promise<Express> {
  const app = express();

  app.disable("x-powered-by");
  // Swagger UI's bundled assets rely on inline <script>/<style> tags that
  // helmet's default Content-Security-Policy blocks — this is a
  // developer-facing docs surface, not a page rendering untrusted content,
  // so CSP is turned off rather than hand-tuned per asset.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(requestContext);

  app.get("/health", (_req, res) => res.ok({ status: "ok" }));

  const modules = await loadModules(app);
  app.locals.shutdown = () => shutdownModules(modules);

  mountDocs(app);

  app.use((req, _res, next) => {
    next(notFound(`No route for ${req.method} ${req.originalUrl}`));
  });

  app.use(errorHandler);

  return app;
}
