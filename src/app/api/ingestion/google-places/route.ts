import { NextRequest, NextResponse } from "next/server";
import { getApiSessionUser } from "@/lib/auth";
import { enforceApiGuards, ensureCategoryAccess, jsonError } from "@/lib/api-helpers";
import { env } from "@/lib/env";
import { normalizeUrl } from "@/lib/utils";
import { googlePlacesSearchSchema } from "@/lib/validations";
import {
  bulkCreateLeadsWithStats,
  getLocationByIdForUser,
  getUserMarkedProspectingKeys,
  getCategories,
  insertLeadEnrichment,
  logOutreachEvent,
} from "@/lib/services/data-service";
import { enrichWebsiteContactData } from "@/lib/services/contact-enrichment";
import { buildProspectingMatchKey } from "@/lib/prospecting-match-key";

export const runtime = "nodejs";

type GooglePlacesResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
  }>;
  nextPageToken?: string;
};

type PreviewRow = {
  business_name: string | null;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  facebook_url: string | null;
  email: string | null;
  place_id: string | null;
  contact_checked: boolean;
  raw_json: Record<string, unknown>;
};

function normalizePhone(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function matchPreviewForLead(lead: {
  business_name: string | null;
  website_url: string | null;
  facebook_url: string | null;
  phone: string | null;
  address: string | null;
}): (row: PreviewRow) => boolean {
  const website = (lead.website_url ?? "").toLowerCase();
  const facebook = (lead.facebook_url ?? "").toLowerCase();
  const phone = normalizePhone(lead.phone);
  const business = (lead.business_name ?? "").trim().toLowerCase();
  const address = (lead.address ?? "").trim().toLowerCase();

  return (row) => {
    if (website && (row.website_url ?? "").toLowerCase() === website) return true;
    if (facebook && (row.facebook_url ?? "").toLowerCase() === facebook) return true;
    if (phone && normalizePhone(row.phone) === phone) return true;
    return Boolean(business) && (row.business_name ?? "").trim().toLowerCase() === business && (row.address ?? "").trim().toLowerCase() === address;
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchKeywordResults(
  keyword: string,
  locationName: string,
  targetCount: number,
): Promise<PreviewRow[]> {
  if (!env.GOOGLE_PLACES_API_KEY) return [];
  const results: PreviewRow[] = [];
  const textQuery = `${keyword} in ${locationName}`;
  let pageToken: string | undefined;
  const maxPages = Math.max(1, Math.min(10, Math.ceil(targetCount / 20)));

  for (let pageIndex = 0; pageIndex < maxPages && results.length < targetCount; pageIndex += 1) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,nextPageToken",
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 20,
        pageToken,
      }),
    });

    if (!response.ok) {
      const rawError = await response.text();
      if (rawError.includes("INVALID_ARGUMENT") && pageToken) {
        break;
      }
      throw new Error(`Google Places API failed: ${rawError}`);
    }

    const result = (await response.json()) as GooglePlacesResponse;
    for (const place of result.places ?? []) {
      const website = normalizeUrl(place.websiteUri ?? null);
      results.push({
        business_name: place.displayName?.text ?? null,
        address: place.formattedAddress ?? null,
        phone: place.nationalPhoneNumber ?? null,
        website_url: website,
        facebook_url: null,
        email: null,
        place_id: place.id ?? null,
        contact_checked: !website,
        raw_json: place as unknown as Record<string, unknown>,
      });
    }

    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  return results;
}

async function enrichPreviewRow(row: PreviewRow): Promise<PreviewRow> {
  if (!row.website_url) return { ...row, contact_checked: true };
  const contact = await enrichWebsiteContactData(row.website_url);
  return {
    ...row,
    facebook_url: contact.facebook_url,
    email: contact.email,
    contact_checked: true,
  };
}

