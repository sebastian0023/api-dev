import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./config.js";

// Prisma 7 requires an explicit driver adapter — PrismaClient() with no
// adapter throws at construction time.
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });

export const db = new PrismaClient({ adapter });
export type Db = typeof db;
