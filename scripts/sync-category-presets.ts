import { config } from "dotenv";
import postgres from "postgres";
import { DEFAULT_CATEGORY_SEEDS } from "../src/lib/constants";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for category preset sync.");
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(new Set(keywords.map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

async function upsertCategoryPreset(preset: (typeof DEFAULT_CATEGORY_SEEDS)[number]): Promise<void> {
  const normalizedKeywords = normalizeKeywords(preset.keywords);
  const categoryRows = await sql<{ id: string }[]>`
    insert into categories (name, default_angle)
    values (${preset.name}, ${preset.defaultAngle}::message_angle)
    on conflict (name)
    do update set default_angle = excluded.default_angle
    returning id
  `;
  const categoryId = categoryRows[0]?.id;
  if (!categoryId) {
    throw new Error(`Failed to resolve category id for ${preset.name}`);
  }

  await sql`delete from keyword_packs where category_id = ${categoryId}::uuid`;
  await sql`
    insert into keyword_packs (category_id, keywords)
    values (${categoryId}::uuid, ${sql.array(normalizedKeywords)}::text[])
  `;
}

async function main() {
  try {
    for (const preset of DEFAULT_CATEGORY_SEEDS) {
      await upsertCategoryPreset(preset);
    }
    console.log(`Category preset sync complete. Updated ${DEFAULT_CATEGORY_SEEDS.length} categories.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Category preset sync failed:", error);
  process.exit(1);
});
