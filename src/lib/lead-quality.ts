import type { Lead } from "@/lib/types";

type LeadQualityInput = Pick<
  Lead,
  "business_name" | "website_url" | "facebook_url" | "phone" | "email" | "address" | "category_id" | "location_id"
>;

export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

function hasValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function computeLeadQualityScore(lead: LeadQualityInput): number {
  let score = 0;

  if (lead.business_name?.trim()) score += 14;
  if (lead.website_url?.trim()) score += 20;
  if (lead.facebook_url?.trim()) score += 16;
  if (normalizePhone(lead.phone).length >= 7) score += 14;
  if (hasValidEmail(lead.email)) score += 18;
  if (lead.address?.trim()) score += 10;
  if (lead.category_id) score += 4;
  if (lead.location_id) score += 4;

  // Extra confidence when at least two direct contact channels exist.
  const channels = [
    Boolean(lead.website_url?.trim()),
    Boolean(lead.facebook_url?.trim()),
    normalizePhone(lead.phone).length >= 7,
    hasValidEmail(lead.email),
  ].filter(Boolean).length;
  if (channels >= 2) score += 8;
  if (channels >= 3) score += 6;

  return Math.max(0, Math.min(100, score));
}

export function qualityTierFromScore(score: number): "High" | "Medium" | "Low" {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}
