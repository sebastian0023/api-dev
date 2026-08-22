import "dotenv/config";
import { spawn } from "node:child_process";

function deriveTestDatabaseUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.set("schema", "api_dev_url_test");
  return url.toString();
}

function deriveTestRedisUrl(value: string): string {
  const url = new URL(value);
  url.pathname = "/15";
  return url.toString();
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

const databaseUrl = process.env.TEST_DATABASE_URL ?? (process.env.DATABASE_URL && deriveTestDatabaseUrl(process.env.DATABASE_URL));
const redisUrl = process.env.TEST_REDIS_URL ?? (process.env.REDIS_URL && deriveTestRedisUrl(process.env.REDIS_URL));

if (!databaseUrl || !redisUrl) {
  throw new Error("DATABASE_URL and REDIS_URL are required to run integration tests");
}

const testEnv = { ...process.env, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl };
await run("npx", ["prisma", "migrate", "deploy"], testEnv);
await run("npx", ["tsx", "--test", "--test-concurrency=1", "tests/integration/**/*.test.ts", "tests/api/**/*.test.ts"], testEnv);
