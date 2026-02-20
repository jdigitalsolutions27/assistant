import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TodayQueueClient } from "@/components/dashboard/today-queue-client";
import { getCampaigns, getTodayQueueItems, listFollowUpCandidates } from "@/lib/services/data-service";
import { generateFollowUpDrafts } from "@/lib/services/maintenance-service";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const campaignId = typeof params.campaign === "string" && params.campaign ? params.campaign : undefined;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const [queue, campaigns, followUpDue] = await Promise.all([
    getTodayQueueItems({ campaignId, limit: 30 }),
    getCampaigns({ status: "ALL" }),
    listFollowUpCandidates({ campaignId, daysSinceSent: 3, limit: 200 }),
  ]);

  async function runFollowUpsNowAction(formData: FormData) {
    "use server";
    const selectedCampaignId = String(formData.get("campaign_id") ?? "") || undefined;
    const days = Number(formData.get("days_since_sent") ?? 3);
    const limit = Number(formData.get("limit") ?? 100);
    const result = await generateFollowUpDrafts({
      campaignId: selectedCampaignId,
      daysSinceSent: days,
      limit,
    });
    revalidatePath("/dashboard/today");
    redirect(
      `/dashboard/today${selectedCampaignId ? `?campaign=${selectedCampaignId}&` : "?"}notice=${encodeURIComponent(
        `Follow-up autopilot: ${result.drafted} drafted out of ${result.processed} due leads.`,
      )}`,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Today Queue</h1>
        <p className="text-sm text-slate-600">Your best leads to message today, with suggested draft and quick status actions.</p>
        {notice ? <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue Filter</CardTitle>
          <CardDescription>Optionally focus on a single campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <label className="mb-1 block text-sm text-slate-700">Campaign</label>
              <select
                name="campaign"
                defaultValue={campaignId ?? ""}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up Autopilot (Manual Send Workflow)</CardTitle>
          <CardDescription>Generate follow-up drafts for due SENT leads, then copy/send manually in Meta inbox.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-700">Due now (3+ days since SENT): {followUpDue.length}</p>
          <form action={runFollowUpsNowAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_140px_auto]">
            <input type="hidden" name="campaign_id" value={campaignId ?? ""} />
            <div>
              <label className="mb-1 block text-xs text-slate-600">Campaign Scope</label>
              <input
                value={campaignId ? campaigns.find((item) => item.id === campaignId)?.name ?? "Selected campaign" : "All campaigns"}
                disabled
                className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Days Since SENT</label>
              <input
                name="days_since_sent"
                type="number"
                min={1}
                max={30}
                defaultValue={3}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Max Leads</label>
              <input
                name="limit"
                type="number"
                min={1}
                max={300}
                defaultValue={100}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
            </div>
            <div className="self-end">
              <Button type="submit">Generate Follow-ups</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Leads To Work Now</CardTitle>
          <CardDescription>Manual-send compliant workflow: open link, copy draft, send in Meta inbox, mark status.</CardDescription>
        </CardHeader>
        <CardContent>
          <TodayQueueClient initialItems={queue} />
        </CardContent>
      </Card>
    </div>
  );
}
