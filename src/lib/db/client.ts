import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { requireEnv } from "@/lib/env";
import * as schema from "@/lib/db/schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  jalaSql?: Sql;
  jalaDb?: DbClient;
};

export function getDb(): DbClient {
  if (globalForDb.jalaDb) return globalForDb.jalaDb;

  const connectionString = requireEnv("DATABASE_URL");
  const sql = postgres(connectionString, {
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(sql, { schema });
  globalForDb.jalaSql = sql;
  globalForDb.jalaDb = db;
  return db;
}
