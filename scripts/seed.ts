import { config } from "dotenv";
import postgres from "postgres";
import { DEFAULT_CATEGORY_SEEDS, DEFAULT_LANGUAGES, DEFAULT_LOCATIONS, DEFAULT_TONES } from "../src/lib/constants";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for seeding.");
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

function buildTemplateText(category: string, language: string, tone: string): string {
  return [
    `Hi ${tone === "Direct" ? "" : "po "}this is Jay from J-Digital Solutions.`,
    `I saw ${category} businesses in your area and wanted to check if you're open to improving lead follow-up and bookings.`,
    "Quick question: how do you currently handle inquiries from Facebook and calls?",
    "We help local businesses organize leads and respond faster with less manual work.",
    "If useful, I can share a short idea tailored to your page.",
    `(${language})`,
  ].join(" ");
}

async function upsertCategories(): Promise<Map<string, string>> {
  const categoryMap = new Map<string, string>();
  for (const category of DEFAULT_CATEGORY_SEEDS) {
    const rows = await sql<{ id: string }[]>`
      insert into categories (name, default_angle)
      values (${category.name}, ${category.defaultAngle}::message_angle)
      on conflict (name)
      do update set default_angle = excluded.default_angle
      returning id
    `;
    categoryMap.set(category.name, rows[0].id);
  }
  return categoryMap;
}

async function upsertLocations(): Promise<void> {
  for (const location of DEFAULT_LOCATIONS) {
    await sql`
      insert into locations (name, city, region, country)
      values (${location.name}, ${location.city}, ${location.region}, ${location.country})
      on conflict (name)
      do update set city = excluded.city, region = excluded.region, country = excluded.country
    `;
  }
}

async function replaceKeywordPacks(categoryMap: Map<string, string>): Promise<void> {
  await sql`delete from keyword_packs`;
  for (const category of DEFAULT_CATEGORY_SEEDS) {
    const categoryId = categoryMap.get(category.name);
    if (!categoryId) continue;
    await sql`
      insert into keyword_packs (category_id, keywords)
      values (${categoryId}::uuid, ${sql.array(category.keywords)}::text[])
    `;
  }
}

async function replaceTemplates(categoryMap: Map<string, string>): Promise<void> {
  await sql`delete from message_templates`;
  for (const category of DEFAULT_CATEGORY_SEEDS) {
    const categoryId = categoryMap.get(category.name);
    if (!categoryId) continue;
    for (const language of DEFAULT_LANGUAGES) {
      for (const tone of DEFAULT_TONES) {
        await sql`
          insert into message_templates (category_id, language, tone, template_text)
          values (
            ${categoryId}::uuid,
            ${language}::message_language,
            ${tone}::message_tone,
            ${buildTemplateText(category.name, language, tone)}
          )
        `;
      }
    }
  }
}

async function upsertSettings(): Promise<void> {
  const settings = [
    {
      key: "scoring_weights",
      value: {
        heuristic: 0.45,
        ai: 0.55,
      },
    },
    { key: "enabled_languages", value: DEFAULT_LANGUAGES },
    { key: "enabled_tones", value: DEFAULT_TONES },
  ];

  for (const item of settings) {
    await sql`
      insert into app_settings (key, value_json)
      values (${item.key}, ${JSON.stringify(item.value)}::jsonb)
      on conflict (key)
      do update set value_json = excluded.value_json
    `;
  }
}

async function main() {
  try {
    await upsertLocations();
    const categoryMap = await upsertCategories();
    await replaceKeywordPacks(categoryMap);
    await replaceTemplates(categoryMap);
    await upsertSettings();
    console.log("Seed complete.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
