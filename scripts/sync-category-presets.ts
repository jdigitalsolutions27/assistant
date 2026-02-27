import { config } from "dotenv";
import postgres from "postgres";
import type { MessageAngle } from "../src/lib/types";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for category preset sync.");
}

type CategoryPreset = {
  name: string;
  defaultAngle: MessageAngle;
  keywords: string[];
};

const CATEGORY_PRESETS: CategoryPreset[] = [
  {
    name: "Auto Service",
    defaultAngle: "organization",
    keywords: ["auto repair", "car service", "mechanic", "change oil", "car maintenance", "auto shop", "wheel alignment", "battery replacement"],
  },
  {
    name: "Car Rental",
    defaultAngle: "booking",
    keywords: ["car rental", "rent a car", "self drive", "chauffeur service", "airport transfer", "vehicle rental", "daily car rental", "monthly car rental"],
  },
  {
    name: "Construction",
    defaultAngle: "organization",
    keywords: ["construction company", "contractor", "renovation", "design and build", "civil works", "house construction", "fit out", "general contractor"],
  },
  {
    name: "Dental Clinic",
    defaultAngle: "booking",
    keywords: ["dental clinic", "dentist", "teeth cleaning", "orthodontic", "braces", "tooth extraction", "dental care", "oral prophylaxis"],
  },
  {
    name: "Fast Food",
    defaultAngle: "low_volume",
    keywords: ["fast food", "takeout", "food delivery", "burger", "fried chicken", "quick service restaurant", "meal deals", "drive thru"],
  },
  {
    name: "Furniture",
    defaultAngle: "low_volume",
    keywords: ["furniture store", "sofa", "bed frame", "dining set", "office furniture", "custom furniture", "home furniture", "furniture shop"],
  },
  {
    name: "Gym Fitness",
    defaultAngle: "booking",
    keywords: ["gym", "fitness center", "personal trainer", "workout", "membership", "crossfit", "weight loss", "fitness studio"],
  },
  {
    name: "Hotel",
    defaultAngle: "booking",
    keywords: ["hotel", "room booking", "accommodation", "staycation", "inn", "business hotel", "family room", "hotel reservation"],
  },
  {
    name: "Medical Clinics",
    defaultAngle: "booking",
    keywords: ["medical clinic", "health clinic", "doctor consultation", "family medicine", "laboratory", "diagnostic clinic", "outpatient", "health services"],
  },
  {
    name: "Real State",
    defaultAngle: "organization",
    keywords: ["real estate", "property for sale", "condo for sale", "house and lot", "realty", "broker", "property listing", "property management"],
  },
  {
    name: "Rental Services",
    defaultAngle: "low_volume",
    keywords: ["rental services", "equipment rental", "party rental", "for rent", "leasing", "vehicle rental", "machine rental", "event rental"],
  },
  {
    name: "Resort",
    defaultAngle: "booking",
    keywords: ["resort", "beach resort", "private resort", "overnight stay", "resort booking", "villa rental", "swimming resort", "holiday resort"],
  },
  {
    name: "Restaurant",
    defaultAngle: "low_volume",
    keywords: ["restaurant", "dine in", "food delivery", "menu", "table reservation", "cafe", "family restaurant", "eatery"],
  },
  {
    name: "Salon",
    defaultAngle: "booking",
    keywords: ["salon", "haircut", "hair color", "keratin treatment", "rebond", "beauty salon", "nail salon", "blow dry"],
  },
  {
    name: "Spa",
    defaultAngle: "booking",
    keywords: ["spa", "massage", "wellness", "facial", "body scrub", "relaxation", "spa treatment", "therapeutic massage"],
  },
  {
    name: "Aesthetic Clinic",
    defaultAngle: "booking",
    keywords: ["aesthetic clinic", "skin clinic", "derma clinic", "facial treatment", "laser treatment", "botox", "skin rejuvenation", "beauty clinic"],
  },
  {
    name: "Veterinary Clinic",
    defaultAngle: "booking",
    keywords: ["veterinary clinic", "vet clinic", "animal hospital", "pet checkup", "pet grooming", "pet vaccination", "pet wellness", "veterinarian"],
  },
  {
    name: "Law Firm",
    defaultAngle: "organization",
    keywords: ["law firm", "attorney", "legal services", "notary public", "legal consultation", "corporate lawyer", "litigation", "legal office"],
  },
  {
    name: "Accounting & Tax Services",
    defaultAngle: "organization",
    keywords: ["accounting services", "bookkeeping", "tax filing", "payroll services", "auditing", "cpa firm", "business registration", "financial reporting"],
  },
  {
    name: "Insurance Agency",
    defaultAngle: "low_volume",
    keywords: ["insurance agency", "life insurance", "car insurance", "health insurance", "insurance advisor", "insurance broker", "policy renewal", "insurance quote"],
  },
  {
    name: "Home Services",
    defaultAngle: "low_volume",
    keywords: ["plumbing services", "electrical services", "aircon repair", "pest control", "cleaning services", "home maintenance", "appliance repair", "handyman"],
  },
  {
    name: "Travel Agency",
    defaultAngle: "booking",
    keywords: ["travel agency", "tour package", "visa assistance", "flight booking", "ticketing", "holiday package", "travel and tours", "travel services"],
  },
  {
    name: "Event Services",
    defaultAngle: "organization",
    keywords: ["event planner", "wedding coordinator", "catering services", "event styling", "photo and video", "corporate events", "party organizer", "event management"],
  },
];

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(new Set(keywords.map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

async function upsertCategoryPreset(preset: CategoryPreset): Promise<void> {
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
    for (const preset of CATEGORY_PRESETS) {
      await upsertCategoryPreset(preset);
    }
    console.log(`Category preset sync complete. Updated ${CATEGORY_PRESETS.length} categories.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Category preset sync failed:", error);
  process.exit(1);
});
