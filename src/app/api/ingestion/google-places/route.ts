import { Country } from "country-state-city";
import { NextRequest, NextResponse } from "next/server";
import { getApiSessionUser } from "@/lib/auth";
import { enforceApiGuards, ensureCategoryAccess, jsonError } from "@/lib/api-helpers";
import { evaluateContactVerification, type ContactConfidence, type ContactVerification } from "@/lib/contact-verification";
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

type GeoapifyGeocodeResponse = {
  results?: Array<{
    place_id?: string;
    lat?: number;
    lon?: number;
    bbox?: {
      lon1?: number;
      lat1?: number;
      lon2?: number;
      lat2?: number;
    };
  }>;
};

type GeoapifyPlacesResponse = {
  features?: Array<{
    properties?: {
      name?: string;
      formatted?: string;
      place_id?: string;
      city?: string;
      state?: string;
      country?: string;
      categories?: string[];
    };
  }>;
};

type GeoapifyPlaceDetailsResponse = {
  features?: Array<{
    properties?: {
      feature_type?: string;
      website?: string;
      website_other?: string[];
      contact?: {
        phone?: string;
        email?: string;
      };
      formatted?: string;
      name?: string;
    };
  }>;
};

type FoursquarePlacesResponse = {
  results?: Array<{
    fsq_id?: string;
    name?: string;
    tel?: string;
    website?: string;
    email?: string;
    location?: {
      formatted_address?: string;
    };
  }>;
};

type GoogleApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      reason?: string;
      metadata?: Record<string, string>;
    }>;
  };
};

type GeoapifyErrorPayload = {
  statusCode?: number;
  error?: string;
  message?: string;
};

type PreviewRow = {
  business_name: string | null;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  facebook_url: string | null;
  email: string | null;
  place_id: string | null;
  contact_verification: ContactVerification;
  contact_checked: boolean;
  raw_json: Record<string, unknown>;
};

type OfferMode = "launch" | "rebuild" | "all";
type FacebookConfidenceMin = "none" | "medium" | "high";
type ProspectingProvider = "google" | "foursquare" | "geoapify";
type SearchProviderResult = {
  rows: PreviewRow[];
  provider: ProspectingProvider;
};

const GEOAPIFY_CATEGORY_MAP: Record<string, string[]> = {
  "auto service": ["service", "commercial"],
  "car rental": ["rental", "service"],
  construction: ["service", "commercial"],
  "dental clinic": ["healthcare"],
  "fast food": ["catering"],
  furniture: ["commercial"],
  "gym fitness": ["sport", "service"],
  hotel: ["accommodation"],
  "medical clinics": ["healthcare"],
  "real state": ["commercial", "service"],
  "rental services": ["rental", "service"],
  resort: ["accommodation"],
  restaurant: ["catering"],
  salon: ["service", "commercial"],
  spa: ["service", "commercial"],
};

const GEOAPIFY_SCOPE_CACHE_TTL_MS = 10 * 60 * 1000;
const geoapifyScopeCache = new Map<
  string,
  {
    expiresAt: number;
    value:
      | {
          placeId: string;
          lat: number | null;
          lon: number | null;
          bbox: { lon1: number; lat1: number; lon2: number; lat2: number } | null;
        }
      | null;
  }
>();

