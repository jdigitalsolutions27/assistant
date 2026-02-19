import type { MessageAngle, MessageLanguage, MessageTone } from "@/lib/types";

export const APP_NAME = "J-Digital AI Lead Assistant (JALA)";

export const DEFAULT_CATEGORY_SEEDS: Array<{
  name: string;
  defaultAngle: MessageAngle;
  keywords: string[];
}> = [
  {
    name: "Spa",
    defaultAngle: "booking",
    keywords: ["spa", "massage", "wellness", "relaxation", "facial"],
  },
  {
    name: "Salon",
    defaultAngle: "booking",
    keywords: ["salon", "haircut", "hair color", "blow dry", "beauty"],
  },
  {
    name: "Dental Clinic",
    defaultAngle: "booking",
    keywords: ["dental clinic", "dentist", "oral care", "teeth cleaning", "braces"],
  },
  {
    name: "Hotel",
    defaultAngle: "booking",
    keywords: ["hotel", "resort", "accommodation", "room booking", "inn"],
  },
  {
    name: "Restaurant",
    defaultAngle: "low_volume",
    keywords: ["restaurant", "dine in", "food", "cafe", "eatery"],
  },
  {
    name: "Fast Food",
    defaultAngle: "low_volume",
    keywords: ["fast food", "takeout", "quick service", "burger", "fried chicken"],
  },
  {
    name: "Construction",
    defaultAngle: "organization",
    keywords: ["construction", "contractor", "renovation", "builder", "civil works"],
  },
  {
    name: "Rental Services",
    defaultAngle: "organization",
    keywords: ["rental", "for rent", "equipment rental", "vehicle rental", "leasing"],
  },
];

export const DEFAULT_LOCATIONS = [
  {
    name: "Tacloban City",
    city: "Tacloban City",
    region: "Region 8",
    country: "Philippines",
  },
  {
    name: "Region 8",
    city: null,
    region: "Region 8",
    country: "Philippines",
  },
];

export const DEFAULT_LANGUAGES: MessageLanguage[] = ["Taglish", "English", "Waray"];
export const DEFAULT_TONES: MessageTone[] = ["Soft", "Direct", "Value-Focused"];
