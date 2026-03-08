"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AddLocationForm } from "@/components/dashboard/add-location-form";
import { ContactReadinessBadges } from "@/components/dashboard/contact-readiness-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestJson } from "@/lib/client-http";
import type { ContactVerification } from "@/lib/contact-verification";
import { QUICK_START_CATEGORY_NAMES } from "@/lib/constants";
import { buildProspectingMatchKey } from "@/lib/prospecting-match-key";
import type { Category, KeywordPack, Location, MessageAngle, MessageLanguage, MessageTone, ProspectingConfig } from "@/lib/types";

type PlacePreview = {
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

type MobilePreviewFilter = "all" | "passed" | "facebook" | "email";
type OfferMode = "launch" | "rebuild" | "all";
type FacebookConfidenceMin = "none" | "medium" | "high";

const COUNTRY_DIAL_CODE: Record<string, string> = {
  philippines: "63",
  "united states": "1",
  usa: "1",
  "united states of america": "1",
  canada: "1",
  "united kingdom": "44",
  uk: "44",
  australia: "61",
  singapore: "65",
  "new zealand": "64",
};

function normalizePhone(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function confidenceWeight(value: string | null | undefined): number {
  if (value === "high") return 100;
  if (value === "medium") return 70;
  if (value === "low") return 35;
  return 0;
}

function facebookConfidenceRank(value: string | null | undefined): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function matchesFacebookConfidence(row: PlacePreview, min: FacebookConfidenceMin): boolean {
  if (min === "none") return true;
  const required = min === "high" ? 3 : 2;
  return facebookConfidenceRank(row.contact_verification?.facebook_confidence) >= required;
}

function computeChannelReadyScore(row: PlacePreview): number {
  const hasWebsite = Boolean(row.website_url?.trim());
  const hasFacebook = Boolean(row.facebook_url?.trim());
  const hasPhone = normalizePhone(row.phone).length >= 7;
  const hasEmail = Boolean(row.email?.trim());
  const channels = [hasWebsite, hasFacebook, hasPhone, hasEmail].filter(Boolean).length;

  let score = 0;
  if (hasWebsite) score += 8;
  if (hasPhone) score += 18;
  if (hasEmail) score += 16;
  if (hasFacebook) score += 28;

  score += Math.round(confidenceWeight(row.contact_verification?.phone_confidence) * 0.08);
  score += Math.round(confidenceWeight(row.contact_verification?.email_confidence) * 0.1);
  score += Math.round(confidenceWeight(row.contact_verification?.facebook_confidence) * 0.2);

  if (channels >= 2) score += 12;
  if (channels >= 3) score += 12;
  return Math.max(0, Math.min(100, score));
}

function resolveDialCode(country: string | null | undefined): string | null {
  const key = (country ?? "").trim().toLowerCase();
  if (!key) return null;
  return COUNTRY_DIAL_CODE[key] ?? null;
}

function buildWhatsAppLink(phone: string | null, country: string | null | undefined): string | null {
  let digits = normalizePhone(phone);
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) {
    const dial = resolveDialCode(country);
    if (dial) {
      digits = `${dial}${digits.replace(/^0+/, "")}`;
    }
  } else {
    const dial = resolveDialCode(country);
    if (dial && digits.length === 10) {
      digits = `${dial}${digits}`;
    }
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
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

function computePreviewFitScore(row: PlacePreview, offerMode: OfferMode): number {
  let score = 0;
  const hasWebsite = Boolean(row.website_url?.trim());
  if (row.business_name?.trim()) score += 16;
  if (offerMode === "launch") {
    score += hasWebsite ? 4 : 24;
  } else if (offerMode === "rebuild") {
    score += hasWebsite ? 24 : -18;
  } else if (hasWebsite) {
    score += 18;
  }
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

function fitScoreClass(passed: boolean): string {
  return passed ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300";
}

function generatedStatusClass(eligible: boolean): string {
  return eligible ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300";
}

function messageAlertClass(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("failed") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized") ||
    normalized.includes("disabled") ||
    normalized.includes("invalid")
  ) {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200";
  }

  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200";
}

export function ProspectingClient({
  categories,
  locations,
  keywordPacks,
  savedConfigs,
  recommendations,
  messageRecommendations,
  agentMode = false,
  lockedCategoryId = null,
  currentUserId,
  addLocationAction,
}: {
  categories: Category[];
  locations: Location[];
  keywordPacks: KeywordPack[];
  savedConfigs: ProspectingConfig[];
  recommendations: Array<{ location: string; category: string; replyRate: number; winRate: number }>;
  messageRecommendations: StrategyRecommendation[];
  agentMode?: boolean;
  lockedCategoryId?: string | null;
  currentUserId: string;
  addLocationAction?: (formData: FormData) => void | Promise<void>;
}) {
  const PAGE_SIZE = 15;
  const defaultCategoryId =
    (lockedCategoryId && categories.some((item) => item.id === lockedCategoryId) ? lockedCategoryId : categories[0]?.id) ?? "";
  const defaultLocationId = locations[0]?.id ?? "";
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [keywordsText, setKeywordsText] = useState("");
  const [maxResults, setMaxResults] = useState(120);
  const [currentPage, setCurrentPage] = useState(1);
  const [results, setResults] = useState<PlacePreview[]>([]);
  const [offerMode, setOfferMode] = useState<OfferMode>(agentMode ? "all" : "launch");
  const [requireFacebook, setRequireFacebook] = useState(false);
  const [facebookConfidenceMin, setFacebookConfidenceMin] = useState<FacebookConfidenceMin>("none");
  const [minChannelReadyScore, setMinChannelReadyScore] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [batchLanguage, setBatchLanguage] = useState<MessageLanguage>("Taglish");
  const [batchTone, setBatchTone] = useState<MessageTone>("Soft");
  const [batchAngle, setBatchAngle] = useState<MessageAngle>(categories[0]?.default_angle ?? "booking");
  const [minFitScore, setMinFitScore] = useState(45);
  const [importAndSave, setImportAndSave] = useState(!agentMode);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState(savedConfigs);
  const [pendingConfigDelete, setPendingConfigDelete] = useState<ProspectingConfig | null>(null);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [batchResults, setBatchResults] = useState<BatchResultItem[]>([]);
  const [mobileFilter, setMobileFilter] = useState<MobilePreviewFilter>("all");
  const [markedSentKeys, setMarkedSentKeys] = useState<Set<string>>(new Set());
  const [hideMarkedSent, setHideMarkedSent] = useState(true);
  const [markingSentKey, setMarkingSentKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const enrichRunRef = useRef(0);
  const enrichInFlightRef = useRef(new Set<number>());

  const selectedCategory = useMemo(() => categories.find((item) => item.id === categoryId) ?? null, [categories, categoryId]);
  const selectedLocation = useMemo(() => locations.find((item) => item.id === locationId) ?? null, [locations, locationId]);
  const effectiveOfferMode: OfferMode = agentMode ? "all" : offerMode;
  const personalLocations = useMemo(
    () => locations.filter((location) => location.owner_user_id && location.owner_user_id === currentUserId),
    [locations, currentUserId],
  );
  const globalLocations = useMemo(() => locations.filter((location) => !location.owner_user_id), [locations]);
  const noAgentCategoryAssigned = agentMode && categories.length === 0;
  const canRunProspecting = !noAgentCategoryAssigned && Boolean(categoryId) && Boolean(locationId);
  const bestStrategy = useMemo(() => {
    const categoryName = selectedCategory?.name;
    if (!categoryName) return null;
    return messageRecommendations.find((item) => item.category === categoryName) ?? null;
  }, [messageRecommendations, selectedCategory]);
  const quickStartCategories = useMemo(
    () => QUICK_START_CATEGORY_NAMES.filter((name) => categories.some((category) => category.name === name)),
    [categories],
  );

  const currentKeywords = useMemo(
    () =>
      keywordsText
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordsText],
  );

  const markedHiddenCount = useMemo(() => {
    if (!hideMarkedSent) return 0;
    return results.filter((row) => markedSentKeys.has(buildProspectingMatchKey(row))).length;
  }, [results, hideMarkedSent, markedSentKeys]);

  const confidenceHiddenCount = useMemo(() => {
    if (agentMode || facebookConfidenceMin === "none") return 0;
    return results.filter((row) => !matchesFacebookConfidence(row, facebookConfidenceMin)).length;
  }, [results, agentMode, facebookConfidenceMin]);

  const channelHiddenCount = useMemo(() => {
    if (minChannelReadyScore <= 0) return 0;
    return results.filter((row) => computeChannelReadyScore(row) < minChannelReadyScore).length;
  }, [results, minChannelReadyScore]);

  const visibleResults = useMemo(() => {
    return results.filter((row) => {
      if (hideMarkedSent && markedSentKeys.has(buildProspectingMatchKey(row))) return false;
      if (computeChannelReadyScore(row) < minChannelReadyScore) return false;
      if (!agentMode && matchesFacebookConfidence(row, facebookConfidenceMin) === false) return false;
      return true;
    });
  }, [results, hideMarkedSent, markedSentKeys, minChannelReadyScore, agentMode, facebookConfidenceMin]);
  const totalPages = Math.max(1, Math.ceil(visibleResults.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = visibleResults.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(visibleResults.length, safeCurrentPage * PAGE_SIZE);
  const paginatedResults = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return visibleResults.slice(start, start + PAGE_SIZE);
  }, [visibleResults, safeCurrentPage]);

  const mobileFilteredResults = useMemo(() => {
    if (mobileFilter === "all") return paginatedResults;
    if (mobileFilter === "facebook") return paginatedResults.filter((row) => Boolean(row.facebook_url));
    if (mobileFilter === "email") return paginatedResults.filter((row) => Boolean(row.email));
    return paginatedResults.filter((row) => {
      const channels = [Boolean(row.website_url), Boolean(row.facebook_url), normalizePhone(row.phone).length >= 7, Boolean(row.email)].filter(Boolean).length;
      return channels > 0 && computePreviewFitScore(row, effectiveOfferMode) >= minFitScore;
    });
  }, [mobileFilter, paginatedResults, minFitScore, effectiveOfferMode]);

  const selectedRows = useMemo(
    () => visibleResults.filter((row) => selectedKeys.has(buildProspectingMatchKey(row))),
    [visibleResults, selectedKeys],
  );

  const selectedGateStats = useMemo(() => {
    let passed = 0;
    for (const row of selectedRows) {
      const channels = [Boolean(row.website_url), Boolean(row.facebook_url), normalizePhone(row.phone).length >= 7, Boolean(row.email)].filter(Boolean).length;
      if (channels > 0 && computePreviewFitScore(row, effectiveOfferMode) >= minFitScore) passed += 1;
    }
    return {
      selected: selectedRows.length,
      passed,
      blocked: Math.max(0, selectedRows.length - passed),
    };
  }, [selectedRows, minFitScore, effectiveOfferMode]);

  const batchResultMap = useMemo(() => new Map(batchResults.map((item) => [item.match_key, item])), [batchResults]);

  function getRowSelectionKey(row: PlacePreview): string {
    return buildProspectingMatchKey(row);
  }

  function loadDefaultKeywords(nextCategoryId: string) {
    const pack = keywordPacks.find((item) => item.category_id === nextCategoryId);
    if (!pack) return;
    setKeywordsText(pack.keywords.join(", "));
  }

  useEffect(() => {
    if (!categoryId) return;
    if (keywordsText.trim().length > 0) return;
    const pack = keywordPacks.find((item) => item.category_id === categoryId);
    if (!pack) return;
    setKeywordsText(pack.keywords.join(", "));
  }, [categoryId, keywordPacks, keywordsText]);

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
    if (!canRunProspecting) return;
    const shouldImport = agentMode ? false : importLeads;
    enrichRunRef.current += 1;
    const runId = enrichRunRef.current;
    enrichInFlightRef.current.clear();
    setLoading(true);
    setEnriching(false);
    setEnrichProgress({ done: 0, total: 0 });
    setCurrentPage(1);
    setMobileFilter("all");
    setSelectedKeys(new Set());
    setBatchResults([]);
    setMessage(null);
    try {
      const payload = await requestJson<{
        results?: PlacePreview[];
        marked_sent_keys?: string[];
        offer_mode?: OfferMode;
        require_facebook?: boolean;
        facebook_confidence_min?: FacebookConfidenceMin;
        provider_used?: "google" | "foursquare" | "geoapify";
        imported?: number;
        skipped_duplicates?: number;
        filtered_out_by_offer_mode?: number;
        filtered_out_by_facebook?: number;
        filtered_out_by_facebook_confidence?: number;
        error?: string;
      }>("/api/ingestion/google-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          location_id: locationId,
          keywords: currentKeywords.length ? currentKeywords : ["business"],
          offer_mode: effectiveOfferMode,
          require_facebook: agentMode ? false : requireFacebook,
          facebook_confidence_min: agentMode ? "none" : facebookConfidenceMin,
          import_leads: shouldImport,
          max_results: maxResults,
        }),
        timeoutMs: 45_000,
        retries: 1,
        retryOnStatuses: [429, 500, 502, 503, 504],
      });
      const previewRows = payload.results ?? [];
      setResults(previewRows);
      setMarkedSentKeys(new Set(payload.marked_sent_keys ?? []));
      if (!shouldImport) {
        void enrichPreviewContacts(previewRows, runId, 1);
      }
      const providerMessage =
        payload.provider_used === "foursquare"
          ? "Using Foursquare free places provider for broader listing coverage."
          : payload.provider_used === "geoapify"
            ? "Using Geoapify free fallback provider. Top results are enriched first for faster preview."
            : payload.provider_used === "google"
              ? null
              : null;
      if (shouldImport) {
        setMessage(
          [providerMessage, `Imported ${payload.imported ?? 0} leads. Skipped duplicates: ${payload.skipped_duplicates ?? 0}.`]
            .filter(Boolean)
            .join(" "),
        );
      } else if (previewRows.length === 0) {
        if (!agentMode && requireFacebook) {
          setMessage([providerMessage, "No Facebook-contactable leads found for this search. Try broader keywords or disable Require Facebook."].filter(Boolean).join(" "));
          return;
        }
        if (effectiveOfferMode === "launch") {
          setMessage([providerMessage, "No no-website leads found for this location and keywords. Try different keywords or switch Offer Mode."].filter(Boolean).join(" "));
        } else if (effectiveOfferMode === "rebuild") {
          setMessage([providerMessage, "No website-ready leads found for this location and keywords. Try different keywords or switch Offer Mode."].filter(Boolean).join(" "));
        } else {
          setMessage([providerMessage, "No leads found for this location and keywords."].filter(Boolean).join(" "));
        }
      } else if (!agentMode && requireFacebook && (payload.filtered_out_by_facebook ?? 0) > 0) {
        const confidenceFiltered = payload.filtered_out_by_facebook_confidence ?? 0;
        setMessage(
          [
            providerMessage,
            `Facebook strict mode is on. ${payload.filtered_out_by_facebook} listings had no verified Facebook. ${confidenceFiltered} filtered by confidence threshold.`,
          ]
            .filter(Boolean)
            .join(" "),
        );
      } else if ((payload.filtered_out_by_offer_mode ?? 0) > 0) {
        setMessage(
          [providerMessage, `Showing ${effectiveOfferMode} results only. ${payload.filtered_out_by_offer_mode} listings filtered out by offer mode.`]
            .filter(Boolean)
            .join(" "),
        );
      } else if (providerMessage) {
        setMessage(providerMessage);
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
          const payload = await requestJson<{ facebook_url?: string | null; email?: string | null; verification?: ContactVerification; error?: string }>(
            "/api/ingestion/contact-enrichment",
            {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              website_url: candidate.row.website_url,
              phone: candidate.row.phone,
              existing_email: candidate.row.email,
              existing_facebook_url: candidate.row.facebook_url,
            }),
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
                      contact_verification: payload.verification ?? item.contact_verification,
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
    if (clamped === safeCurrentPage || visibleResults.length === 0) return;
    void enrichPreviewContacts(results, enrichRunRef.current, clamped);
  }

  function toggleRowSelection(row: PlacePreview) {
    const key = getRowSelectionKey(row);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectPage() {
    const pageKeys = paginatedResults.map((row) => getRowSelectionKey(row));
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

  async function markPreviewRowSent(row: PlacePreview) {
    if (!categoryId || !locationId) return;
    const key = buildProspectingMatchKey(row);
    if (markedSentKeys.has(key)) return;

    setMarkingSentKey(key);
    try {
      await requestJson<{ ok?: boolean; error?: string; match_key?: string }>("/api/prospecting/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          location_id: locationId,
          business_name: row.business_name,
          address: row.address,
          phone: row.phone,
          website_url: row.website_url,
          facebook_url: row.facebook_url,
          email: row.email,
          place_id: row.place_id,
          raw_json: row.raw_json,
        }),
        timeoutMs: 15_000,
      });
      setMarkedSentKeys((prev) => new Set(prev).add(key));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setMessage(`Marked as sent: ${row.business_name ?? "listing"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to mark as sent.");
    } finally {
      setMarkingSentKey(null);
    }
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
    await runBatchGeneration(selectedRows, agentMode ? false : importAndSave);
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
          <CardDescription>
            Find prospects from public listings only, preview first, then import.
            {agentMode ? " Agent accounts are preview-and-draft only." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-28 lg:pb-4">
          {agentMode && addLocationAction ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Add My Private Location</p>
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
                This location is only visible to you. Admin can monitor it in Settings.
              </p>
              <AddLocationForm action={addLocationAction} />
            </div>
          ) : null}

          {noAgentCategoryAssigned ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              Your account does not have an assigned category yet. Ask an admin to assign one in Settings.
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={categoryId}
                disabled={agentMode || noAgentCategoryAssigned}
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
              <Select value={locationId} disabled={noAgentCategoryAssigned} onChange={(event) => setLocationId(event.target.value)}>
                {personalLocations.length > 0 ? (
                  <optgroup label="My Locations">
                    {personalLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Global Locations">
                  {globalLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Keywords (comma-separated)</Label>
              <Input
                value={keywordsText}
                disabled={noAgentCategoryAssigned}
                onChange={(event) => setKeywordsText(event.target.value)}
                placeholder="dental clinic, dentist, oral care"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Results</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                step={1}
                value={maxResults}
                disabled={noAgentCategoryAssigned}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (Number.isNaN(parsed)) {
                    setMaxResults(1);
                    return;
                  }
                  setMaxResults(Math.max(1, Math.min(1000, parsed)));
                }}
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-300">Any value is allowed up to 1000. Higher values can be slower.</p>
            </div>
          </div>

          {!agentMode ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant={offerMode === "launch" ? "default" : "outline"}
                  className="h-10"
                  onClick={() => setOfferMode("launch")}
                >
                  Launch (No Website)
                </Button>
                <Button
                  type="button"
                  variant={offerMode === "rebuild" ? "default" : "outline"}
                  className="h-10"
                  onClick={() => setOfferMode("rebuild")}
                >
                  Rebuild (Has Website)
                </Button>
                <Button
                  type="button"
                  variant={offerMode === "all" ? "default" : "outline"}
                  className="h-10"
                  onClick={() => setOfferMode("all")}
                >
                  All Leads
                </Button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Offer Mode controls accuracy: Launch returns businesses without websites; Rebuild returns businesses with websites only.
              </p>
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={requireFacebook} onChange={(event) => setRequireFacebook(event.target.checked)} />
                Require Facebook (strict)
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Facebook Confidence</Label>
                  <Select value={facebookConfidenceMin} onChange={(event) => setFacebookConfidenceMin(event.target.value as FacebookConfidenceMin)}>
                    <option value="none">All</option>
                    <option value="medium">Medium and above</option>
                    <option value="high">High only</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Min Channel Ready</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={minChannelReadyScore}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(parsed)) return;
                      setMinChannelReadyScore(Math.max(0, Math.min(100, parsed)));
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                When enabled, only leads with verified Facebook page links are shown.
              </p>
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runSearch(false)} disabled={loading || !canRunProspecting}>
              {loading ? "Searching..." : "Preview Results"}
            </Button>
            {!agentMode ? (
              <Button variant="secondary" onClick={() => runSearch(true)} disabled={loading || !canRunProspecting}>
                Import Previewed Leads
              </Button>
            ) : null}
          </div>

          {!agentMode ? (
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Config name (e.g., Tacloban Dental Hotlist)" />
              <Button variant="outline" onClick={saveConfig} disabled={saving}>
                {saving ? "Saving..." : "Save Config"}
              </Button>
            </div>
          ) : null}
          {message ? (
            <div className={`rounded-md border px-3 py-2 text-sm leading-relaxed break-words ${messageAlertClass(message)}`}>{message}</div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Niche Recommendation</CardTitle>
          <CardDescription>Top category-location opportunities based on historical reply/win rates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!agentMode ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
              Quick-start focus for first website clients: {quickStartCategories.join(", ")}. Use `Launch` for no-website searches and `Rebuild` for outdated websites.
            </div>
          ) : null}
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
              <Select value={batchLanguage} disabled={noAgentCategoryAssigned} onChange={(event) => setBatchLanguage(event.target.value as MessageLanguage)}>
                <option value="Taglish">Taglish</option>
                <option value="English">English</option>
                <option value="Tagalog">Tagalog</option>
                <option value="Waray">Waray</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tone</Label>
              <Select value={batchTone} disabled={noAgentCategoryAssigned} onChange={(event) => setBatchTone(event.target.value as MessageTone)}>
                <option value="Soft">Soft</option>
                <option value="Direct">Direct</option>
                <option value="Value-Focused">Value-Focused</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Angle</Label>
              <Select value={batchAngle} disabled={noAgentCategoryAssigned} onChange={(event) => setBatchAngle(event.target.value as MessageAngle)}>
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
                disabled={noAgentCategoryAssigned}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (!Number.isFinite(parsed)) return;
                  setMinFitScore(Math.max(0, Math.min(100, parsed)));
                }}
              />
            </div>
            {!agentMode ? (
              <div className="space-y-1">
                <Label>Import + Save</Label>
                <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm">
                  <input type="checkbox" checked={importAndSave} onChange={(event) => setImportAndSave(event.target.checked)} />
                  Save drafts to leads
                </label>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Import + Save</Label>
                <div className="flex h-10 items-center rounded-md border border-slate-300 px-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Disabled for agent accounts
                </div>
              </div>
            )}
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
            <Button onClick={generateForSelected} disabled={batchLoading || selectedGateStats.selected === 0 || noAgentCategoryAssigned}>
              {batchLoading ? "Generating..." : `Generate for Selected (${selectedGateStats.selected})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview Results</CardTitle>
          <CardDescription>
            {visibleResults.length} listings fetched from Google Places public data.
            {visibleResults.length > 0 ? ` Showing ${pageStart}-${pageEnd}.` : ""}
            {markedHiddenCount > 0 ? ` ${markedHiddenCount} marked-sent listings hidden.` : ""}
            {confidenceHiddenCount > 0 ? ` ${confidenceHiddenCount} filtered by Facebook confidence.` : ""}
            {channelHiddenCount > 0 ? ` ${channelHiddenCount} filtered by channel-ready score.` : ""}
            {enriching ? ` Enriching contacts ${enrichProgress.done}/${enrichProgress.total}...` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-[calc(11.25rem+env(safe-area-inset-bottom))] lg:pb-4">
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
            <Button variant="outline" className="h-10" onClick={toggleSelectPage} disabled={paginatedResults.length === 0}>
              Select / Unselect Page
            </Button>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={hideMarkedSent} onChange={(event) => setHideMarkedSent(event.target.checked)} />
              Hide marked sent
            </label>
            <p className="text-xs text-slate-600 dark:text-slate-300">Tip: Select the best leads then click Generate for Selected.</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            <Button size="sm" className="h-9 whitespace-nowrap" variant={mobileFilter === "all" ? "default" : "outline"} onClick={() => setMobileFilter("all")}>
              All ({paginatedResults.length})
            </Button>
            <Button size="sm" className="h-9 whitespace-nowrap" variant={mobileFilter === "passed" ? "default" : "outline"} onClick={() => setMobileFilter("passed")}>
              Passed
            </Button>
            <Button size="sm" className="h-9 whitespace-nowrap" variant={mobileFilter === "facebook" ? "default" : "outline"} onClick={() => setMobileFilter("facebook")}>
              With Facebook
            </Button>
            <Button size="sm" className="h-9 whitespace-nowrap" variant={mobileFilter === "email" ? "default" : "outline"} onClick={() => setMobileFilter("email")}>
              With Email
            </Button>
          </div>

          <div className="space-y-3 lg:hidden">
            {mobileFilteredResults.map((row, idx) => {
              const absoluteIndex = (safeCurrentPage - 1) * PAGE_SIZE + idx;
              const rowKey = getRowSelectionKey(row);
              const isSelected = selectedKeys.has(rowKey);
              const isMarkedSent = markedSentKeys.has(rowKey);
              const fitScore = computePreviewFitScore(row, effectiveOfferMode);
              const channels = [
                Boolean(row.website_url),
                Boolean(row.facebook_url),
                normalizePhone(row.phone).length >= 7,
                Boolean(row.email),
              ].filter(Boolean).length;
              const fitPassed = channels > 0 && fitScore >= minFitScore;
              const generated = batchResultMap.get(getPreviewMatchKey(row));
              const whatsappLink = buildWhatsAppLink(row.phone, selectedLocation?.country ?? null);
              const channelReadyScore = computeChannelReadyScore(row);

              return (
                <div
                  key={row.place_id ?? `${row.business_name}-${idx}`}
                  className={`rounded-xl border p-3.5 ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20"
                      : "border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="flex-1 text-left" onClick={() => toggleRowSelection(row)}>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.business_name ?? "Unnamed Business"}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Listing #{absoluteIndex + 1}</p>
                      {isMarkedSent ? <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Marked sent by you</p> : null}
                      {generated ? (
                        <p className={`mt-1 text-xs font-medium ${generatedStatusClass(generated.eligible)}`}>
                          {generated.eligible ? "Draft generated" : "Blocked by fit gate"}
                        </p>
                      ) : null}
                    </button>
                    <div className="text-right">
                      <p className={`text-xl font-semibold ${fitScoreClass(fitPassed)}`}>{fitScore}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">{fitPassed ? "Passed" : "Review first"}</p>
                    </div>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{row.address ?? "-"}</p>

                  <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                    <p>
                      <span className="font-medium">Phone:</span> {row.phone ?? "-"}
                    </p>
                    <p className="break-all">
                      <span className="font-medium">Email:</span>{" "}
                      {row.email ?? (row.website_url && !row.contact_checked ? "Checking..." : "No email")}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-300">
                      Contact confidence: {row.contact_verification?.overall_score ?? 0}/100
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-300">
                      Facebook confidence: {row.contact_verification?.facebook_confidence ?? "none"}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-300">Channel ready: {channelReadyScore}/100</p>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {whatsappLink ? (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-1.5 text-sm font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        Open WhatsApp
                      </a>
                    ) : null}
                    {row.website_url ? (
                      <a
                        href={row.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-1.5 text-sm font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        Website: {compactUrlLabel(row.website_url)}
                      </a>
                    ) : null}
                    {row.facebook_url ? (
                      <a
                        href={row.facebook_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center rounded-md border border-sky-300 bg-sky-100 px-2.5 py-1.5 text-sm font-semibold text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300"
                      >
                        Facebook: {compactUrlLabel(row.facebook_url)}
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button variant={isSelected ? "secondary" : "outline"} size="sm" className="w-full" onClick={() => toggleRowSelection(row)}>
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => void generateForRow(row)} disabled={batchLoading || noAgentCategoryAssigned}>
                      Generate 1
                    </Button>
                    <Button
                      variant={isMarkedSent ? "secondary" : "outline"}
                      size="sm"
                      className="h-10 w-full"
                      onClick={() => void markPreviewRowSent(row)}
                      disabled={isMarkedSent || markingSentKey === rowKey}
                    >
                      {isMarkedSent ? "Sent" : markingSentKey === rowKey ? "Saving..." : "Mark Sent"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {mobileFilteredResults.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                No listings match the selected filter on this page.
              </p>
            ) : null}
          </div>

          <div className="hidden overflow-auto lg:block">
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
                  const rowKey = getRowSelectionKey(row);
                  const isMarkedSent = markedSentKeys.has(rowKey);
                  const fitScore = computePreviewFitScore(row, effectiveOfferMode);
                  const channels = [
                    Boolean(row.website_url),
                    Boolean(row.facebook_url),
                    normalizePhone(row.phone).length >= 7,
                    Boolean(row.email),
                  ].filter(Boolean).length;
                  const fitPassed = channels > 0 && fitScore >= minFitScore;
                  const generated = batchResultMap.get(getPreviewMatchKey(row));
                  const whatsappLink = buildWhatsAppLink(row.phone, selectedLocation?.country ?? null);
                  const channelReadyScore = computeChannelReadyScore(row);

                  return (
                    <TableRow
                      key={row.place_id ?? `${row.business_name}-${idx}`}
                      className="border-slate-200/90 dark:border-slate-700/80 odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900/30 dark:even:bg-slate-800/40"
                    >
                      <TableCell>
                        <input type="checkbox" checked={selectedKeys.has(rowKey)} onChange={() => toggleRowSelection(row)} />
                      </TableCell>
                      <TableCell className="min-w-[210px]">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.business_name ?? "Unnamed Business"}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Listing #{absoluteIndex + 1}</p>
                        {isMarkedSent ? <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Marked sent by you</p> : null}
                        <div className="mt-2">
                          <ContactReadinessBadges
                            compact
                            facebook_url={row.facebook_url}
                            website_url={row.website_url}
                            email={row.email}
                            phone={row.phone}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.website_url ? (
                            <span className="inline-flex rounded-md border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                              Website
                            </span>
                          ) : null}
                          {row.facebook_url ? (
                            <span className="inline-flex rounded-md border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300">
                              Facebook
                            </span>
                          ) : null}
                        </div>
                        {generated ? (
                          <p className={`mt-1 text-xs font-medium ${generatedStatusClass(generated.eligible)}`}>
                            {generated.eligible ? "Draft generated" : "Blocked by fit gate"}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-[130px]">
                        <p className={`text-sm font-semibold ${fitScoreClass(fitPassed)}`}>{fitScore}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-300">{fitPassed ? "Passed" : "Review first"}</p>
                      </TableCell>
                      <TableCell className="min-w-[280px]">
                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{row.address ?? "-"}</p>
                      </TableCell>
                      <TableCell className="min-w-[170px]">
                        <p className="text-sm text-slate-800 dark:text-slate-100">{row.phone ?? "-"}</p>
                        {whatsappLink ? (
                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 hover:underline dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            Open WhatsApp
                          </a>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{row.email ?? (row.website_url && !row.contact_checked ? "Checking email..." : "No email")}</p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                          Contact confidence: {row.contact_verification?.overall_score ?? 0}/100
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                          Facebook confidence: {row.contact_verification?.facebook_confidence ?? "none"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">Channel ready: {channelReadyScore}/100</p>
                      </TableCell>
                      <TableCell className="min-w-[240px] space-y-1">
                        {row.website_url ? (
                          <a
                            href={row.website_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block max-w-[220px] truncate rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-800 hover:underline dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
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
                            className="block max-w-[220px] truncate rounded-md border border-sky-300 bg-sky-100 px-2 py-1 text-sm font-semibold text-sky-800 hover:underline dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300"
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
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => void generateForRow(row)} disabled={batchLoading || noAgentCategoryAssigned}>
                            Generate 1
                          </Button>
                          <Button
                            variant={isMarkedSent ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => void markPreviewRowSent(row)}
                            disabled={isMarkedSent || markingSentKey === rowKey}
                          >
                            {isMarkedSent ? "Sent" : markingSentKey === rowKey ? "Saving..." : "Mark Sent"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {visibleResults.length > 0 ? (
            <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 rounded-xl border border-slate-300 bg-white/95 p-3 shadow-lg backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/95">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Page {safeCurrentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => goToPage(safeCurrentPage - 1)} disabled={safeCurrentPage <= 1 || loading}>
                    Prev
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" onClick={() => goToPage(safeCurrentPage + 1)} disabled={safeCurrentPage >= totalPages || loading}>
                    Next
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Selected {selectedGateStats.selected} | Passed {selectedGateStats.passed} | Blocked {selectedGateStats.blocked}
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" className="h-10 flex-1" onClick={clearSelection} disabled={selectedGateStats.selected === 0}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  className="h-10 flex-[1.4]"
                  onClick={generateForSelected}
                  disabled={batchLoading || selectedGateStats.selected === 0 || noAgentCategoryAssigned}
                >
                  {batchLoading ? "Generating..." : `Generate Selected (${selectedGateStats.selected})`}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 hidden items-center justify-between lg:flex">
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
                  <p className={`text-xs font-semibold ${generatedStatusClass(item.eligible)}`}>
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

      {!agentMode ? (
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
      ) : null}

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
