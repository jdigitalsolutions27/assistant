import "server-only";

import { generateFollowUpVariants } from "@/lib/ai";
import { enrichWebsiteContactData } from "@/lib/services/contact-enrichment";
import {
  assignLeadsToCampaignAuto,
  createOutreachMessages,
  getCampaigns,
  getCategories,
  getLocations,
  insertLeadEnrichment,
  listFollowUpCandidates,
  listLeadsNeedingContactRefresh,
  mergeDuplicateLeads,
  updateLeadContactData,
} from "@/lib/services/data-service";

async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function refreshStaleLeadContacts(options?: {
  daysStale?: number;
  limit?: number;
}): Promise<{
  processed: number;
  updated: number;
  unchanged: number;
}> {
  const daysStale = Math.max(1, Math.min(180, options?.daysStale ?? 21));
  const limit = Math.max(1, Math.min(200, options?.limit ?? 60));
  const leads = await listLeadsNeedingContactRefresh({ daysStale, limit });
  if (!leads.length) {
    return { processed: 0, updated: 0, unchanged: 0 };
  }

  const results = await mapWithConcurrency(
    leads,
    async (lead) => {
      if (!lead.website_url) return { updated: false };

      const contact = await enrichWebsiteContactData(lead.website_url);
      const nextFacebook = contact.facebook_url ?? null;
      const nextEmail = contact.email ?? null;
      const changed = (lead.facebook_url ?? null) !== nextFacebook || (lead.email ?? null) !== nextEmail;

      await updateLeadContactData({
        leadId: lead.id,
        facebook_url: nextFacebook,
        email: nextEmail,
      });

      await insertLeadEnrichment({
        lead_id: lead.id,
        raw_json: {
          source: "contact_refresh",
          checked_at: contact.checked_at,
          previous: {
            facebook_url: lead.facebook_url,
            email: lead.email,
          },
          next: {
            facebook_url: nextFacebook,
            email: nextEmail,
          },
          changed,
        },
        detected_keywords: [],
      });

      return { updated: changed };
    },
    6,
  );

  const updated = results.filter((item) => item.updated).length;
  return {
    processed: leads.length,
    updated,
    unchanged: leads.length - updated,
  };
}

export async function generateFollowUpDrafts(options?: {
  campaignId?: string;
  daysSinceSent?: number;
  limit?: number;
}): Promise<{
  processed: number;
  drafted: number;
  skipped: number;
}> {
  const daysSinceSent = Math.max(1, Math.min(30, options?.daysSinceSent ?? 3));
  const limit = Math.max(1, Math.min(300, options?.limit ?? 60));
  const [candidates, categories, locations] = await Promise.all([
    listFollowUpCandidates({
      campaignId: options?.campaignId,
      daysSinceSent,
      limit,
    }),
    getCategories(),
    getLocations(),
  ]);

  if (!candidates.length) {
    return { processed: 0, drafted: 0, skipped: 0 };
  }

  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const locationName = new Map(locations.map((location) => [location.id, location.name]));

  const results = await mapWithConcurrency(
    candidates,
    async ({ lead, campaign }) => {
      try {
        const variants = await generateFollowUpVariants({
          lead,
          categoryName: lead.category_id ? categoryName.get(lead.category_id) ?? "Business" : "Business",
          locationName: lead.location_id ? locationName.get(lead.location_id) ?? "your area" : "your area",
          language: campaign?.language ?? "Taglish",
          tone: campaign?.tone ?? "Soft",
          angle: campaign?.angle ?? "booking",
          context: "Follow-up outreach draft. Keep tone friendly and concise.",
        });

        await createOutreachMessages(
          lead.id,
          variants.map((variant) => ({
            ...variant,
            language: campaign?.language ?? "Taglish",
            angle: campaign?.angle ?? "booking",
            message_kind: "follow_up" as const,
          })),
          { replaceExisting: false, messageKind: "follow_up" },
        );

        await insertLeadEnrichment({
          lead_id: lead.id,
          raw_json: {
            source: "follow_up_draft_generated",
            campaign_id: campaign?.id ?? null,
            generated_at: new Date().toISOString(),
            days_since_sent: daysSinceSent,
          },
          detected_keywords: [],
        });

        return { drafted: true };
      } catch {
        return { drafted: false };
      }
    },
    4,
  );

  const drafted = results.filter((item) => item.drafted).length;
  return {
    processed: candidates.length,
    drafted,
    skipped: candidates.length - drafted,
  };
}

export async function runNightlyMaintenance(options?: {
  contactDaysStale?: number;
  contactLimit?: number;
  followUpLimitPerCampaign?: number;
}): Promise<{
  duplicateMerge: { merged: number; checked: number };
  contactRefresh: Awaited<ReturnType<typeof refreshStaleLeadContacts>>;
  campaignAssignments: Array<{ campaign_id: string; assigned: number; skipped: number }>;
  followUpDrafts: Array<{ campaign_id: string; processed: number; drafted: number; skipped: number }>;
}> {
  const activeCampaigns = await getCampaigns({ status: "ACTIVE" });
  const campaignAssignments: Array<{ campaign_id: string; assigned: number; skipped: number }> = [];
  const followUpDrafts: Array<{ campaign_id: string; processed: number; drafted: number; skipped: number }> = [];

  for (const campaign of activeCampaigns) {
    const assignment = await assignLeadsToCampaignAuto({
      campaignId: campaign.id,
      autoOnly: true,
      includeStatuses: ["NEW", "DRAFTED"],
      limit: campaign.daily_send_target,
    });
    campaignAssignments.push({
      campaign_id: campaign.id,
      assigned: assignment.assigned,
      skipped: assignment.skipped,
    });

    const followUp = await generateFollowUpDrafts({
      campaignId: campaign.id,
      daysSinceSent: campaign.follow_up_days,
      limit: options?.followUpLimitPerCampaign ?? campaign.daily_send_target,
    });
    followUpDrafts.push({
      campaign_id: campaign.id,
      processed: followUp.processed,
      drafted: followUp.drafted,
      skipped: followUp.skipped,
    });
  }

  const contactRefresh = await refreshStaleLeadContacts({
    daysStale: options?.contactDaysStale ?? 21,
    limit: options?.contactLimit ?? 120,
  });
  const duplicateMerge = await mergeDuplicateLeads({ limit: 200 });

  return {
    duplicateMerge,
    contactRefresh,
    campaignAssignments,
    followUpDrafts,
  };
}
