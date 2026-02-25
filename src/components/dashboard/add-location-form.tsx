"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

function normalizeLocalityName(value: string): string {
  if (value.startsWith("City of ")) {
    return `${value.slice("City of ".length)} City`;
  }
  return value;
}

export function AddLocationForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [province, setProvince] = useState(PROVINCES[0] ?? "Leyte");

  const localities = useMemo(() => REGION_VIII_PROVINCES[province] ?? [], [province]);
  const [locality, setLocality] = useState(localities[0] ?? "");

  const formattedLocality = normalizeLocalityName(locality);
  const targetName = `${formattedLocality}, ${province}`;

  function onProvinceChange(nextProvince: string) {
    setProvince(nextProvince);
    const nextLocalities = REGION_VIII_PROVINCES[nextProvince] ?? [];
    setLocality(nextLocalities[0] ?? "");
  }

  return (
    <form action={action} className="space-y-3">
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

      <Button type="submit">Save Location</Button>
    </form>
  );
}