function normalizeText(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function computeRelevanceScore(
  row: PreviewRow,
  keywords: string[],
  location: { name: string; city: string | null; region: string | null },
): number {
  let score = 0;
  const business = normalizeText(row.business_name);
  const address = normalizeText(row.address);
  const locationTokens = [location.name, location.city, location.region]
    .filter(Boolean)
    .map((value) => normalizeText(value));

  for (const keyword of keywords) {
    const key = normalizeText(keyword);
    if (!key) continue;
    if (business.includes(key)) score += 30;
    else if (address.includes(key)) score += 15;
  }

  for (const token of locationTokens) {
    if (address.includes(token)) score += 12;
    if (business.includes(token)) score += 8;
  }

  if (row.website_url) score += 4;
  if (row.phone) score += 3;
  return score;
}

function buildLocationCandidates(location: { name: string; city: string | null; region: string | null }): string[] {
  const raw = [location.name, location.city].filter((value): value is string => Boolean(value));
  const candidates = new Set<string>();

  for (const value of raw) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    candidates.add(normalized);

    const simplified = normalized
      .replace(/\b(city|municipality|municipal|province|prov\.)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (simplified && simplified.length >= 3) {
      candidates.add(simplified);
    }
  }

  return Array.from(candidates);
}

function isBroadRegionSelection(location: { name: string; city: string | null }): boolean {
  if (location.city) return false;
  const normalized = normalizeText(location.name);
  return normalized.includes("region");
}

function matchesSelectedLocation(
  row: PreviewRow,
  location: { name: string; city: string | null; region: string | null },
): boolean {
  if (isBroadRegionSelection(location)) return true;

  const candidates = buildLocationCandidates(location);
  if (!candidates.length) return true;

  const haystack = `${normalizeText(row.address)} ${normalizeText(row.business_name)}`;
  if (!haystack.trim()) return false;

  return candidates.some((candidate) => haystack.includes(candidate));
}

export async function POST(request: NextRequest) {
  const guard = await enforceApiGuards(request, { max: 14, windowMs: 60_000, bucket: "places-search", roles: ["ADMIN", "AGENT"] });
  if (guard) return guard;

  try {
    const user = await getApiSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!env.GOOGLE_PLACES_API_KEY) {
      return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured." }, { status: 400 });
    }

    const body = await request.json();
    const payload = googlePlacesSearchSchema.parse(body);
    const categoryGuard = ensureCategoryAccess(user, payload.category_id);
    if (categoryGuard) return categoryGuard;
    if (user.role === "AGENT" && payload.import_leads) {
      return NextResponse.json({ error: "Forbidden: agents cannot import leads." }, { status: 403 });
    }

    const [categories, location] = await Promise.all([
      getCategories(),
      getLocationByIdForUser({
        locationId: payload.location_id,
        userId: user.id,
        role: user.role,
      }),
    ]);
    const category = categories.find((item) => item.id === payload.category_id);

    if (!category || !location) {
      return NextResponse.json({ error: "Invalid category or location." }, { status: 400 });
    }

    const targetPerKeyword = Math.max(20, Math.ceil(payload.max_results / Math.max(1, payload.keywords.length)));
    const keywordRows = await mapWithConcurrency(
      payload.keywords,
      async (keyword) => fetchKeywordResults(keyword, location.name, targetPerKeyword),
      3,
    );
    const previews = keywordRows.flat();

    const unique = Array.from(new Map(previews.map((row) => [row.place_id ?? `${row.business_name}-${row.address}`, row])).values())
      .map((row) => ({
        row,
        relevance: computeRelevanceScore(row, payload.keywords, {
          name: location.name,
          city: location.city,
          region: location.region,
        }),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, payload.max_results)
      .map((item) => item.row);
    const strictMatched = unique.filter((row) =>
      matchesSelectedLocation(row, {
        name: location.name,
        city: location.city,
        region: location.region,
      }),
    );
    const scoped = strictMatched.slice(0, payload.max_results);
    const previewMatchKeys = scoped.map((item) => buildProspectingMatchKey(item));
    const markedSentKeys =
      user.role === "AGENT"
        ? await getUserMarkedProspectingKeys({
            user_id: user.id,
            category_id: payload.category_id,
            location_id: payload.location_id,
            match_keys: previewMatchKeys,
          })
        : [];

    if (!payload.import_leads) {
      return NextResponse.json({
        results: scoped,
        marked_sent_keys: markedSentKeys,
        imported: 0,
        filtered_out: Math.max(0, unique.length - scoped.length),
        generated_at: new Date().toISOString(),
      });
    }

    const enriched = await mapWithConcurrency(scoped, enrichPreviewRow, 5);
    const insertResult = await bulkCreateLeadsWithStats(
      enriched.map((item) => ({
        business_name: item.business_name,
        address: item.address,
        phone: item.phone,
        website_url: item.website_url,
        facebook_url: item.facebook_url,
        email: item.email,
        category_id: payload.category_id,
        location_id: payload.location_id,
        source: "google_places",
        status: "NEW",
      })),
    );
    const inserted = insertResult.inserted;

    await Promise.all(
      inserted.map((lead) => {
        const matched = enriched.find(matchPreviewForLead(lead));
        return insertLeadEnrichment({
          lead_id: lead.id,
          raw_json: {
            source: "google_places",
            category: category.name,
            location: location.name,
            place_id: matched?.place_id ?? null,
            raw: matched?.raw_json ?? {},
          },
          detected_keywords: payload.keywords,
        });
      }),
    );

    await Promise.all(
      inserted.map((lead) =>
        logOutreachEvent({
          lead_id: lead.id,
          event_type: "OPENED_LINK",
          metadata_json: { source: "google_places_import", imported_at: new Date().toISOString() },
        }),
      ),
    );

    return NextResponse.json({
      results: enriched,
      marked_sent_keys: markedSentKeys,
      imported: inserted.length,
      skipped_duplicates: insertResult.skippedDuplicates,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
