import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
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
    await sql`
      create table if not exists schema_migrations (
        id serial primary key,
        filename text not null unique,
        applied_at timestamptz not null default now()
      )
    `;

    const migrationDir = path.resolve("drizzle");
    const files = (await readdir(migrationDir))
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const already = await sql<{ filename: string }[]>`
        select filename from schema_migrations where filename = ${file} limit 1
      `;
      if (already.length > 0) {
        console.log(`Skipped: drizzle/${file}`);
        continue;
      }

      const migrationPath = path.join(migrationDir, file);
      const migrationSql = await readFile(migrationPath, "utf8");
      await sql.unsafe(migrationSql);
      await sql`insert into schema_migrations (filename) values (${file})`;
      console.log(`Migration applied: drizzle/${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
