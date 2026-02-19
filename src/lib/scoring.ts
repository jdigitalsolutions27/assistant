import { clampScore } from "@/lib/utils";
import type { Lead, Location } from "@/lib/types";

export type HeuristicResult = {
  score: number;
  reasons: string[];
  detectedKeywords: string[];
  websiteHasForm: boolean | null;
};

async function readWebsiteContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        "User-Agent": "JALA/1.0 (+https://j-digital.local)",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function computeHeuristicScore(args: {
  lead: Lead;
  keywords: string[];
  location: Location | null;
}): Promise<HeuristicResult> {
  const { lead, keywords, location } = args;
  let score = 0;
  const reasons: string[] = [];

  const hasWebsite = Boolean(lead.website_url);
  const hasFacebook = Boolean(lead.facebook_url);
  const normalizedText = `${lead.business_name ?? ""} ${lead.address ?? ""}`.toLowerCase();

  let websiteHasForm: boolean | null = null;
  if (!hasWebsite && hasFacebook) {
    score += 30;
    reasons.push("No website detected, but active Facebook presence suggests immediate digital funnel gap (+30).");
  }

  if (hasWebsite && lead.website_url) {
    const html = await readWebsiteContent(lead.website_url);
    if (html) {
      const lower = html.toLowerCase();
      const hasFormTag = /<form[\s>]/.test(lower);
      const hasBookingOrContact = /(book now|reserve|appointment|contact us|inquire)/.test(lower);
      websiteHasForm = hasFormTag || hasBookingOrContact;
      if (!websiteHasForm) {
        score += 15;
        reasons.push("Website found but no obvious booking/contact flow (+15).");
      }
    } else {
      websiteHasForm = null;
      score += 10;
      reasons.push("Website could not be validated; possible discoverability or maintenance gap (+10).");
    }
  }

  const detectedKeywords = keywords.filter((kw) => normalizedText.includes(kw.toLowerCase()));
  if (detectedKeywords.length > 0) {
    score += 10;
    reasons.push("Service keywords match the target niche (+10).");
  }

  const locationNeedles = [location?.name, location?.city, location?.region]
    .filter(Boolean)
    .map((v) => (v as string).toLowerCase());
  const localMatch = locationNeedles.some((needle) => normalizedText.includes(needle));
  if (localMatch) {
    score += 10;
    reasons.push("Business aligns with selected local market (+10).");
  }

  return {
    score: clampScore(score),
    reasons,
    detectedKeywords,
    websiteHasForm,
  };
}