function normalizePhone(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function getGooglePlacesApiKey(): string | null {
  const value = env.GOOGLE_PLACES_API_KEY?.trim();
  return value ? value : null;
}

function getGeoapifyApiKey(): string | null {
  const value = env.GEOAPIFY_API_KEY?.trim();
  return value ? value : null;
}

function getFoursquareApiKey(): string | null {
  const value = env.FOURSQUARE_API_KEY?.trim();
  return value ? value : null;
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

function buildSearchLocationText(location: { name: string; city: string | null; region: string | null; country: string | null }): string {
  const tokens = [location.city, location.name, location.region, location.country]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(tokens)).join(", ");
}

function resolveCountryCode(countryName: string | null): string | null {
  if (!countryName) return null;
  const normalized = countryName.trim().toLowerCase();
  const country = Country.getAllCountries().find((item) => item.name.trim().toLowerCase() === normalized);
  return country?.isoCode.toLowerCase() ?? null;
}

function resolveGeoapifyCategories(categoryName: string): string[] {
  const normalized = categoryName.trim().toLowerCase();
  return GEOAPIFY_CATEGORY_MAP[normalized] ?? ["service", "commercial"];
}

function parseGoogleApiError(rawError: string): GoogleApiErrorPayload | null {
  try {
    return JSON.parse(rawError) as GoogleApiErrorPayload;
  } catch {
    return null;
  }
}

function extractGoogleProjectId(parsed: GoogleApiErrorPayload | null, rawError: string): string | null {
  const metadataCandidates = parsed?.error?.details?.flatMap((detail) => Object.values(detail.metadata ?? {})) ?? [];
  for (const value of metadataCandidates) {
    const match = value.match(/projects\/(\d+)/i);
    if (match) return match[1];
  }

  const textMatch = rawError.match(/project[#:/ ]+(\d{6,})/i) ?? rawError.match(/projects\/(\d{6,})/i);
  return textMatch?.[1] ?? null;
}

function toGooglePlacesErrorMessage(rawError: string): string {
  const parsed = parseGoogleApiError(rawError);
  const status = (parsed?.error?.status ?? "").toUpperCase();
  const message = parsed?.error?.message ?? rawError;
  const reasonText = (parsed?.error?.details?.map((detail) => detail.reason ?? "").join(" ") ?? "").toUpperCase();
  const projectId = extractGoogleProjectId(parsed, rawError);
  const projectLabel = projectId ? ` for Google Cloud project ${projectId}` : "";

  if (status.includes("PERMISSION_DENIED") && (reasonText.includes("BILLING_DISABLED") || message.toUpperCase().includes("BILLING"))) {
    return `Google Places API billing is disabled${projectLabel}. Enable billing in Google Cloud Console, wait a few minutes, then try again.`;
  }

  if (reasonText.includes("SERVICE_DISABLED") || message.toUpperCase().includes("HAS NOT BEEN USED IN PROJECT")) {
    return `Google Places API (New) is not enabled${projectLabel}. Enable the API in Google Cloud Console, wait a few minutes, then try again.`;
  }

  if (status.includes("INVALID_ARGUMENT") && message.toUpperCase().includes("API KEY")) {
    return "GOOGLE_PLACES_API_KEY is invalid. Generate a valid server-side key for Places API (New) and update the environment variable.";
  }

  if (status.includes("REQUEST_DENIED") || message.toUpperCase().includes("API KEY") || message.toUpperCase().includes("REFERER")) {
    return "Google Places API key restrictions are blocking this request. Allow Places API (New) for server-side usage or relax the current key restrictions.";
  }

  if (status.includes("RESOURCE_EXHAUSTED") || message.toUpperCase().includes("QUOTA")) {
    return `Google Places API quota has been exceeded${projectLabel}. Increase quota or wait for the quota window to reset, then try again.`;
  }

  return `Google Places search failed. ${message.split("\n")[0].trim()}`;
}

function parseGeoapifyError(rawError: string): GeoapifyErrorPayload | null {
  try {
    return JSON.parse(rawError) as GeoapifyErrorPayload;
  } catch {
    return null;
  }
}

function toGeoapifyErrorMessage(rawError: string, context: "geocoding" | "places" | "details"): string {
  const parsed = parseGeoapifyError(rawError);
  const message = parsed?.message?.trim() || parsed?.error?.trim() || rawError.trim();
  const statusCode = parsed?.statusCode ?? 0;

  if (statusCode === 401 || message.toLowerCase().includes("invalid apikey")) {
    return "Geoapify API key is invalid or malformed. Update GEOAPIFY_API_KEY and redeploy.";
  }

  if (statusCode === 403) {
    return "Geoapify rejected the request. Check API key restrictions or project access settings.";
  }

  if (statusCode === 429) {
    return "Geoapify free quota is currently exhausted. Wait for the quota window to reset, then try again.";
  }

  if (context === "geocoding") {
    return `Geoapify location lookup failed. ${message}`;
  }

  if (context === "places") {
    return `Geoapify places search failed. ${message}`;
  }

  return `Geoapify place details lookup failed. ${message}`;
}

function shouldFallbackToGeoapify(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("google places api billing is disabled") ||
    message.includes("google places api (new) is not enabled") ||
    message.includes("google places api key restrictions are blocking") ||
    message.includes("google places api quota has been exceeded") ||
    message.includes("google places search failed")
  );
}

function buildGeoapifyFilter(scope: {
  placeId: string;
  lat: number | null;
  lon: number | null;
  bbox: { lon1: number; lat1: number; lon2: number; lat2: number } | null;
}): string {
  if (scope.bbox) {
    return `rect:${scope.bbox.lon1},${scope.bbox.lat1},${scope.bbox.lon2},${scope.bbox.lat2}`;
  }
  if (scope.lon !== null && scope.lat !== null) {
    return `circle:${scope.lon},${scope.lat},15000`;
  }
  return `place:${scope.placeId}`;
}

async function fetchFoursquareKeywordResults(
  keyword: string,
  location: { name: string; city: string | null; region: string | null; country: string | null },
  targetCount: number,
): Promise<PreviewRow[]> {
  const foursquareApiKey = getFoursquareApiKey();
  if (!foursquareApiKey) return [];

  const params = new URLSearchParams({
    query: keyword.trim(),
    near: buildSearchLocationText(location),
    limit: String(Math.min(Math.max(targetCount, 20), 50)),
    fields: "name,location,website,tel,email",
  });

  const response = await fetch(`https://places-api.foursquare.com/places/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${foursquareApiKey}`,
      Accept: "application/json",
      "X-Places-Api-Version": "2025-06-17",
    },
  });

  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(`Foursquare places search failed. ${rawError.slice(0, 200)}`);
  }

  const result = (await response.json()) as FoursquarePlacesResponse;
  return (result.results ?? []).map((item) => {
    const website = normalizeUrl(item.website ?? null);
    return {
      business_name: item.name ?? null,
      address: item.location?.formatted_address ?? null,
      phone: item.tel ?? null,
      website_url: website,
      facebook_url: null,
      email: item.email ?? null,
      place_id: item.fsq_id ? `foursquare:${item.fsq_id}` : null,
      contact_verification: evaluateContactVerification({
        email: item.email ?? null,
        facebook_url: null,
        phone: item.tel ?? null,
        website_url: website,
      }),
      contact_checked: true,
      raw_json: {
        provider: "foursquare",
        place: item,
      },
    } satisfies PreviewRow;
  });
}

