import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().min(1).default("http://localhost:3000"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  DEFAULT_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(60),
  DEFAULT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  URL_SHORT_CODE_LENGTH: z.coerce.number().int().min(4).max(32).default(7),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
