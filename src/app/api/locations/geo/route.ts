import { City, Country, State } from "country-state-city";
import { NextRequest, NextResponse } from "next/server";
import { getMunicipalitiesByProvince, getProvincesByRegionName, getRegions } from "philippine-administrative-divisions";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";

export const runtime = "nodejs";

type GeoItem = {
  code: string;
  name: string;
};

function sortByName(items: GeoItem[]): GeoItem[] {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function ensureList(value: string[] | boolean | undefined | null): string[] {
  return Array.isArray(value) ? value : [];
}

function titleCaseToken(token: string): string {
  if (/^[IVX]+$/i.test(token)) return token.toUpperCase();
  if (/^(NCR|CAR|BARMM|NIR)$/i.test(token)) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function formatPhText(value: string): string {
  return value
    .toLowerCase()
    .split(/([ -/()])/)
    .map((part) => {
      if (/^[ -/()]$/.test(part)) return part;
      return titleCaseToken(part);
    })
    .join("")
    .replace(/\bOf\b/g, "of")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bDel\b/g, "del")
    .replace(/\bDe\b/g, "de")
    .replace(/\bNorte\b/g, "Norte")
    .replace(/\bSur\b/g, "Sur");
}

function formatPhRegion(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value === "NCR") return "National Capital Region (NCR)";
  if (value === "CAR") return "Cordillera Administrative Region (CAR)";
  if (value === "BARMM") return "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)";
  if (value === "NIR") return "Negros Island Region (NIR)";
  if (value.startsWith("REGION ")) return `Region ${value.slice("REGION ".length)}`;
  return formatPhText(value);
}

function formatPhProvince(raw: string): string {
  return formatPhText(raw.trim());
}

function formatPhMunicipality(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value.startsWith("CITY OF ")) {
    return `${formatPhText(value.slice("CITY OF ".length))} City`;
  }
  return formatPhText(value);
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

    if (type === "ph_regions") {
      const items = getRegions().map((item) => ({
        code: item,
        name: formatPhRegion(item),
      }));
      return NextResponse.json({ items: sortByName(items) });
    }

    if (type === "ph_provinces") {
      const regionName = request.nextUrl.searchParams.get("regionName")?.trim().toUpperCase() ?? "";
      if (!regionName) return NextResponse.json({ error: "regionName is required." }, { status: 400 });
      const items = ensureList(getProvincesByRegionName(regionName)).map((item) => ({
        code: item,
        name: formatPhProvince(item),
      }));
      return NextResponse.json({ items: sortByName(items) });
    }

    if (type === "ph_cities") {
      const provinceName = request.nextUrl.searchParams.get("provinceName")?.trim().toUpperCase() ?? "";
      if (!provinceName) return NextResponse.json({ error: "provinceName is required." }, { status: 400 });

      const source =
        provinceName === "NATIONAL CAPITAL REGION - MANILA" ? ["CITY OF MANILA"] : ensureList(getMunicipalitiesByProvince(provinceName));
      const items = source.map((item) => ({
        code: item,
        name: formatPhMunicipality(item),
      }));
      return NextResponse.json({ items: sortByName(items) });
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