async function fetchGoogleKeywordResults(
  keyword: string,
  location: { name: string; city: string | null; region: string | null; country: string | null },
  targetCount: number,
): Promise<PreviewRow[]> {
  const googleApiKey = getGooglePlacesApiKey();
  if (!googleApiKey) return [];
  const results: PreviewRow[] = [];
  const locationText = buildSearchLocationText(location);
  const textQuery = locationText ? `${keyword} in ${locationText}` : keyword;
  let pageToken: string | undefined;
  const maxPages = Math.max(1, Math.min(10, Math.ceil(targetCount / 20)));

  for (let pageIndex = 0; pageIndex < maxPages && results.length < targetCount; pageIndex += 1) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
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
      throw new Error(toGooglePlacesErrorMessage(rawError));
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
        contact_verification: evaluateContactVerification({
          email: null,
          facebook_url: null,
          phone: place.nationalPhoneNumber ?? null,
          website_url: website,
        }),
        contact_checked: !website,
        raw_json: place as unknown as Record<string, unknown>,
      });
    }

    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  return results;
}

async function resolveGeoapifyPlaceScope(location: {
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
}): Promise<{ placeId: string; lat: number | null; lon: number | null; bbox: { lon1: number; lat1: number; lon2: number; lat2: number } | null } | null> {
  const geoapifyApiKey = getGeoapifyApiKey();
  if (!geoapifyApiKey) return null;

  const locationText = buildSearchLocationText(location);
  if (!locationText) return null;
  const cacheKey = locationText.toLowerCase();
  const cached = geoapifyScopeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const params = new URLSearchParams({
    text: locationText,
    format: "json",
    limit: "1",
    apiKey: geoapifyApiKey,
  });

  const countryCode = resolveCountryCode(location.country);
  if (countryCode) {
    params.set("filter", `countrycode:${countryCode}`);
  }

  const response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`);
  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(toGeoapifyErrorMessage(rawError, "geocoding"));
  }

  const result = (await response.json()) as GeoapifyGeocodeResponse;
  const first = result.results?.[0];
  if (!first?.place_id) {
    geoapifyScopeCache.set(cacheKey, { expiresAt: Date.now() + GEOAPIFY_SCOPE_CACHE_TTL_MS, value: null });
    return null;
  }

  const value = {
    placeId: first.place_id,
    lat: first.lat ?? null,
    lon: first.lon ?? null,
    bbox:
      typeof first.bbox?.lon1 === "number" &&
      typeof first.bbox?.lat1 === "number" &&
      typeof first.bbox?.lon2 === "number" &&
      typeof first.bbox?.lat2 === "number"
        ? {
            lon1: first.bbox.lon1,
            lat1: first.bbox.lat1,
            lon2: first.bbox.lon2,
            lat2: first.bbox.lat2,
          }
        : null,
  };
  geoapifyScopeCache.set(cacheKey, { expiresAt: Date.now() + GEOAPIFY_SCOPE_CACHE_TTL_MS, value });
  return value;
}

async function fetchGeoapifyPlaceDetails(placeId: string): Promise<{
  website_url: string | null;
  phone: string | null;
  email: string | null;
}> {
  const geoapifyApiKey = getGeoapifyApiKey();
  if (!geoapifyApiKey) {
    return { website_url: null, phone: null, email: null };
  }

  const params = new URLSearchParams({
    id: placeId,
    features: "details",
    apiKey: geoapifyApiKey,
  });
  const response = await fetch(`https://api.geoapify.com/v2/place-details?${params.toString()}`);
  if (!response.ok) {
    return { website_url: null, phone: null, email: null };
  }

  const result = (await response.json()) as GeoapifyPlaceDetailsResponse;
  const details =
    result.features?.find((feature) => feature.properties?.feature_type === "details")?.properties ??
    result.features?.[0]?.properties;

  const website = normalizeUrl(details?.website ?? details?.website_other?.[0] ?? null);
  return {
    website_url: website,
    phone: details?.contact?.phone ?? null,
    email: details?.contact?.email ?? null,
  };
}

