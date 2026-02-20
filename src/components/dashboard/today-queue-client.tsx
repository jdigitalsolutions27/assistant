"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requestJson } from "@/lib/client-http";

type QueueItem = {
  lead: {
    id: string;
    business_name: string | null;
    status: "NEW" | "DRAFTED" | "SENT" | "REPLIED" | "QUALIFIED" | "WON" | "LOST";
    facebook_url: string | null;
    quality_tier: "High" | "Medium" | "Low";
    quality_score: number;
    score_total: number | null;
  };
  campaign_name: string | null;
  priority_score: number;
  priority_reason: string;
  next_action: "send_initial" | "send_follow_up" | "review";
  suggested_message: string | null;
  suggested_variant: "A" | "B" | "C" | null;
  suggested_kind: "initial" | "follow_up" | null;
};

export function TodayQueueClient({ initialItems }: { initialItems: QueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error" | "info">("info");
  const [draftingLeadId, setDraftingLeadId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => items.filter((item) => item.lead.status === "NEW" || item.lead.status === "DRAFTED" || item.lead.status === "SENT").length,
    [items],
  );

  async function emitEvent(leadId: string, eventType: string, status?: string, metadata: Record<string, unknown> = {}) {
    await requestJson<{ ok?: boolean; error?: string }>("/api/outreach/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId,
        event_type: eventType,
        status,
        metadata_json: metadata,
      }),
      timeoutMs: 12_000,
    });
  }

  async function copyDraft(item: QueueItem) {
    if (!item.suggested_message) {
      setMessageTone("info");
      setMessage("No draft available yet. Open lead and generate messages first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(item.suggested_message);
      await emitEvent(item.lead.id, "COPIED", undefined, {
        queue: "today",
        kind: item.suggested_kind,
        variant: item.suggested_variant,
        copied_at: new Date().toISOString(),
      });
      setMessageTone("success");
      setMessage(`Copied draft for ${item.lead.business_name ?? "lead"}.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Failed to copy draft.");
    }
  }

  async function markStatus(item: QueueItem, status: QueueItem["lead"]["status"]) {
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

    try {
      await emitEvent(item.lead.id, eventType, status, {
        queue: "today",
        updated_at: new Date().toISOString(),
      });
      setItems((previous) =>
        previous.map((current) =>
          current.lead.id === item.lead.id
            ? {
                ...current,
                lead: {
                  ...current.lead,
                  status,
                },
              }
            : current,
        ),
      );
      setMessageTone("success");
      setMessage(`${item.lead.business_name ?? "Lead"} marked as ${status}.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Failed to update status.");
    }
  }

  async function draftFollowUp(item: QueueItem) {
    setDraftingLeadId(item.lead.id);
    setMessage(null);
    try {
      const payload = await requestJson<{
        variants?: Array<{ variant_label: "A" | "B" | "C"; message_text: string }>;
        error?: string;
      }>(`/api/leads/${item.lead.id}/follow-up`, {
        method: "POST",
        timeoutMs: 45_000,
      });

      const primary = payload.variants?.find((variant) => variant.variant_label === "A") ?? payload.variants?.[0];
      if (!primary) throw new Error("No follow-up variants returned.");

      setItems((previous) =>
        previous.map((current) =>
          current.lead.id === item.lead.id
            ? {
                ...current,
                suggested_message: primary.message_text,
                suggested_variant: primary.variant_label,
                suggested_kind: "follow_up",
                next_action: "send_follow_up",
              }
            : current,
        ),
      );
      setMessageTone("success");
      setMessage(`Follow-up draft generated for ${item.lead.business_name ?? "lead"}.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Failed to generate follow-up draft.");
    } finally {
      setDraftingLeadId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
        <p className="text-sm text-slate-700 dark:text-slate-200">
          {items.length} leads in queue. {pendingCount} still pending outreach action today.
        </p>
        <Link href="/dashboard/campaigns" className="text-sm text-blue-700 hover:underline dark:text-sky-300">
          Manage Campaign Rules
        </Link>
      </div>

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            messageTone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
              : messageTone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200"
          }`}
        >
          {message}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
          Queue is clear right now. Add or draft leads to populate today&apos;s queue.
        </p>
      ) : null}

      <div className={items.length > 0 ? "space-y-3 md:hidden" : "hidden"}>
        {items.map((item) => (
          <div key={item.lead.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{item.lead.business_name ?? "Unnamed"}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{item.priority_reason}</p>
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.lead.status}</p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Badge
                className={
                  item.lead.quality_tier === "High"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : item.lead.quality_tier === "Medium"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                }
              >
                {item.lead.quality_tier} ({item.lead.quality_score})
              </Badge>
              <p className="text-xs text-slate-600 dark:text-slate-300">Priority {item.priority_score}</p>
            </div>
            <p className="mt-2 text-xs text-slate-700 dark:text-slate-200">
              {item.next_action === "send_initial" ? "Send initial" : item.next_action === "send_follow_up" ? "Send follow-up" : "Review"}
              {item.campaign_name ? ` - ${item.campaign_name}` : ""}
            </p>
            {item.suggested_message ? (
              <p className="mt-2 line-clamp-3 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:bg-slate-800/80 dark:text-slate-100">
                {item.suggested_kind} {item.suggested_variant ? `(${item.suggested_variant})` : ""}: {item.suggested_message}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">No suggested draft</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.lead.facebook_url ? (
                <a
                  href={item.lead.facebook_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    void emitEvent(item.lead.id, "OPENED_LINK", undefined, {
                      queue: "today",
                      url: item.lead.facebook_url,
                      opened_at: new Date().toISOString(),
                    }).catch((error: unknown) => {
                      setMessageTone("error");
                      setMessage(error instanceof Error ? error.message : "Failed to log link event.");
                    });
                  }}
                >
                  Open FB
                </a>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => void copyDraft(item)}>
                Copy
              </Button>
              {item.next_action === "send_follow_up" && !item.suggested_message ? (
                <Button size="sm" variant="outline" onClick={() => void draftFollowUp(item)} disabled={draftingLeadId === item.lead.id}>
                  {draftingLeadId === item.lead.id ? "Drafting..." : "Draft Follow-up"}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => void markStatus(item, "SENT")}>
                SENT
              </Button>
              <Button size="sm" variant="outline" onClick={() => void markStatus(item, "REPLIED")}>
                REPLIED
              </Button>
              <Link href={`/dashboard/leads/${item.lead.id}`} prefetch className="inline-flex items-center text-xs text-blue-700 hover:underline dark:text-sky-300">
                Open Lead
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className={items.length > 0 ? "hidden overflow-auto md:block" : "hidden"}>
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Quality</TableHead>
              <TableHead>Suggested Action</TableHead>
              <TableHead>Draft</TableHead>
              <TableHead>Quick Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.lead.id}>
                <TableCell>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{item.lead.business_name ?? "Unnamed"}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{item.priority_reason}</p>
                  </div>
                </TableCell>
                <TableCell>{item.campaign_name ?? "-"}</TableCell>
                <TableCell>{item.lead.status}</TableCell>
                <TableCell>{item.priority_score}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      item.lead.quality_tier === "High"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : item.lead.quality_tier === "Medium"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                    }
                  >
                    {item.lead.quality_tier} ({item.lead.quality_score})
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.next_action === "send_initial" ? "Send initial" : item.next_action === "send_follow_up" ? "Send follow-up" : "Review"}
                </TableCell>
                <TableCell className="max-w-[280px]">
                  {item.suggested_message ? (
                    <p className="line-clamp-2 text-xs text-slate-700 dark:text-slate-200">
                      {item.suggested_kind} {item.suggested_variant ? `(${item.suggested_variant})` : ""}: {item.suggested_message}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-300">No suggested draft</p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {item.lead.facebook_url ? (
                      <a
                        href={item.lead.facebook_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          void emitEvent(item.lead.id, "OPENED_LINK", undefined, {
                            queue: "today",
                            url: item.lead.facebook_url,
                            opened_at: new Date().toISOString(),
                          }).catch((error: unknown) => {
                            setMessageTone("error");
                            setMessage(error instanceof Error ? error.message : "Failed to log link event.");
                          });
                        }}
                      >
                        Open FB
                      </a>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={() => void copyDraft(item)}>
                      Copy
                    </Button>
                    {item.next_action === "send_follow_up" && !item.suggested_message ? (
                      <Button size="sm" variant="outline" onClick={() => void draftFollowUp(item)} disabled={draftingLeadId === item.lead.id}>
                        {draftingLeadId === item.lead.id ? "Drafting..." : "Draft Follow-up"}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => void markStatus(item, "SENT")}>
                      Mark SENT
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void markStatus(item, "REPLIED")}>
                      Mark REPLIED
                    </Button>
                    <Link href={`/dashboard/leads/${item.lead.id}`} prefetch className="inline-flex items-center text-xs text-blue-700 hover:underline dark:text-sky-300">
                      Open Lead
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
