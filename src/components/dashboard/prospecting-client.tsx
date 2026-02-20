"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestJson } from "@/lib/client-http";
import type { Category, KeywordPack, Location, MessageAngle, MessageLanguage, MessageTone, ProspectingConfig } from "@/lib/types";

type PlacePreview = {
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

type StrategyRecommendation = {
  category: string;
  language: MessageLanguage;
  tone: MessageTone | "Mixed";
  angle: MessageAngle;
  variant: "A" | "B" | "C";
  sent: number;
  replies: number;
  won: number;
  reply_rate: number;
  win_rate: number;
  score: number;
};

type BatchResultItem = {
  match_key: string;
  business_name: string | null;
  address: string | null;
  website_url: string | null;
  facebook_url: string | null;
  email: string | null;
  fit_score: number;
  eligible: boolean;
  reasons: string[];
  variants: Array<{ variant_label: "A" | "B" | "C"; message_text: string }>;
};

function normalizePhone(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function getPreviewMatchKey(row: PlacePreview): string {
  return [
    (row.business_name ?? "").trim().toLowerCase(),
    (row.address ?? "").trim().toLowerCase(),
    (row.website_url ?? "").trim().toLowerCase(),
    (row.facebook_url ?? "").trim().toLowerCase(),
    normalizePhone(row.phone),
    (row.email ?? "").trim().toLowerCase(),
    (row.place_id ?? "").trim().toLowerCase(),
  ].join("|");
}

function computePreviewFitScore(row: PlacePreview): number {
  let score = 0;
  if (row.business_name?.trim()) score += 14;
  if (row.website_url?.trim()) score += 20;
  if (row.facebook_url?.trim()) score += 16;
  if (normalizePhone(row.phone).length >= 7) score += 14;
  if (row.email?.trim()) score += 18;
  if (row.address?.trim()) score += 10;
  score += 8;

  const channels = [Boolean(row.website_url), Boolean(row.facebook_url), normalizePhone(row.phone).length >= 7, Boolean(row.email)].filter(Boolean).length;
  if (channels >= 2) score += 8;
  if (channels >= 3) score += 6;
  return Math.max(0, Math.min(100, score));
}

export function ProspectingClient({
  categories,
  locations,
  keywordPacks,
  savedConfigs,
  recommendations,
  messageRecommendations,
}: {
  categories: Category[];
  locations: Location[];
  keywordPacks: KeywordPack[];
  savedConfigs: ProspectingConfig[];
  recommendations: Array<{ location: string; category: string; replyRate: number; winRate: number }>;
  messageRecommendations: StrategyRecommendation[];
}) {
  const PAGE_SIZE = 15;
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [keywordsText, setKeywordsText] = useState("");
  const [maxResults, setMaxResults] = useState(120);
  const [currentPage, setCurrentPage] = useState(1);
  const [results, setResults] = useState<PlacePreview[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [batchLanguage, setBatchLanguage] = useState<MessageLanguage>("Taglish");
  const [batchTone, setBatchTone] = useState<MessageTone>("Soft");
  const [batchAngle, setBatchAngle] = useState<MessageAngle>(categories[0]?.default_angle ?? "booking");
  const [minFitScore, setMinFitScore] = useState(45);
  const [importAndSave, setImportAndSave] = useState(true);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState(savedConfigs);
  const [pendingConfigDelete, setPendingConfigDelete] = useState<ProspectingConfig | null>(null);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const enrichRunRef = useRef(0);
  const enrichInFlightRef = useRef(new Set<number>());

  const selectedCategory = useMemo(() => categories.find((item) => item.id === categoryId) ?? null, [categories, categoryId]);
  const bestStrategy = useMemo(() => {
    const categoryName = selectedCategory?.name;
    if (!categoryName) return null;
    return messageRecommendations.find((item) => item.category === categoryName) ?? null;
  }, [messageRecommendations, selectedCategory]);

  const currentKeywords = useMemo(
    () =>
      keywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsText],
  );

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = results.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(results.length, safeCurrentPage * PAGE_SIZE);
  const paginatedResults = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return results.slice(start, start + PAGE_SIZE);
  }, [results, safeCurrentPage]);

  const selectedRows = useMemo(
    () =>
      results.filter((row, idx) => {
        const key = row.place_id ?? `${row.business_name ?? "unnamed"}-${idx}`;
        return selectedKeys.has(key);
      }),
    [results, selectedKeys],
  );

  const selectedGateStats = useMemo(() => {
    let passed = 0;
    for (const row of selectedRows) {
      const channels = [Boolean(row.website_url), Boolean(row.facebook_url), normalizePhone(row.phone).length >= 7, Boolean(row.email)].filter(Boolean).length;
      if (channels > 0 && computePreviewFitScore(row) >= minFitScore) passed += 1;
    }
    return {
      selected: selectedRows.length,
      passed,
      blocked: Math.max(0, selectedRows.length - passed),
    };
  }, [selectedRows, minFitScore]);

  const batchResultMap = useMemo(() => new Map(batchResults.map((item) => [item.match_key, item])), [batchResults]);

  function loadDefaultKeywords(nextCategoryId: string) {
    const pack = keywordPacks.find((item) => item.category_id === nextCategoryId);
    if (!pack) return;
    setKeywordsText(pack.keywords.join(", "));
  }

  function compactUrlLabel(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  function useBestStrategy() {
    if (!bestStrategy) return;
    setBatchLanguage(bestStrategy.language);
    if (bestStrategy.tone !== "Mixed") {
      setBatchTone(bestStrategy.tone);
    }
    setBatchAngle(bestStrategy.angle);
    setMessage(`Loaded best strategy: ${bestStrategy.language} / ${bestStrategy.tone} / ${bestStrategy.angle}.`);
  }

  async function runSearch(importLeads = false) {
    if (!categoryId || !locationId) return;
    enrichRunRef.current += 1;
    const runId = enrichRunRef.current;
    enrichInFlightRef.current.clear();
    setLoading(true);
    setEnriching(false);
    setEnrichProgress({ done: 0, total: 0 });
    setCurrentPage(1);
    setSelectedKeys(new Set());
    setBatchResults([]);
    setMessage(null);
    try {
      const payload = await requestJson<{
        results?: PlacePreview[];
        imported?: number;
        skipped_duplicates?: number;
        error?: string;
      }>("/api/ingestion/google-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          location_id: locationId,
          keywords: currentKeywords.length ? currentKeywords : ["business"],
          import_leads: importLeads,
          max_results: maxResults,
        }),
        timeoutMs: 45_000,
        retries: 1,
        retryOnStatuses: [429, 500, 502, 503, 504],
      });
      const previewRows = payload.results ?? [];
      setResults(previewRows);
      if (!importLeads) {
        void enrichPreviewContacts(previewRows, runId, 1);
      }
      if (importLeads) {
        setMessage(`Imported ${payload.imported ?? 0} leads. Skipped duplicates: ${payload.skipped_duplicates ?? 0}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function enrichPreviewContacts(previewRows: PlacePreview[], runId: number, page: number) {
    const startIndex = (page - 1) * PAGE_SIZE;
    const pageRows = previewRows.slice(startIndex, startIndex + PAGE_SIZE);
    const candidates = pageRows
      .map((row, offset) => ({ row, index: startIndex + offset }))
      .filter((item) => Boolean(item.row.website_url) && !item.row.contact_checked && !enrichInFlightRef.current.has(item.index));

    if (!candidates.length) return;
    for (const candidate of candidates) {
      enrichInFlightRef.current.add(candidate.index);
    }

    setEnriching(true);
    setEnrichProgress({ done: 0, total: candidates.length });
    let cursor = 0;
    const concurrency = Math.min(6, candidates.length);

    async function worker() {
      while (cursor < candidates.length) {
        const current = cursor;
        cursor += 1;
        const candidate = candidates[current];
        try {
          const payload = await requestJson<{ facebook_url?: string | null; email?: string | null; error?: string }>(
            "/api/ingestion/contact-enrichment",
            {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ website_url: candidate.row.website_url }),
              timeoutMs: 15_000,
              retries: 1,
              retryOnStatuses: [429, 500, 502, 503, 504],
            },
          );
          if (runId === enrichRunRef.current) {
            setResults((previous) =>
              previous.map((item, idx) =>
                idx === candidate.index
                  ? {
                      ...item,
                      facebook_url: payload.facebook_url ?? item.facebook_url,
                      email: payload.email ?? item.email,
                      contact_checked: true,
                    }
                  : item,
              ),
            );
          }
        } catch {
          if (runId === enrichRunRef.current) {
            setResults((previous) =>
              previous.map((item, idx) =>
                idx === candidate.index
                  ? {
                      ...item,
                      contact_checked: true,
                    }
                  : item,
              ),
            );
          }
        } finally {
          enrichInFlightRef.current.delete(candidate.index);
          if (runId === enrichRunRef.current) {
            setEnrichProgress((prev) => ({ ...prev, done: prev.done + 1 }));
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (runId === enrichRunRef.current) {
      setEnriching(false);
    }
  }

  function goToPage(nextPage: number) {
    const clamped = Math.max(1, Math.min(nextPage, totalPages));
    setCurrentPage(clamped);
    if (clamped === safeCurrentPage || results.length === 0) return;
    void enrichPreviewContacts(results, enrichRunRef.current, clamped);
  }

  function toggleRowSelection(row: PlacePreview, absoluteIndex: number) {
    const key = row.place_id ?? `${row.business_name ?? "unnamed"}-${absoluteIndex}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectPage() {
    const pageKeys = paginatedResults.map((row, idx) => {
      const absoluteIndex = (safeCurrentPage - 1) * PAGE_SIZE + idx;
      return row.place_id ?? `${row.business_name ?? "unnamed"}-${absoluteIndex}`;
    });
    const allSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedKeys.has(key));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of pageKeys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  async function saveConfig() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = await requestJson<{ error?: string; config?: ProspectingConfig }>("/api/prospecting/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category_id: categoryId,
          location_id: locationId,
          keywords: currentKeywords,
        }),
        timeoutMs: 15_000,
        retries: 1,
        retryOnStatuses: [429, 500, 502, 503, 504],
      });

      if (payload.config) {
        const config = payload.config;
        setConfigs((previous) => [config, ...previous.filter((item) => item.id !== config.id)]);
      }
      setMessage("Prospecting config saved.");
      setName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  }

  async function runBatchGeneration(rows: PlacePreview[], saveToLeads: boolean) {
    if (!rows.length) {
      setMessage("Select at least one listing first.");
      return;
    }

    setBatchLoading(true);
    setMessage(null);
    try {
      const payload = await requestJson<{
        generated?: number;
        skipped_gate?: number;
        imported?: number;
        skipped_duplicates?: number;
        drafts_saved?: number;
        items?: BatchResultItem[];
        error?: string;
      }>("/api/messages/prospecting-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          location_id: locationId,
          language: batchLanguage,
          tone: batchTone,
          angle: batchAngle,
          min_fit_score: minFitScore,
          import_and_save: saveToLeads,
          selected_rows: rows.map((row) => ({
            business_name: row.business_name,
            address: row.address,
            phone: row.phone,
            website_url: row.website_url,
            facebook_url: row.facebook_url,
            email: row.email,
            place_id: row.place_id,
            raw_json: row.raw_json,
          })),
        }),
        timeoutMs: 60_000,
      });

      const nextItems = payload.items ?? [];
      setBatchResults(nextItems);

      const summaryParts = [
        `Generated ${payload.generated ?? 0}`,
        `Blocked by gate ${payload.skipped_gate ?? 0}`,
      ];
      if (saveToLeads) {
        summaryParts.push(`Imported ${payload.imported ?? 0}`);
        summaryParts.push(`Saved drafts ${payload.drafts_saved ?? 0}`);
        summaryParts.push(`Duplicates ${payload.skipped_duplicates ?? 0}`);
      }
      setMessage(summaryParts.join(" | "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Batch generation failed.");
    } finally {
      setBatchLoading(false);
    }
  }

  async function generateForSelected() {
    setBatchResults([]);
    await runBatchGeneration(selectedRows, importAndSave);
  }

  async function generateForRow(row: PlacePreview) {
    setBatchResults([]);
    await runBatchGeneration([row], false);
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Copied to clipboard.");
  }

  async function confirmDeleteConfig() {
    if (!pendingConfigDelete) return;
    setDeletingConfigId(pendingConfigDelete.id);
    setMessage(null);
    try {
      await requestJson<{ ok?: boolean; error?: string }>(`/api/prospecting/configs?config_id=${encodeURIComponent(pendingConfigDelete.id)}`, {
        method: "DELETE",
        timeoutMs: 12_000,
      });

      setConfigs((previous) => previous.filter((item) => item.id !== pendingConfigDelete.id));
      setMessage(`Deleted config: ${pendingConfigDelete.name}`);
      setPendingConfigDelete(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete config.");
    } finally {
      setDeletingConfigId(null);
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={categoryId}
                onChange={(event) => {
                  const value = event.target.value;
                  setCategoryId(value);
                  setBatchAngle(categories.find((item) => item.id === value)?.default_angle ?? "booking");
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
            <div className="space-y-2">
              <Label>Max Results</Label>
              <Input
                type="number"
                min={15}
                max={300}
                step={15}
                value={maxResults}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (Number.isNaN(parsed)) {
                    setMaxResults(120);
                    return;
                  }
                  setMaxResults(Math.max(15, Math.min(300, parsed)));
                }}
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
          {message ? <p className="text-sm text-slate-700 dark:text-slate-200">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Niche Recommendation</CardTitle>
          <CardDescription>Top category-location opportunities based on historical reply/win rates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendations.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-300">Not enough outreach history yet.</p> : null}
          {recommendations.map((item, idx) => (
            <div key={`${item.location}-${item.category}-${idx}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {item.category} - {item.location}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Reply {(item.replyRate * 100).toFixed(1)}% | Win {(item.winRate * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch Message Drafting</CardTitle>
          <CardDescription>
            Select preview rows, apply a fit gate, generate professional Tagalog/Taglish/English/Waray drafts, then optionally import and save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bestStrategy ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Best strategy for {bestStrategy.category}: {bestStrategy.language} / {bestStrategy.tone} / {bestStrategy.angle} / Variant{" "}
              {bestStrategy.variant} (Reply {(bestStrategy.reply_rate * 100).toFixed(1)}%, Win {(bestStrategy.win_rate * 100).toFixed(1)}%, Sent{" "}
              {bestStrategy.sent})
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label>Language</Label>
              <Select value={batchLanguage} onChange={(event) => setBatchLanguage(event.target.value as MessageLanguage)}>
                <option value="Taglish">Taglish</option>
                <option value="English">English</option>
                <option value="Tagalog">Tagalog</option>
                <option value="Waray">Waray</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tone</Label>
              <Select value={batchTone} onChange={(event) => setBatchTone(event.target.value as MessageTone)}>
                <option value="Soft">Soft</option>
                <option value="Direct">Direct</option>
                <option value="Value-Focused">Value-Focused</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Angle</Label>
              <Select value={batchAngle} onChange={(event) => setBatchAngle(event.target.value as MessageAngle)}>
                <option value="booking">booking</option>
                <option value="low_volume">low_volume</option>
                <option value="organization">organization</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Min Fit Score</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={minFitScore}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (!Number.isFinite(parsed)) return;
                  setMinFitScore(Math.max(0, Math.min(100, parsed)));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Import + Save</Label>
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm">
                <input type="checkbox" checked={importAndSave} onChange={(event) => setImportAndSave(event.target.checked)} />
                Save drafts to leads
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
              Selected: {selectedGateStats.selected} | Passed: {selectedGateStats.passed} | Blocked: {selectedGateStats.blocked}
            </p>
            {bestStrategy ? (
              <Button variant="outline" onClick={useBestStrategy}>
                Use Best Strategy
              </Button>
            ) : null}
            <Button variant="outline" onClick={clearSelection} disabled={selectedGateStats.selected === 0}>
              Clear Selection
            </Button>
            <Button onClick={generateForSelected} disabled={batchLoading || selectedGateStats.selected === 0}>
              {batchLoading ? "Generating..." : `Generate for Selected (${selectedGateStats.selected})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview Results</CardTitle>
          <CardDescription>
            {results.length} listings fetched from Google Places public data.
            {results.length > 0 ? ` Showing ${pageStart}-${pageEnd}.` : ""}
            {enriching ? ` Enriching contacts ${enrichProgress.done}/${enrichProgress.total}...` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-xs text-slate-600 dark:text-slate-300">With Website</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{paginatedResults.filter((row) => Boolean(row.website_url)).length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-xs text-slate-600 dark:text-slate-300">With Facebook</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{paginatedResults.filter((row) => Boolean(row.facebook_url)).length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-xs text-slate-600 dark:text-slate-300">With Email</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{paginatedResults.filter((row) => Boolean(row.email)).length}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={toggleSelectPage} disabled={paginatedResults.length === 0}>
              Select / Unselect Page
            </Button>
            <p className="text-xs text-slate-600 dark:text-slate-300">Tip: Select the best leads then click Generate for Selected.</p>
          </div>

          <div className="overflow-auto">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Select</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Lead Fit</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Online Presence</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedResults.map((row, idx) => {
                  const absoluteIndex = (safeCurrentPage - 1) * PAGE_SIZE + idx;
                  const rowKey = row.place_id ?? `${row.business_name ?? "unnamed"}-${absoluteIndex}`;
                  const fitScore = computePreviewFitScore(row);
                  const channels = [
                    Boolean(row.website_url),
                    Boolean(row.facebook_url),
                    normalizePhone(row.phone).length >= 7,
                    Boolean(row.email),
                  ].filter(Boolean).length;
                  const fitPassed = channels > 0 && fitScore >= minFitScore;
                  const generated = batchResultMap.get(getPreviewMatchKey(row));

                  return (
                    <TableRow
                      key={row.place_id ?? `${row.business_name}-${idx}`}
                      className="border-slate-200/90 dark:border-slate-700/80 odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900/30 dark:even:bg-slate-800/40"
                    >
                      <TableCell>
                        <input type="checkbox" checked={selectedKeys.has(rowKey)} onChange={() => toggleRowSelection(row, absoluteIndex)} />
                      </TableCell>
                      <TableCell className="min-w-[210px]">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.business_name ?? "Unnamed Business"}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Listing #{absoluteIndex + 1}</p>
                        {generated ? (
                          <p className={`mt-1 text-xs font-medium ${generated.eligible ? "text-emerald-700" : "text-amber-700"}`}>
                            {generated.eligible ? "Draft generated" : "Blocked by fit gate"}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-[130px]">
                        <p className={`text-sm font-semibold ${fitPassed ? "text-emerald-700" : "text-amber-700"}`}>{fitScore}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-300">{fitPassed ? "Passed" : "Review first"}</p>
                      </TableCell>
                      <TableCell className="min-w-[280px]">
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{row.address ?? "-"}</p>
                      </TableCell>
                      <TableCell className="min-w-[170px]">
                        <p className="text-sm text-slate-800 dark:text-slate-100">{row.phone ?? "-"}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{row.email ?? (row.website_url && !row.contact_checked ? "Checking email..." : "No email")}</p>
                      </TableCell>
                      <TableCell className="min-w-[240px] space-y-1">
                        {row.website_url ? (
                          <a
                            href={row.website_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block max-w-[220px] truncate text-sm font-medium text-blue-700 hover:underline dark:text-sky-300"
                            title={row.website_url}
                          >
                            Website: {compactUrlLabel(row.website_url)}
                          </a>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-300">No website</p>
                        )}
                        {row.facebook_url ? (
                          <a
                            href={row.facebook_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block max-w-[220px] truncate text-sm font-medium text-blue-700 hover:underline dark:text-sky-300"
                            title={row.facebook_url}
                          >
                            Facebook: {compactUrlLabel(row.facebook_url)}
                          </a>
                        ) : row.website_url && !row.contact_checked ? (
                          <p className="text-xs text-slate-500 dark:text-slate-300">Checking Facebook...</p>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-300">No Facebook found</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => void generateForRow(row)} disabled={batchLoading}>
                          Generate 1
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Page {safeCurrentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => goToPage(safeCurrentPage - 1)} disabled={safeCurrentPage <= 1 || loading}>
                Prev
              </Button>
              <Button variant="outline" onClick={() => goToPage(safeCurrentPage + 1)} disabled={safeCurrentPage >= totalPages || loading}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {batchResults.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Generated Draft Results</CardTitle>
            <CardDescription>Review generated drafts and copy the best variant manually. Full text is shown for easier reading.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {batchResults.slice(0, 25).map((item) => (
              <div key={item.match_key} className="rounded-md border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{item.business_name ?? "Unnamed"}</p>
                  <p className={`text-xs font-semibold ${item.eligible ? "text-emerald-700" : "text-amber-700"}`}>
                    Fit {item.fit_score} {item.eligible ? "(Passed)" : "(Blocked)"}
                  </p>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{item.address ?? "-"}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{item.reasons.join(", ")}</p>
                {item.variants.length > 0 ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {item.variants.map((variant) => (
                      <div key={`${item.match_key}-${variant.variant_label}`} className="rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Variant {variant.variant_label}</p>
                        <p className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1.5 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/70 dark:text-slate-100">
                          {variant.message_text}
                        </p>
                        <Button size="sm" variant="secondary" className="mt-2" onClick={() => void copyText(variant.message_text)}>
                          Copy {variant.variant_label}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Saved Configurations</CardTitle>
          <CardDescription>Reusable keyword and location combinations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {configs.map((config) => (
            <div key={config.id} className="flex items-start gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
              <button
                type="button"
                className="flex-1 rounded-md px-2 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => {
                  setName(config.name);
                  setCategoryId(config.category_id);
                  setLocationId(config.location_id);
                  setKeywordsText(config.keywords.join(", "));
                }}
              >
                <p className="font-medium text-slate-900 dark:text-slate-100">{config.name}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{config.keywords.join(", ")}</p>
              </button>
              <Button type="button" variant="destructive" size="sm" onClick={() => setPendingConfigDelete(config)}>
                Delete
              </Button>
            </div>
          ))}
          {configs.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-300">No saved configs yet.</p> : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingConfigDelete)}
        title="Delete Saved Configuration?"
        description={
          pendingConfigDelete
            ? `This will permanently delete "${pendingConfigDelete.name}". This cannot be undone.`
            : "This will permanently delete this saved configuration."
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={Boolean(deletingConfigId)}
        onCancel={() => {
          if (deletingConfigId) return;
          setPendingConfigDelete(null);
        }}
        onConfirm={() => void confirmDeleteConfig()}
      />
    </div>
  );
}