function extractGeoapifyPlaceId(row: PreviewRow): string | null {
  if (!row.place_id?.startsWith("geoapify:")) return null;
  return row.place_id.slice("geoapify:".length);
}

async function enrichGeoapifyPreviewRow(row: PreviewRow): Promise<PreviewRow> {
  const placeId = extractGeoapifyPlaceId(row);
  if (!placeId) return row;

  const details = await fetchGeoapifyPlaceDetails(placeId);
  const website = details.website_url ?? row.website_url;
  const phone = details.phone ?? row.phone;
  const email = details.email ?? row.email;

  return {
    ...row,
    website_url: website,
    phone,
    email,
    contact_checked: true,
    contact_verification: evaluateContactVerification({
      email,
      facebook_url: row.facebook_url,
      phone,
      website_url: website,
    }),
    raw_json: {
      ...row.raw_json,
      detail_contact: details,
    },
  };
}

async function enrichTopGeoapifyRows(rows: PreviewRow[], maxToEnrich: number): Promise<PreviewRow[]> {
  if (maxToEnrich <= 0 || rows.length === 0) return rows;
  const limit = Math.min(rows.length, maxToEnrich);
  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);
  const enrichedHead = await mapWithConcurrency(head, enrichGeoapifyPreviewRow, 8);
  return [...enrichedHead, ...tail];
}

