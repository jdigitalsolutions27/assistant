import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for migrations.");
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });

  try {
    const migrationPath = path.resolve("drizzle/0000_init.sql");
    const migrationSql = await readFile(migrationPath, "utf8");
    await sql.unsafe(migrationSql);
    console.log("Migration applied: drizzle/0000_init.sql");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
