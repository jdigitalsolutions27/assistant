import { z } from "zod";

const emptyToUndefined = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}, z.string().optional());

const envSchema = z.object({
  OPENAI_API_KEY: emptyToUndefined,
  OPENAI_MODEL: z.preprocess((value) => (value === "" ? undefined : value), z.string().default("gpt-4.1-mini")),
  GOOGLE_PLACES_API_KEY: emptyToUndefined,
  ADMIN_PASSWORD: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(6).optional()),
  DATABASE_URL: emptyToUndefined,
  MAINTENANCE_API_KEY: emptyToUndefined,
  CRON_SECRET: emptyToUndefined,
});

const parsed = envSchema.safeParse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  DATABASE_URL: process.env.DATABASE_URL,
  MAINTENANCE_API_KEY: process.env.MAINTENANCE_API_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
});

if (!parsed.success) {
  // Do not throw during build; runtime handlers validate required vars by feature.
  console.warn("Environment validation warning:", parsed.error.flatten().fieldErrors);
}

export const env = parsed.success ? parsed.data : envSchema.parse({});

export function requireEnv(key: keyof typeof env): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}
