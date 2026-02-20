"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { requestJson } from "@/lib/client-http";
import type { Category, Location } from "@/lib/types";

type Row = Record<string, string | number | null | undefined>;
type Mapping = Record<"business_name" | "facebook_url" | "website_url" | "phone" | "email" | "address", string>;

const mappingFields: Array<keyof Mapping> = ["business_name", "facebook_url", "website_url", "phone", "email", "address"];

export function CsvImportCard({ categories, locations }: { categories: Category[]; locations: Location[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    business_name: "",
    facebook_url: "",
    website_url: "",
    phone: "",
    email: "",
    address: "",
  });
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => {
    const firstRow = rows[0];
    if (!firstRow) return [];
    return Object.keys(firstRow);
  }, [rows]);

  function onFile(file: File) {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        setRows(parsed.data ?? []);
      },
    });
  }

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      const payload = await requestJson<{
        imported?: number;
        skipped_duplicates?: number;
        rejected?: number;
        errors?: Array<{ row: number; message: string }>;
        error?: string;
      }>("/api/ingestion/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          mapping,
          category_id: categoryId || null,
          location_id: locationId || null,
        }),
        timeoutMs: 25_000,
        retries: 1,
        retryOnStatuses: [429, 500, 502, 503, 504],
      });

      const errorPreview =
        payload.errors && payload.errors.length > 0
          ? ` First issue: row ${payload.errors[0].row} - ${payload.errors[0].message}.`
          : "";
      setResult(
        `Imported ${payload.imported ?? 0}, skipped duplicates ${payload.skipped_duplicates ?? 0}, rejected ${payload.rejected ?? 0}.${errorPreview}`,
      );
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Import</CardTitle>
        <CardDescription>Upload CSV, map columns, and import validated leads.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="csv-file">CSV File</Label>
          <input
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
            }}
            className="block text-sm"
          />
        </div>

        {rows.length > 0 ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {mappingFields.map((field) => (
                <div key={field} className="space-y-1">
                  <Label>{field}</Label>
                  <Select value={mapping[field]} onChange={(event) => setMapping((prev) => ({ ...prev, [field]: event.target.value }))}>
                    <option value="">Unmapped</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Category (optional)</Label>
                <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">None</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Location (optional)</Label>
                <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">None</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <Button onClick={submit} disabled={loading}>
              {loading ? "Importing..." : `Import ${rows.length} Rows`}
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">Upload a CSV to start column mapping.</p>
        )}

        {result ? <p className="text-sm text-slate-700 dark:text-slate-200">{result}</p> : null}
      </CardContent>
    </Card>
  );
}
