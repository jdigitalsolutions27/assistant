"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { requestJson } from "@/lib/client-http";
import type { Location } from "@/lib/types";

type DuplicateMatch = {
  lead_id: string;
  business_name: string | null;
  address: string | null;
  status: "NEW" | "DRAFTED" | "SENT" | "REPLIED" | "QUALIFIED" | "WON" | "LOST";
  source: string;
  confidence: number;
  reasons: string[];
};

export function DuplicateCheckCard({ locations }: { locations: Location[] }) {
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);

  async function runCheck() {
    setLoading(true);
    setMessage(null);
    setMatches([]);
    try {
      const payload = await requestJson<{
        has_match?: boolean;
        max_confidence?: number;
        matches?: DuplicateMatch[];
        error?: string;
      }>("/api/leads/duplicate-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName || undefined,
          website_url: websiteUrl || undefined,
          facebook_url: facebookUrl || undefined,
          phone: phone || undefined,
          address: address || undefined,
          location_id: locationId || undefined,
        }),
        timeoutMs: 15_000,
        retries: 1,
        retryOnStatuses: [429, 500, 502, 503, 504],
      });

      const nextMatches = payload.matches ?? [];
      setMatches(nextMatches);
      if (!nextMatches.length) {
        setMessage("No strong duplicate detected.");
      } else {
        setMessage(`Found ${nextMatches.length} possible duplicate(s). Highest confidence: ${payload.max_confidence ?? 0}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Duplicate check failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duplicate Guard</CardTitle>
        <CardDescription>Check potential duplicates before manual add/import to keep lead data clean.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Business Name</Label>
            <Input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="ABC Dental Clinic" />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0917..." />
          </div>
          <div className="space-y-1">
            <Label>Website URL</Label>
            <Input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label>Facebook URL</Label>
            <Input value={facebookUrl} onChange={(event) => setFacebookUrl(event.target.value)} placeholder="https://facebook.com/..." />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Address</Label>
            <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Tacloban City, Leyte" />
          </div>
          <div className="space-y-1">
            <Label>Location (optional)</Label>
            <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">Any location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Button onClick={runCheck} disabled={loading}>
          {loading ? "Checking..." : "Check Duplicate Risk"}
        </Button>

        {message ? <p className="text-sm text-slate-700 dark:text-slate-200">{message}</p> : null}

        {matches.length > 0 ? (
          <div className="space-y-2">
            {matches.map((match) => (
              <div key={match.lead_id} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{match.business_name ?? "Unnamed"}</p>
                  <p className={`text-xs font-semibold ${match.confidence >= 90 ? "text-rose-700" : "text-amber-700"}`}>
                    Confidence {match.confidence}
                  </p>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {match.address ?? "-"} | {match.status} | source: {match.source}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{match.reasons.join(", ")}</p>
                <Link href={`/dashboard/leads/${match.lead_id}`} className="mt-1 inline-flex text-xs text-blue-700 hover:underline dark:text-sky-300">
                  Open existing lead
                </Link>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