async function fetchGeoapifyKeywordResults(
  keyword: string,
  categoryName: string,
  location: { name: string; city: string | null; region: string | null; country: string | null },
  targetCount: number,
): Promise<PreviewRow[]> {
  const geoapifyApiKey = getGeoapifyApiKey();
  if (!geoapifyApiKey) return [];
  const scope = await resolveGeoapifyPlaceScope(location);
  if (!scope?.placeId) {
    throw new Error("Geoapify could not resolve the selected location. Try a more specific city or municipality.");
  }

  const categories = resolveGeoapifyCategories(categoryName).join(",");
  const pageSize = 50;
  const maxPages = Math.max(1, Math.min(10, Math.ceil(targetCount / pageSize)));
  const collected: GeoapifyPlacesResponse["features"] = [];
  const filter = buildGeoapifyFilter(scope);

  for (let pageIndex = 0; pageIndex < maxPages && (collected?.length ?? 0) < targetCount; pageIndex += 1) {
    const params = new URLSearchParams({
      categories,
      filter,
      limit: String(pageSize),
      offset: String(pageIndex * pageSize),
      apiKey: geoapifyApiKey,
    });
    if (scope.lat !== null && scope.lon !== null) {
      params.set("bias", `proximity:${scope.lon},${scope.lat}`);
    }

    const response = await fetch(`https://api.geoapify.com/v2/places?${params.toString()}`);
    if (!response.ok) {
      const rawError = await response.text();
      throw new Error(toGeoapifyErrorMessage(rawError, "places"));
    }

    const result = (await response.json()) as GeoapifyPlacesResponse;
    const features = result.features ?? [];
    collected.push(...features);
    if (features.length < pageSize) break;
  }

  const sliced = collected.slice(0, targetCount);
  return sliced.map((feature) => {
    const properties = feature.properties ?? {};
    const placeId = properties.place_id ?? null;
    return {
      business_name: properties.name ?? null,
      address: properties.formatted ?? null,
      phone: null,
      website_url: null,
      facebook_url: null,
      email: null,
      place_id: placeId ? `geoapify:${placeId}` : null,
      contact_verification: evaluateContactVerification({
        email: null,
        facebook_url: null,
        phone: null,
        website_url: null,
      }),
      contact_checked: false,
      raw_json: {
        provider: "geoapify",
        properties,
        keyword,
      } satisfies Record<string, unknown>,
    } satisfies PreviewRow;
  });
}

async function fetchKeywordResults(
  keyword: string,
  categoryName: string,
  location: { name: string; city: string | null; region: string | null; country: string | null },
  targetCount: number,
): Promise<SearchProviderResult> {
  if (getGooglePlacesApiKey()) {
    try {
      const rows = await fetchGoogleKeywordResults(keyword, location, targetCount);
      return { rows, provider: "google" };
    } catch (error) {
      if (!shouldFallbackToGeoapify(error)) {
        throw error;
      }
    }
  }

  if (getFoursquareApiKey()) {
    const rows = await fetchFoursquareKeywordResults(keyword, location, targetCount);
    return { rows, provider: "foursquare" };
  }

  if (getGeoapifyApiKey()) {
    const rows = await fetchGeoapifyKeywordResults(keyword, categoryName, location, targetCount);
    return { rows, provider: "geoapify" };
  }

  throw new Error("No places provider is configured. Add GOOGLE_PLACES_API_KEY, FOURSQUARE_API_KEY, or GEOAPIFY_API_KEY.");
}

