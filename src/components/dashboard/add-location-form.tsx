"use client";

import { useEffect, useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const COUNTRY_NAME = "Philippines";
const REGION_NAME = "Region VIII";
const REGION_VIII_CODE = "REGION VIII";

const REGION_VIII_PROVINCES: Record<string, string[]> = {
  Biliran: ["Almeria", "Biliran", "Cabucgayan", "Caibiran", "Culaba", "Kawayan", "Maripipi", "Naval"],
  "Eastern Samar": [
    "Arteche",
    "Balangiga",
    "Balangkayan",
    "Can-Avid",
    "Borongan City",
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
    "Taft"
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
    "Baybay City",
    "Tacloban City",
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
    "Matag-ob",
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
    "Villaba"
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
    "Lope de Vega",
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
    "Victoria"
  ],
  Samar: [
    "Almagro",
    "Basey",
    "Calbiga",
    "Calbayog City",
    "Catbalogan City",
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
    "San Jose de Buan",
    "San Sebastian",
    "Santa Margarita",
    "Santa Rita",
    "Santo Nino",
    "Tagapul-an",
    "Talalora",
    "Tarangnan",
    "Villareal",
    "Zumarraga"
  ],
  "Southern Leyte": [
    "Anahawan",
    "Bontoc",
    "Maasin City",
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
    "Tomas Oppus"
  ]
};

const REGION_VIII_PROVINCE_NAMES = Object.keys(REGION_VIII_PROVINCES);

type QuickMode = "region8" | "philippines" | "manual";

type GeoOption = {
  code: string;
  name: string;
};

type GeoResponse = {
  items?: GeoOption[];
  error?: string;
};

export function AddLocationForm({
  action,
  allowInternational = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  allowInternational?: boolean;
}) {
  const [mode, setMode] = useState<QuickMode>(allowInternational ? "philippines" : "region8");
  const [region8Province, setRegion8Province] = useState<string>("Leyte");
  const [region8City, setRegion8City] = useState<string>(REGION_VIII_PROVINCES.Leyte[0] ?? "Tacloban City");

  const [phRegions, setPhRegions] = useState<GeoOption[]>([]);
  const [phProvinces, setPhProvinces] = useState<GeoOption[]>([]);
  const [phCities, setPhCities] = useState<GeoOption[]>([]);
  const [phRegionCode, setPhRegionCode] = useState<string>(REGION_VIII_CODE);
  const [phProvinceCode, setPhProvinceCode] = useState<string>("");
  const [phCityCode, setPhCityCode] = useState<string>("");
  const [phRegionsLoading, setPhRegionsLoading] = useState(false);
  const [phProvincesLoading, setPhProvincesLoading] = useState(false);
  const [phCitiesLoading, setPhCitiesLoading] = useState(false);
  const [phError, setPhError] = useState<string | null>(null);

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

  const region8Cities = useMemo(() => REGION_VIII_PROVINCES[region8Province] ?? [], [region8Province]);
  const region8TargetName = useMemo(() => `${region8City}, ${region8Province}`, [region8City, region8Province]);

  const selectedPhRegion = useMemo(() => phRegions.find((item) => item.code === phRegionCode)?.name ?? REGION_NAME, [phRegions, phRegionCode]);
  const selectedPhProvince = useMemo(() => phProvinces.find((item) => item.code === phProvinceCode)?.name ?? "", [phProvinces, phProvinceCode]);
  const selectedPhCity = useMemo(() => phCities.find((item) => item.code === phCityCode)?.name ?? "", [phCities, phCityCode]);
  const philippinesTargetName = useMemo(() => [selectedPhCity, selectedPhProvince].filter(Boolean).join(", "), [selectedPhCity, selectedPhProvince]);
  const philippinesReady = Boolean(selectedPhRegion && selectedPhProvince && selectedPhCity);

  const selectedCountry = useMemo(() => countries.find((item) => item.code === countryCode)?.name ?? "", [countries, countryCode]);
  const selectedRegion = useMemo(
    () => regions.find((item) => item.code === regionCode)?.name ?? regionFallback.trim(),
    [regions, regionCode, regionFallback],
  );
  const selectedCity = useMemo(() => cities.find((item) => item.code === cityCode)?.name ?? cityFallback.trim(), [cities, cityCode, cityFallback]);
  const manualTargetName = useMemo(() => [selectedCity, selectedRegion, selectedCountry].filter(Boolean).join(", "), [selectedCity, selectedRegion, selectedCountry]);
  const manualReady = Boolean(selectedCountry && selectedRegion && manualTargetName);

  useEffect(() => {
    if (!region8Cities.includes(region8City)) {
      setRegion8City(region8Cities[0] ?? "");
    }
  }, [region8Cities, region8City]);

  useEffect(() => {
    if (!allowInternational || mode !== "philippines" || phRegions.length > 0) return;

    let cancelled = false;
    async function run() {
      setPhRegionsLoading(true);
      setPhError(null);
      try {
        const response = await fetch("/api/locations/geo?type=ph_regions", { credentials: "same-origin" });
        const payload = (await response.json()) as GeoResponse;
        if (!response.ok) throw new Error(payload.error || "Failed to load Philippine regions.");
        if (cancelled) return;
        const items = payload.items ?? [];
        setPhRegions(items);
        setPhRegionCode((current) => current || REGION_VIII_CODE || items[0]?.code || "");
      } catch (error) {
        if (!cancelled) {
          setPhError(error instanceof Error ? error.message : "Failed to load Philippine regions.");
        }
      } finally {
        if (!cancelled) setPhRegionsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allowInternational, mode, phRegions.length]);

  useEffect(() => {
    if (!allowInternational || mode !== "philippines" || !phRegionCode) return;

    let cancelled = false;
    async function run() {
      setPhProvincesLoading(true);
      setPhProvinces([]);
      setPhProvinceCode("");
      setPhCities([]);
      setPhCityCode("");
      setPhError(null);
      try {
        const response = await fetch(`/api/locations/geo?type=ph_provinces&regionName=${encodeURIComponent(phRegionCode)}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as GeoResponse;
        if (!response.ok) throw new Error(payload.error || "Failed to load provinces.");
        if (cancelled) return;
        const items = payload.items ?? [];
        setPhProvinces(items);
        setPhProvinceCode(items[0]?.code ?? "");
      } catch (error) {
        if (!cancelled) {
          setPhError(error instanceof Error ? error.message : "Failed to load provinces.");
        }
      } finally {
        if (!cancelled) setPhProvincesLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allowInternational, mode, phRegionCode]);

  useEffect(() => {
    if (!allowInternational || mode !== "philippines" || !phProvinceCode) return;

    let cancelled = false;
    async function run() {
      setPhCitiesLoading(true);
      setPhCities([]);
      setPhCityCode("");
      setPhError(null);
      try {
        const response = await fetch(`/api/locations/geo?type=ph_cities&provinceName=${encodeURIComponent(phProvinceCode)}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as GeoResponse;
        if (!response.ok) throw new Error(payload.error || "Failed to load cities and municipalities.");
        if (cancelled) return;
        const items = payload.items ?? [];
        setPhCities(items);
        setPhCityCode(items[0]?.code ?? "");
      } catch (error) {
        if (!cancelled) {
          setPhError(error instanceof Error ? error.message : "Failed to load cities and municipalities.");
        }
      } finally {
        if (!cancelled) setPhCitiesLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allowInternational, mode, phProvinceCode]);

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

  const submitDisabled =
    mode === "manual"
      ? !manualReady || countriesLoading || regionsLoading || citiesLoading || (regions.length > 0 && !regionCode) || (cities.length > 0 && !cityCode)
      : mode === "philippines"
        ? !philippinesReady || phRegionsLoading || phProvincesLoading || phCitiesLoading
        : false;

  return (
    <form action={action} className="space-y-3">
      {allowInternational ? (
        <div className="space-y-1">
          <Label>Location Mode</Label>
          <Select value={mode} onChange={(event) => setMode(event.target.value as QuickMode)}>
            <option value="philippines">Philippines Quick Add</option>
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
              <Select value={region8Province} onChange={(event) => setRegion8Province(event.target.value)}>
                {REGION_VIII_PROVINCE_NAMES.map((provinceName) => (
                  <option key={provinceName} value={provinceName}>
                    {provinceName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>City / Municipality</Label>
              <Select value={region8City} onChange={(event) => setRegion8City(event.target.value)}>
                {region8Cities.map((localityName) => (
                  <option key={localityName} value={localityName}>
                    {localityName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-xs text-slate-600 dark:text-slate-300">Target Location Name (auto)</p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{region8TargetName}</p>
          </div>

          <input type="hidden" name="name" value={region8TargetName} />
          <input type="hidden" name="city" value={region8City} />
          <input type="hidden" name="region" value={REGION_NAME} />
          <input type="hidden" name="country" value={COUNTRY_NAME} />
        </>
      ) : mode === "philippines" ? (
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
              <Select value={phRegionCode} onChange={(event) => setPhRegionCode(event.target.value)} disabled={phRegionsLoading}>
                <option value="">{phRegionsLoading ? "Loading regions..." : "Select region"}</option>
                {phRegions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Province</Label>
              <Select value={phProvinceCode} onChange={(event) => setPhProvinceCode(event.target.value)} disabled={!phRegionCode || phProvincesLoading}>
                <option value="">{phProvincesLoading ? "Loading provinces..." : "Select province"}</option>
                {phProvinces.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>City / Municipality</Label>
              <Select value={phCityCode} onChange={(event) => setPhCityCode(event.target.value)} disabled={!phProvinceCode || phCitiesLoading}>
                <option value="">{phCitiesLoading ? "Loading cities / municipalities..." : "Select city / municipality"}</option>
                {phCities.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-xs text-slate-600 dark:text-slate-300">Target Location Name (auto)</p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{philippinesTargetName || "Select region, province, and city / municipality."}</p>
          </div>

          <input type="hidden" name="name" value={philippinesTargetName} />
          <input type="hidden" name="city" value={selectedPhCity} />
          <input type="hidden" name="region" value={selectedPhRegion} />
          <input type="hidden" name="country" value={COUNTRY_NAME} />

          {phError ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
              {phError}
            </p>
          ) : null}
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
                <Select value={regionCode} onChange={(event) => setRegionCode(event.target.value)} disabled={!countryCode || regionsLoading}>
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

      <FormSubmitButton disabled={submitDisabled} idleLabel="Save Location" pendingLabel="Saving location..." />
    </form>
  );
}
