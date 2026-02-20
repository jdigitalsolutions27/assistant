"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { requestJson } from "@/lib/client-http";
import type { Lead, MessageAngle, OutreachMessage } from "@/lib/types";

type ScoreResponse = {
  score_heuristic: number;
  score_ai: number;
  score_total: number;
  reasons: string[];
  opportunity_summary: string;
  suggested_angle: MessageAngle;
};

export function LeadDetailActions({
  lead,
  initialMessages,
}: {
  lead: Lead;
  initialMessages: OutreachMessage[];
}) {
  const [loadingScore, setLoadingScore] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [status, setStatus] = useState(lead.status);
  const [language, setLanguage] = useState("Taglish");
  const [tone, setTone] = useState("Soft");
  const [angle, setAngle] = useState<MessageAngle>("booking");
  const [messages, setMessages] = useState(initialMessages);
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const groupedMessages = useMemo(() => {
    const map = new Map<string, OutreachMessage>();
    for (const message of messages) {
      const key = `${message.message_kind}:${message.variant_label}`;
      if (!map.has(key)) {
        map.set(key, message);
      }
    }
    const initial = ["A", "B", "C"].map((label) => map.get(`initial:${label}`) ?? null);
    const followUp = ["A", "B", "C"].map((label) => map.get(`follow_up:${label}`) ?? null);
    return { initial, followUp };
  }, [messages]);

  async function emitEvent(eventType: string, statusValue?: string, metadata: Record<string, unknown> = {}) {
    await requestJson<{ ok?: boolean; error?: string }>("/api/outreach/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: lead.id,
        event_type: eventType,
        status: statusValue,
        metadata_json: metadata,
      }),
      timeoutMs: 12_000,
    });
  }

  async function runScore() {
    setLoadingScore(true);
    setInfo(null);
    try {
      const payload = await requestJson<ScoreResponse & { error?: string }>(`/api/leads/${lead.id}/score`, {
        method: "POST",
        timeoutMs: 30_000,
      });
      setScoreData(payload);
      setAngle(payload.suggested_angle);
      setInfo("Lead scoring completed.");
    } catch (error) {
      setInfo(error instanceof Error ? error.message : "Scoring failed.");
    } finally {
      setLoadingScore(false);
    }
  }

  async function generateMessages() {
    setLoadingMessages(true);
    setInfo(null);
    try {
      const payload = await requestJson<{ variants?: Array<{ variant_label: "A" | "B" | "C"; message_text: string }>; error?: string }>(
        `/api/leads/${lead.id}/messages`,
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, tone, angle }),
          timeoutMs: 45_000,
        },
      );
      const refreshed = (payload.variants ?? []).map((variant) => ({
        id: `${lead.id}-${variant.variant_label}`,
        lead_id: lead.id,
        language: language as "Taglish" | "English" | "Tagalog" | "Waray",
        angle,
        variant_label: variant.variant_label,
        message_kind: "initial" as const,
        message_text: variant.message_text,
        created_at: new Date().toISOString(),
      }));
      setMessages(refreshed);
      setStatus("DRAFTED");
      setInfo("3 outreach drafts generated.");
    } catch (error) {
      setInfo(error instanceof Error ? error.message : "Message generation failed.");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      await emitEvent("COPIED", undefined, { copiedAt: new Date().toISOString() });
      setInfo("Message copied to clipboard.");
    } catch (error) {
      setInfo(error instanceof Error ? error.message : "Failed to copy message.");
    }
  }

  async function updatePipeline() {
    setUpdatingStatus(true);
    setInfo(null);
    try {
      const eventType =
        status === "SENT"
          ? "MARKED_SENT"
          : status === "REPLIED"
            ? "REPLIED"
            : status === "QUALIFIED"
              ? "QUALIFIED"
              : status === "WON"
                ? "WON"
                : status === "LOST"
                  ? "LOST"
                  : "COPIED";
      await emitEvent(eventType, status, { updatedAt: new Date().toISOString() });
      setInfo(`Status updated to ${status}.`);
    } catch (error) {
      setInfo(error instanceof Error ? error.message : "Failed to update status.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Lead Scoring</CardTitle>
          <CardDescription>Run heuristic + AI scoring and persist weighted score.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runScore} disabled={loadingScore}>
            {loadingScore ? "Scoring..." : "Run Score"}
          </Button>
          {scoreData ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <p>Heuristic: {scoreData.score_heuristic}</p>
              <p>AI: {scoreData.score_ai}</p>
              <p>Total: {scoreData.score_total}</p>
              <p className="mt-2 text-slate-700 dark:text-slate-200">{scoreData.opportunity_summary}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outreach Message Generator</CardTitle>
          <CardDescription>Manual Facebook messaging only. No auto-send.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Language</Label>
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="Taglish">Taglish</option>
                <option value="English">English</option>
                <option value="Tagalog">Tagalog</option>
                <option value="Waray">Waray</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tone</Label>
              <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="Soft">Soft</option>
                <option value="Direct">Direct</option>
                <option value="Value-Focused">Value-Focused</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Angle</Label>
              <Select value={angle} onChange={(e) => setAngle(e.target.value as MessageAngle)}>
                <option value="booking">booking</option>
                <option value="low_volume">low_volume</option>
                <option value="organization">organization</option>
              </Select>
            </div>
          </div>
          <Button onClick={generateMessages} disabled={loadingMessages}>
            {loadingMessages ? "Generating..." : "Generate Variants A/B/C"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Send Queue</CardTitle>
          <CardDescription>Open page URL, copy a message, send manually in Meta inbox, then mark status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lead.facebook_url ? (
            <a
              href={lead.facebook_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                void emitEvent("OPENED_LINK", undefined, { url: lead.facebook_url }).catch((error: unknown) => {
                  setInfo(error instanceof Error ? error.message : "Failed to log link event.");
                });
              }}
            >
              Open Facebook Page
            </a>
          ) : (
            <p className="text-sm text-slate-600">No Facebook URL saved for this lead.</p>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Initial Drafts</p>
            {groupedMessages.initial.map((message, idx) =>
              message ? (
                <div key={message.variant_label} className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Variant {message.variant_label}</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{message.message_text}</p>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => copyMessage(message.message_text)}>
                      Copy Variant {message.variant_label}
                    </Button>
                  </div>
                </div>
              ) : (
                <p key={idx} className="text-sm text-slate-500">
                  Variant {String.fromCharCode(65 + idx)} not generated yet.
                </p>
              ),
            )}

            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-up Drafts</p>
            {groupedMessages.followUp.map((message, idx) =>
              message ? (
                <div key={`follow-${message.variant_label}`} className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Follow-up Variant {message.variant_label}</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{message.message_text}</p>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => copyMessage(message.message_text)}>
                      Copy Follow-up {message.variant_label}
                    </Button>
                  </div>
                </div>
              ) : (
                <p key={`follow-empty-${idx}`} className="text-sm text-slate-500">
                  Follow-up variant {String.fromCharCode(65 + idx)} not generated yet.
                </p>
              ),
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={status} onChange={(event) => setStatus(event.target.value as Lead["status"])}>
              <option value="NEW">NEW</option>
              <option value="DRAFTED">DRAFTED</option>
              <option value="SENT">SENT</option>
              <option value="REPLIED">REPLIED</option>
              <option value="QUALIFIED">QUALIFIED</option>
              <option value="WON">WON</option>
              <option value="LOST">LOST</option>
            </Select>
            <Button onClick={updatePipeline} disabled={updatingStatus}>
              {updatingStatus ? "Updating..." : "Update Status"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {info ? <p className="text-sm text-slate-700 dark:text-slate-200">{info}</p> : null}
    </div>
  );
}
