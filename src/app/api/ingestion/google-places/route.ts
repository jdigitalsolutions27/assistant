import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { env } from "@/lib/env";
import { googlePlacesSearchSchema } from "@/lib/validations";
import {
  bulkCreateLeads,
  getCategories,
  getLocations,
  insertLeadEnrichment,
  logOutreachEvent,
} from "@/lib/services/data-service";

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
};

type PreviewRow = {
  business_name: string | null;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  facebook_url: string | null;
  place_id: string | null;
  raw_json: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 12, windowMs: 60_000, bucket: "places-search" });
  if (guard) return guard;

  try {
    if (!env.GOOGLE_PLACES_API_KEY) {
      return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured." }, { status: 400 });
    }

    const body = await request.json();
    const payload = googlePlacesSearchSchema.parse(body);
    const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
    const category = categories.find((item) => item.id === payload.category_id);
    const location = locations.find((item) => item.id === payload.location_id);

    if (!category || !location) {
      return NextResponse.json({ error: "Invalid category or location." }, { status: 400 });
    }

    const previews: PreviewRow[] = [];
    for (const keyword of payload.keywords) {
      const textQuery = `${keyword} ${location.name}`;
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri",
        },
        body: JSON.stringify({
          textQuery,
          maxResultCount: Math.min(20, payload.max_results),
        }),
      });

      if (!response.ok) {
        const rawError = await response.text();
        return NextResponse.json({ error: `Google Places API failed: ${rawError}` }, { status: 502 });
      }

      const result = (await response.json()) as GooglePlacesResponse;
      for (const place of result.places ?? []) {
        previews.push({
          business_name: place.displayName?.text ?? null,
          address: place.formattedAddress ?? null,
          phone: place.nationalPhoneNumber ?? null,
          website_url: place.websiteUri ?? null,
          facebook_url: null,
          place_id: place.id ?? null,
          raw_json: place as unknown as Record<string, unknown>,
        });
      }
    }

    const unique = Array.from(
      new Map(previews.map((row) => [row.place_id ?? `${row.business_name}-${row.address}`, row])).values(),
    ).slice(0, payload.max_results);

    if (!payload.import_leads) {
      return NextResponse.json({ results: unique, imported: 0 });
    }

    const inserted = await bulkCreateLeads(
      unique.map((item) => ({
        business_name: item.business_name,
        address: item.address,
        phone: item.phone,
        website_url: item.website_url,
        facebook_url: item.facebook_url,
        category_id: payload.category_id,
        location_id: payload.location_id,
        source: "google_places",
        status: "NEW",
      })),
    );

    await Promise.all(
      inserted.map((lead, idx) =>
        insertLeadEnrichment({
          lead_id: lead.id,
          raw_json: {
            source: "google_places",
            category: category.name,
            location: location.name,
            place_id: unique[idx]?.place_id ?? null,
            raw: unique[idx]?.raw_json ?? {},
          },
          detected_keywords: payload.keywords,
        }),
      ),
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

    return NextResponse.json({ results: unique, imported: inserted.length });
  } catch (error) {
    return jsonError(error, 400);
  }
}
