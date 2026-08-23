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
  PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  PDF_MAX_CONCURRENT_RENDERS: z.coerce.number().int().min(1).max(16).default(2),
  PDF_MAX_QUEUED_RENDERS: z.coerce.number().int().min(0).max(100).default(10),
  PDF_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  PDF_HTML_MAX_BYTES: z.coerce.number().int().min(1_024).max(10 * 1024 * 1024).default(1_048_576),
  PDF_DEFAULT_FORMAT: z.enum(["A4", "Letter", "Legal"]).default("A4"),
  PDF_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(10),
  PDF_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  WEBHOOKS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  WEBHOOKS_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  WEBHOOKS_BACKOFF_BASE_SECONDS: z.coerce.number().int().min(1).max(3_600).default(10),
  WEBHOOKS_BACKOFF_MAX_SECONDS: z.coerce.number().int().min(1).max(86_400).default(3_600),
  WEBHOOKS_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(60_000).default(1_000),
  WEBHOOKS_MAX_CONCURRENT_DELIVERIES: z.coerce.number().int().min(1).max(64).default(5),
  WEBHOOKS_MAX_RESPONSE_BYTES: z.coerce.number().int().min(0).max(65_536).default(2_048),
  // Development escape hatch: lets webhook deliveries reach 127.0.0.1 and
  // other private addresses so the loop can be exercised without a tunnel.
  // Must stay false anywhere untrusted users can register endpoints — it
  // disables the SSRF address checks for this module.
  WEBHOOKS_ALLOW_PRIVATE_DESTINATIONS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
