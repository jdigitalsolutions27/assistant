import { City, Country, State } from "country-state-city";
import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";

export const runtime = "nodejs";

type GeoItem = {
  code: string;
  name: string;
};

function sortByName(items: GeoItem[]): GeoItem[] {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request: NextRequest) {
  const guard = await enforceApiGuards(request, { max: 90, windowMs: 60_000, bucket: "geo-locations", roles: ["ADMIN"] });
  if (guard) return guard;

  try {
    const type = request.nextUrl.searchParams.get("type");
    const countryCode = request.nextUrl.searchParams.get("countryCode")?.trim().toUpperCase() ?? "";
    const regionCode = request.nextUrl.searchParams.get("regionCode")?.trim() ?? "";

    if (type === "countries") {
      const items = sortByName(
        Country.getAllCountries().map((item) => ({
          code: item.isoCode,
          name: item.name,
        })),
      );
      return NextResponse.json({ items });
    }

    if (type === "regions") {
      if (!countryCode) return NextResponse.json({ error: "countryCode is required." }, { status: 400 });
      const items = sortByName(
        State.getStatesOfCountry(countryCode).map((item) => ({
          code: item.isoCode,
          name: item.name,
        })),
      );
      return NextResponse.json({ items });
    }

    if (type === "cities") {
      if (!countryCode) return NextResponse.json({ error: "countryCode is required." }, { status: 400 });
      const stateCities = regionCode ? City.getCitiesOfState(countryCode, regionCode) ?? [] : [];
      const source = stateCities.length > 0 ? stateCities : City.getCitiesOfCountry(countryCode) ?? [];
      const deduped = Array.from(new Set(source.map((item) => item.name)));
      const items = deduped.map((name) => ({ code: name, name }));
      return NextResponse.json({ items: sortByName(items), fallback_scope: regionCode && stateCities.length === 0 ? "country" : null });
    }

    return NextResponse.json({ error: "Invalid type. Use countries, regions, or cities." }, { status: 400 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