async function enrichPreviewRow(row: PreviewRow): Promise<PreviewRow> {
  if (!row.website_url) {
    return {
      ...row,
      contact_verification: evaluateContactVerification({
        email: row.email,
        facebook_url: row.facebook_url,
        phone: row.phone,
        website_url: row.website_url,
      }),
      contact_checked: true,
    };
  }
  const contact = await enrichWebsiteContactData(row.website_url);
  return {
    ...row,
    facebook_url: contact.facebook_url ?? row.facebook_url,
    email: contact.email ?? row.email,
    contact_verification: evaluateContactVerification({
      email: contact.email ?? row.email,
      facebook_url: contact.facebook_url ?? row.facebook_url,
      phone: row.phone,
      website_url: row.website_url,
    }),
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

function hasTokenAsPhrase(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i");
  return pattern.test(haystack);
}

function parseLocationScope(location: { name: string; city: string | null; region: string | null }): {
  locality: string[];
  province: string[];
} {
  const locality = new Set<string>();
  const province = new Set<string>();
  const normalizedName = normalizeText(location.name);

  if (location.city) {
    locality.add(normalizeText(location.city));
  }

  if (normalizedName.includes(",")) {
    const [first, second] = normalizedName.split(",").map((part) => part.trim());
    if (first) locality.add(first);
    if (second) province.add(second);
  } else if (normalizedName) {
    locality.add(normalizedName);
  }

  for (const token of Array.from(locality)) {
    const simplified = token.replace(/\b(city|municipality|municipal)\b/g, " ").replace(/\s+/g, " ").trim();
    if (simplified && simplified.length >= 3) locality.add(simplified);
  }
  for (const token of Array.from(province)) {
    const simplified = token.replace(/\b(province|prov\.)\b/g, " ").replace(/\s+/g, " ").trim();
    if (simplified && simplified.length >= 3) province.add(simplified);
  }

  return {
    locality: Array.from(locality).filter(Boolean),
    province: Array.from(province).filter(Boolean),
  };
}

function parseCountryScope(country: string | null): string[] {
  const normalized = normalizeText(country);
  if (!normalized) return [];
  const items = new Set<string>([normalized]);
  if (normalized === "philippines") {
    items.add("philippine");
    items.add("ph");
  }
  if (normalized === "united states" || normalized === "united states of america") {
    items.add("usa");
    items.add("us");
    items.add("u.s.");
  }
  if (normalized === "united kingdom") {
    items.add("uk");
    items.add("u.k.");
    items.add("great britain");
  }
  return Array.from(items);
}

function isBroadRegionSelection(location: { name: string; city: string | null }): boolean {
  if (location.city) return false;
  const normalized = normalizeText(location.name);
  return normalized.includes("region");
}

function matchesSelectedLocation(
  row: PreviewRow,
  location: { name: string; city: string | null; region: string | null; country: string | null },
): boolean {
  const address = normalizeText(row.address);
  if (!address) return false;

  if (isBroadRegionSelection(location)) {
    return true;
  }

  const countryCandidates = parseCountryScope(location.country);
  if (countryCandidates.length > 0) {
    const countryMatched = countryCandidates.some((candidate) => hasTokenAsPhrase(address, candidate));
    if (!countryMatched) return false;
  }

  const scope = parseLocationScope(location);
  const fallbackCandidates = buildLocationCandidates(location);
  const localityCandidates = scope.locality.length > 0 ? scope.locality : fallbackCandidates;
  if (localityCandidates.length === 0) return true;

  const localityMatched = localityCandidates.some((candidate) => hasTokenAsPhrase(address, candidate));
  if (!localityMatched) return false;

  if (scope.province.length > 0) {
    const provinceMatched = scope.province.some((candidate) => hasTokenAsPhrase(address, candidate));
    if (!provinceMatched) return false;
  }

  return true;
}

function matchesSelectedLocationRelaxed(
  row: PreviewRow,
  location: { name: string; city: string | null; region: string | null; country: string | null },
): boolean {
  if (isBroadRegionSelection(location)) return true;

  const address = normalizeText(row.address);
  const business = normalizeText(row.business_name);
  const haystack = `${address} ${business}`.trim();
  if (!haystack) return false;

  const localityCandidates = buildLocationCandidates(location);
  if (localityCandidates.length > 0) {
    const localityMatched = localityCandidates.some((candidate) => hasTokenAsPhrase(haystack, candidate));
    if (!localityMatched) return false;
  }

  const countryCandidates = parseCountryScope(location.country);
  if (countryCandidates.length > 0) {
    const countryMatched = countryCandidates.some((candidate) => hasTokenAsPhrase(haystack, candidate));
    if (!countryMatched) return false;
  }

  return true;
}

function matchesOfferMode(row: PreviewRow, offerMode: OfferMode): boolean {
  if (offerMode === "all") return true;
  const hasWebsite = Boolean(row.website_url?.trim());
  if (offerMode === "launch") return !hasWebsite;
  return hasWebsite;
}

async function selectStrictFacebookLeads(rows: PreviewRow[], maxResults: number): Promise<{
  selected: PreviewRow[];
  filteredOutByFacebook: number;
  filteredOutByFacebookConfidence: number;
}> {
  if (!rows.length || maxResults <= 0) {
    return { selected: [], filteredOutByFacebook: rows.length, filteredOutByFacebookConfidence: 0 };
  }

  const scanCap = Math.min(rows.length, Math.max(maxResults * 4, 180));
  const scanPool = rows.slice(0, scanCap);
  const withoutFacebook = scanPool.filter((row) => !row.facebook_url && Boolean(row.website_url));
  const websiteEnriched = withoutFacebook.length > 0 ? await mapWithConcurrency(withoutFacebook, enrichPreviewRow, 6) : [];
  const enrichedByKey = new Map(
    websiteEnriched.map((row) => [
      `${row.place_id ?? ""}|${row.business_name ?? ""}|${row.address ?? ""}|${row.website_url ?? ""}`,
      row,
    ]),
  );

  const resolved = scanPool.map((row) => {
    if (row.facebook_url || !row.website_url) return row;
    const key = `${row.place_id ?? ""}|${row.business_name ?? ""}|${row.address ?? ""}|${row.website_url ?? ""}`;
    return enrichedByKey.get(key) ?? row;
  });

  const selected = resolved.filter((row) => Boolean(row.facebook_url)).slice(0, maxResults);
  return {
    selected,
    filteredOutByFacebook: Math.max(0, scanPool.length - resolved.filter((row) => Boolean(row.facebook_url)).length),
    filteredOutByFacebookConfidence: 0,
  };
}

function facebookConfidenceRank(value: ContactConfidence | null | undefined): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function filterByFacebookConfidence(rows: PreviewRow[], minConfidence: FacebookConfidenceMin): {
  selected: PreviewRow[];
  filteredOut: number;
} {
  if (minConfidence === "none") return { selected: rows, filteredOut: 0 };
  const requiredRank = minConfidence === "high" ? 3 : 2;
  const selected = rows.filter((row) => facebookConfidenceRank(row.contact_verification?.facebook_confidence) >= requiredRank);
  return {
    selected,
    filteredOut: Math.max(0, rows.length - selected.length),
  };
}

export async function POST(request: NextRequest) {
  const guard = await enforceApiGuards(request, { max: 14, windowMs: 60_000, bucket: "places-search", roles: ["ADMIN", "AGENT"] });
  if (guard) return guard;

  try {
    const user = await getApiSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!getGooglePlacesApiKey() && !getFoursquareApiKey() && !getGeoapifyApiKey()) {
      return NextResponse.json(
        { error: "No places provider is configured. Add GOOGLE_PLACES_API_KEY, FOURSQUARE_API_KEY, or GEOAPIFY_API_KEY." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const payload = googlePlacesSearchSchema.parse(body);
    const categoryGuard = ensureCategoryAccess(user, payload.category_id);
    if (categoryGuard) return categoryGuard;
    const effectiveOfferMode: OfferMode = user.role === "ADMIN" ? payload.offer_mode : "all";
    const requireFacebook = user.role === "ADMIN" ? payload.require_facebook : false;
    const facebookConfidenceMin: FacebookConfidenceMin = user.role === "ADMIN" ? payload.facebook_confidence_min : "none";
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
    const keywordResults = await mapWithConcurrency(
      payload.keywords,
      async (keyword) =>
        fetchKeywordResults(
          keyword,
          category?.name ?? "",
          {
            name: location.name,
            city: location.city,
            region: location.region,
            country: location.country,
          },
          targetPerKeyword,
        ),
      3,
    );
    const providerUsed: ProspectingProvider =
      keywordResults.some((item) => item.provider === "geoapify") && !keywordResults.every((item) => item.provider === "google")
        ? "geoapify"
        : keywordResults.some((item) => item.provider === "foursquare") && !keywordResults.every((item) => item.provider === "google")
          ? "foursquare"
          : (keywordResults[0]?.provider ?? (getFoursquareApiKey() ? "foursquare" : getGeoapifyApiKey() ? "geoapify" : "google"));
    const previews = keywordResults.flatMap((item) => item.rows);

    const ranked = Array.from(new Map(previews.map((row) => [row.place_id ?? `${row.business_name}-${row.address}`, row])).values())
      .map((row) => ({
        row,
        relevance: computeRelevanceScore(row, payload.keywords, {
          name: location.name,
          city: location.city,
          region: location.region,
        }),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .map((item) => item.row);

    const strictMatched = ranked.filter((row) =>
      matchesSelectedLocation(row, {
        name: location.name,
        city: location.city,
        region: location.region,
        country: location.country,
      }),
    );
    const relaxedMatched =
      strictMatched.length > 0
        ? strictMatched
        : ranked.filter((row) =>
            matchesSelectedLocationRelaxed(row, {
              name: location.name,
              city: location.city,
              region: location.region,
              country: location.country,
            }),
          );
    const locationScoped = relaxedMatched.length > 0 ? relaxedMatched : ranked;
    const offerScoped = locationScoped.filter((row) => matchesOfferMode(row, effectiveOfferMode));
    const providerScoped =
      providerUsed === "geoapify" ? await enrichTopGeoapifyRows(offerScoped, Math.min(Math.max(payload.max_results, 20), 30)) : offerScoped;
    const strictFacebook = requireFacebook
      ? await selectStrictFacebookLeads(providerScoped, payload.max_results)
      : { selected: providerScoped.slice(0, payload.max_results), filteredOutByFacebook: 0, filteredOutByFacebookConfidence: 0 };
    const confidenceScoped = filterByFacebookConfidence(strictFacebook.selected, facebookConfidenceMin);
    const scoped = confidenceScoped.selected;
    const previewMatchKeys = scoped.map((item) => buildProspectingMatchKey(item));
    const markedSentKeys = await getUserMarkedProspectingKeys({
      user_id: user.id,
      category_id: payload.category_id,
      location_id: payload.location_id,
      match_keys: previewMatchKeys,
    });

    if (!payload.import_leads) {
      return NextResponse.json({
        results: scoped,
        marked_sent_keys: markedSentKeys,
        offer_mode: effectiveOfferMode,
        require_facebook: requireFacebook,
        facebook_confidence_min: facebookConfidenceMin,
        provider_used: providerUsed,
        imported: 0,
        filtered_out: Math.max(0, locationScoped.length - scoped.length),
        filtered_out_by_offer_mode: Math.max(0, locationScoped.length - offerScoped.length),
        filtered_out_by_facebook: strictFacebook.filteredOutByFacebook,
        filtered_out_by_facebook_confidence:
          strictFacebook.filteredOutByFacebookConfidence + confidenceScoped.filteredOut,
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
      offer_mode: effectiveOfferMode,
      require_facebook: requireFacebook,
      facebook_confidence_min: facebookConfidenceMin,
      provider_used: providerUsed,
      imported: inserted.length,
      skipped_duplicates: insertResult.skippedDuplicates,
      filtered_out_by_facebook: strictFacebook.filteredOutByFacebook,
      filtered_out_by_facebook_confidence: strictFacebook.filteredOutByFacebookConfidence + confidenceScoped.filteredOut,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
