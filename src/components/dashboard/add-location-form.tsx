"use client";

import { useEffect, useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const REGION_NAME = "Region VIII";
const COUNTRY_NAME = "Philippines";

const REGION_VIII_PROVINCES: Record<string, string[]> = {
  Biliran: ["Almeria", "Biliran", "Cabucgayan", "Caibiran", "Culaba", "Kawayan", "Maripipi", "Naval"],
  "Eastern Samar": [
    "Arteche",
    "Balangiga",
    "Balangkayan",
    "Can-Avid",
    "City of Borongan",
    "Dolores",
    "General Macarthur",
    "Giporlos",
    "Guiuan",
    "Hernani",
    "Jipapad",
    "Lawaan",
    "Llorente",
    "Maslog",
    "Maydolong",
    "Mercedes",
    "Oras",
    "Quinapondan",
    "Salcedo",
    "San Julian",
    "San Policarpo",
    "Sulat",
    "Taft",
  ],
  Leyte: [
    "Abuyog",
    "Alangalang",
    "Albuera",
    "Babatngon",
    "Barugo",
    "Bato",
    "Burauen",
    "Calubian",
    "Capoocan",
    "Carigara",
    "City of Baybay",
    "City of Tacloban",
    "Dagami",
    "Dulag",
    "Hilongos",
    "Hindang",
    "Inopacan",
    "Isabel",
    "Jaro",
    "Javier",
    "Julita",
    "Kananga",
    "La Paz",
    "Leyte",
    "Macarthur",
    "Mahaplag",
    "Matag-Ob",
    "Matalom",
    "Mayorga",
    "Merida",
    "Ormoc City",
    "Palo",
    "Palompon",
    "Pastrana",
    "San Isidro",
    "San Miguel",
    "Santa Fe",
    "Tabango",
    "Tabontabon",
    "Tanauan",
    "Tolosa",
    "Tunga",
    "Villaba",
  ],
  "Northern Samar": [
    "Allen",
    "Biri",
    "Bobon",
    "Capul",
    "Catarman",
    "Catubig",
    "Gamay",
    "Laoang",
    "Lapinig",
    "Las Navas",
    "Lavezares",
    "Lope De Vega",
    "Mapanas",
    "Mondragon",
    "Palapag",
    "Pambujan",
    "Rosario",
    "San Antonio",
    "San Isidro",
    "San Jose",
    "San Roque",
    "San Vicente",
    "Silvino Lobos",
    "Victoria",
  ],
  Samar: [
    "Almagro",
    "Basey",
    "Calbiga",
    "City of Calbayog",
    "City of Catbalogan",
    "Daram",
    "Gandara",
    "Hinabangan",
    "Jiabong",
    "Marabut",
    "Matuguinao",
    "Motiong",
    "Pagsanghan",
    "Paranas",
    "Pinabacdao",
    "San Jorge",
    "San Jose De Buan",
    "San Sebastian",
    "Santa Margarita",
    "Santa Rita",
    "Santo Niño",
    "Tagapul-An",
    "Talalora",
    "Tarangnan",
    "Villareal",
    "Zumarraga",
  ],
  "Southern Leyte": [
    "Anahawan",
    "Bontoc",
    "City of Maasin",
    "Hinunangan",
    "Hinundayan",
    "Libagon",
    "Liloan",
    "Limasawa",
    "Macrohon",
    "Malitbog",
    "Padre Burgos",
    "Pintuyan",
    "Saint Bernard",
    "San Francisco",
    "San Juan",
    "San Ricardo",
    "Silago",
    "Sogod",
    "Tomas Oppus",
  ],
};

const PROVINCES = Object.keys(REGION_VIII_PROVINCES);

type GeoOption = {
  code: string;
  name: string;
};

type GeoResponse = {
  items?: GeoOption[];
  error?: string;
};

function normalizeLocalityName(value: string): string {
  if (value.startsWith("City of ")) {
    return `${value.slice("City of ".length)} City`;
  }
  return value;
}

export function AddLocationForm({
  action,
  allowInternational = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  allowInternational?: boolean;
}) {
  const [mode, setMode] = useState<"region8" | "manual">("region8");
  const [province, setProvince] = useState(PROVINCES[0] ?? "Leyte");
  const [countries, setCountries] = useState<GeoOption[]>([]);
  const [regions, setRegions] = useState<GeoOption[]>([]);
  const [cities, setCities] = useState<GeoOption[]>([]);
  const [countryCode, setCountryCode] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [regionFallback, setRegionFallback] = useState("");
  const [cityFallback, setCityFallback] = useState("");
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const localities = useMemo(() => REGION_VIII_PROVINCES[province] ?? [], [province]);
  const [locality, setLocality] = useState(localities[0] ?? "");

  const formattedLocality = normalizeLocalityName(locality);
  const targetName = `${formattedLocality}, ${province}`;
  const selectedCountry = useMemo(() => countries.find((item) => item.code === countryCode)?.name ?? "", [countries, countryCode]);
  const selectedRegion = useMemo(
    () => regions.find((item) => item.code === regionCode)?.name ?? regionFallback.trim(),
    [regions, regionCode, regionFallback],
  );
  const selectedCity = useMemo(() => cities.find((item) => item.code === cityCode)?.name ?? cityFallback.trim(), [cities, cityCode, cityFallback]);
  const manualTargetName = useMemo(() => [selectedCity, selectedRegion, selectedCountry].filter(Boolean).join(", "), [selectedCity, selectedRegion, selectedCountry]);
  const manualReady = Boolean(selectedCountry && selectedRegion && manualTargetName);

  function onProvinceChange(nextProvince: string) {
    setProvince(nextProvince);
    const nextLocalities = REGION_VIII_PROVINCES[nextProvince] ?? [];
    setLocality(nextLocalities[0] ?? "");
  }

  useEffect(() => {
    if (!allowInternational || mode !== "manual" || countries.length > 0) return;

    let cancelled = false;

    async function run() {
      setCountriesLoading(true);
      setManualError(null);
      try {
        const response = await fetch("/api/locations/geo?type=countries", { credentials: "same-origin" });
        const payload = (await response.json()) as GeoResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load country list.");
        }
        if (cancelled) return;
        const next = payload.items ?? [];
        setCountries(next);
        setCountryCode((current) => current || next.find((item) => item.code === "US")?.code || next[0]?.code || "");
      } catch (error) {
        if (!cancelled) {
          setManualError(error instanceof Error ? error.message : "Failed to load country list.");
        }
      } finally {
        if (!cancelled) {
          setCountriesLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allowInternational, mode, countries.length]);

  useEffect(() => {
    if (!allowInternational || mode !== "manual" || !countryCode) return;

    let cancelled = false;

    async function run() {
      setRegionsLoading(true);
      setRegions([]);
      setRegionCode("");
      setRegionFallback("");
      setCities([]);
      setCityCode("");
      setCityFallback("");
      setManualError(null);
      try {
        const response = await fetch(`/api/locations/geo?type=regions&countryCode=${encodeURIComponent(countryCode)}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as GeoResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load region list.");
        }
        if (cancelled) return;
        setRegions(payload.items ?? []);
      } catch (error) {
        if (!cancelled) {
          setManualError(error instanceof Error ? error.message : "Failed to load region list.");
        }
      } finally {
        if (!cancelled) {
          setRegionsLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allowInternational, mode, countryCode]);

  useEffect(() => {
    if (!allowInternational || mode !== "manual" || !countryCode) return;
    if (regions.length > 0 && !regionCode) return;

    let cancelled = false;
    const regionParam = regions.length > 0 ? `&regionCode=${encodeURIComponent(regionCode)}` : "";

    async function run() {
      setCitiesLoading(true);
      setCities([]);
      setCityCode("");
      setCityFallback("");
      setManualError(null);
      try {
        const response = await fetch(`/api/locations/geo?type=cities&countryCode=${encodeURIComponent(countryCode)}${regionParam}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as GeoResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load city list.");
        }
        if (cancelled) return;
        setCities(payload.items ?? []);
      } catch (error) {
        if (!cancelled) {
          setManualError(error instanceof Error ? error.message : "Failed to load city list.");
        }
      } finally {
        if (!cancelled) {
          setCitiesLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allowInternational, mode, countryCode, regionCode, regions.length]);

  return (
    <form action={action} className="space-y-3">
      {allowInternational ? (
        <div className="space-y-1">
          <Label>Location Mode</Label>
          <Select value={mode} onChange={(event) => setMode(event.target.value as "region8" | "manual")}>
            <option value="region8">Region VIII Quick Add</option>
            <option value="manual">International / Manual Add</option>
          </Select>
        </div>
      ) : null}

      {mode === "region8" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Country</Label>
              <Select value={COUNTRY_NAME} disabled>
                <option value={COUNTRY_NAME}>{COUNTRY_NAME}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Region</Label>
              <Select value={REGION_NAME} disabled>
                <option value={REGION_NAME}>{REGION_NAME}</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Province</Label>
              <Select value={province} onChange={(event) => onProvinceChange(event.target.value)}>
                {PROVINCES.map((provinceName) => (
                  <option key={provinceName} value={provinceName}>
                    {provinceName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>City / Municipality</Label>
              <Select value={locality} onChange={(event) => setLocality(event.target.value)}>
                {localities.map((localityName) => (
                  <option key={localityName} value={localityName}>
                    {normalizeLocalityName(localityName)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-xs text-slate-600 dark:text-slate-300">Target Location Name (auto)</p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{targetName}</p>
          </div>

          <input type="hidden" name="name" value={targetName} />
          <input type="hidden" name="city" value={formattedLocality} />
          <input type="hidden" name="region" value={REGION_NAME} />
          <input type="hidden" name="country" value={COUNTRY_NAME} />
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Country</Label>
              <Select value={countryCode} onChange={(event) => setCountryCode(event.target.value)} disabled={countriesLoading}>
                <option value="">{countriesLoading ? "Loading countries..." : "Select country"}</option>
                {countries.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Region / State / Province</Label>
              {regions.length > 0 ? (
                <Select
                  value={regionCode}
                  onChange={(event) => setRegionCode(event.target.value)}
                  disabled={!countryCode || regionsLoading}
                >
                  <option value="">{regionsLoading ? "Loading regions..." : "Select region / state / province"}</option>
                  {regions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={regionFallback}
                  onChange={(event) => setRegionFallback(event.target.value)}
                  placeholder={countryCode ? "Type region / state / province" : "Choose country first"}
                  disabled={!countryCode || regionsLoading}
                  required
                />
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>City / Municipality</Label>
              {cities.length > 0 ? (
                <Select
                  value={cityCode}
                  onChange={(event) => setCityCode(event.target.value)}
                  disabled={!countryCode || citiesLoading || (regions.length > 0 && !regionCode)}
                >
                  <option value="">{citiesLoading ? "Loading cities..." : "Select city / municipality"}</option>
                  {cities.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={cityFallback}
                  onChange={(event) => setCityFallback(event.target.value)}
                  placeholder={countryCode ? "Type city / municipality (optional)" : "Choose country first"}
                  disabled={!countryCode || citiesLoading || (regions.length > 0 && !regionCode)}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>Target Location Name</Label>
              <Input value={manualTargetName} readOnly placeholder="Auto-generated from selected place" />
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-xs text-slate-600 dark:text-slate-300">Target Location Name (auto)</p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{manualTargetName || "Select country, region, and city."}</p>
          </div>
          <input type="hidden" name="name" value={manualTargetName} />
          <input type="hidden" name="city" value={selectedCity} />
          <input type="hidden" name="region" value={selectedRegion} />
          <input type="hidden" name="country" value={selectedCountry} />
          {manualError ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
              {manualError}
            </p>
          ) : null}
        </>
      )}

      <FormSubmitButton
        disabled={
          mode === "manual"
            ? !manualReady || countriesLoading || regionsLoading || citiesLoading || (regions.length > 0 && !regionCode) || (cities.length > 0 && !cityCode)
            : false
        }
        idleLabel="Save Location"
        pendingLabel="Saving location..."
      >
      </FormSubmitButton>
    </form>
  );
}
