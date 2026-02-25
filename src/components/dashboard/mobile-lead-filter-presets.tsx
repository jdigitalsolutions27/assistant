"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SavedFilterPreset = {
  id: string;
  name: string;
  params: Record<string, string>;
};

const STORAGE_KEY = "jala_mobile_lead_filter_presets_v1";
const ALLOWED_KEYS = ["query", "status", "category", "location", "campaign", "quality", "sort", "min_score"] as const;

const QUICK_PRESETS: Array<{ label: string; params: Record<string, string> }> = [
  { label: "Hot New", params: { status: "NEW", quality: "High", sort: "highest_score" } },
  { label: "Drafted", params: { status: "DRAFTED", sort: "highest_quality" } },
  { label: "Follow-up", params: { status: "SENT", sort: "recently_contacted" } },
];

function buildQuery(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  search.set("page", "1");
  return search.toString();
}

export function MobileLeadFilterPresets() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<SavedFilterPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedFilterPreset[];
      return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
    } catch {
      return [];
    }
  });

  function persist(next: SavedFilterPreset[]) {
    setPresets(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 8)));
  }

  const currentFilterParams = useMemo(() => {
    const next: Record<string, string> = {};
    for (const key of ALLOWED_KEYS) {
      const value = searchParams.get(key);
      if (value) next[key] = value;
    }
    return next;
  }, [searchParams]);

  function apply(params: Record<string, string>) {
    const query = buildQuery(params);
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function saveCurrent() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (Object.keys(currentFilterParams).length === 0) return;
    const next: SavedFilterPreset[] = [
      { id: (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), name: trimmed, params: currentFilterParams },
      ...presets,
    ];
    persist(next);
    setName("");
  }

  function removePreset(id: string) {
    persist(presets.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-2 md:hidden">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Mobile Filter Presets</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {QUICK_PRESETS.map((preset) => (
          <Button key={preset.label} size="sm" variant="outline" onClick={() => apply(preset.params)}>
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Preset name" />
        <Button size="sm" variant="secondary" onClick={saveCurrent} disabled={!name.trim()}>
          Save
        </Button>
      </div>
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <div key={preset.id} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
              <button type="button" className="font-medium text-slate-700 dark:text-slate-200" onClick={() => apply(preset.params)}>
                {preset.name}
              </button>
              <button type="button" className="text-rose-600 dark:text-rose-300" onClick={() => removePreset(preset.id)} aria-label={`Delete ${preset.name} preset`}>
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
