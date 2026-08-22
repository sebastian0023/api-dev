import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the CLI's connection URL (used by `migrate`/`studio`/etc.)
// out of schema.prisma's datasource block and into this file. The
// running app still configures its own connection via a driver adapter
// (@prisma/adapter-pg) in src/core/db.ts — this file only affects the CLI.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
