"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Category, KeywordPack, Location, ProspectingConfig } from "@/lib/types";

type PlacePreview = {
  business_name: string | null;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  facebook_url: string | null;
  place_id: string | null;
  raw_json: Record<string, unknown>;
};

export function ProspectingClient({
  categories,
  locations,
  keywordPacks,
  savedConfigs,
  recommendations,
}: {
  categories: Category[];
  locations: Location[];
  keywordPacks: KeywordPack[];
  savedConfigs: ProspectingConfig[];
  recommendations: Array<{ location: string; category: string; replyRate: number; winRate: number }>;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [keywordsText, setKeywordsText] = useState("");
  const [results, setResults] = useState<PlacePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const currentKeywords = useMemo(
    () =>
      keywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsText],
  );

  function loadDefaultKeywords(nextCategoryId: string) {
    const pack = keywordPacks.find((item) => item.category_id === nextCategoryId);
    if (!pack) return;
    setKeywordsText(pack.keywords.join(", "));
  }

  async function runSearch(importLeads = false) {
    if (!categoryId || !locationId) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ingestion/google-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          location_id: locationId,
          keywords: currentKeywords.length ? currentKeywords : ["business"],
          import_leads: importLeads,
          max_results: 30,
        }),
      });
      const payload = (await response.json()) as { results?: PlacePreview[]; imported?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Search failed.");
      setResults(payload.results ?? []);
      if (importLeads) {
        setMessage(`Imported ${payload.imported ?? 0} leads.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/prospecting/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category_id: categoryId,
          location_id: locationId,
          keywords: currentKeywords,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Failed to save config.");
      setMessage("Prospecting config saved.");
      setName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Prospecting Pack</CardTitle>
          <CardDescription>Find prospects from public listings only, preview first, then import.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={categoryId}
                onChange={(event) => {
                  const value = event.target.value;
                  setCategoryId(value);
                  loadDefaultKeywords(value);
                }}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Keywords (comma-separated)</Label>
              <Input
                value={keywordsText}
                onChange={(event) => setKeywordsText(event.target.value)}
                placeholder="dental clinic, dentist, oral care"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runSearch(false)} disabled={loading}>
              {loading ? "Searching..." : "Preview Results"}
            </Button>
            <Button variant="secondary" onClick={() => runSearch(true)} disabled={loading}>
              Import Previewed Leads
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Config name (e.g., Tacloban Dental Hotlist)" />
            <Button variant="outline" onClick={saveConfig} disabled={saving}>
              {saving ? "Saving..." : "Save Config"}
            </Button>
          </div>
          {message ? <p className="text-sm text-slate-700">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Niche Recommendation</CardTitle>
          <CardDescription>Top category-location opportunities based on historical reply/win rates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendations.length === 0 ? <p className="text-sm text-slate-600">Not enough outreach history yet.</p> : null}
          {recommendations.map((item, idx) => (
            <div key={`${item.location}-${item.category}-${idx}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <p className="font-medium text-slate-900">
                {item.category} - {item.location}
              </p>
              <p className="text-xs text-slate-600">
                Reply {(item.replyRate * 100).toFixed(1)}% | Win {(item.winRate * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview Results</CardTitle>
          <CardDescription>{results.length} listings fetched from Google Places public data.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Place ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row, idx) => (
                  <TableRow key={row.place_id ?? `${row.business_name}-${idx}`}>
                    <TableCell>{row.business_name ?? "-"}</TableCell>
                    <TableCell>{row.address ?? "-"}</TableCell>
                    <TableCell>{row.phone ?? "-"}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{row.website_url ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{row.place_id ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Configurations</CardTitle>
          <CardDescription>Reusable keyword and location combinations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {savedConfigs.map((config) => (
            <button
              key={config.id}
              type="button"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                setName(config.name);
                setCategoryId(config.category_id);
                setLocationId(config.location_id);
                setKeywordsText(config.keywords.join(", "));
              }}
            >
              <p className="font-medium text-slate-900">{config.name}</p>
              <p className="text-xs text-slate-600">{config.keywords.join(", ")}</p>
            </button>
          ))}
          {savedConfigs.length === 0 ? <p className="text-sm text-slate-600">No saved configs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
