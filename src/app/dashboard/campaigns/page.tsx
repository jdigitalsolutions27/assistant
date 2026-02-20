import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  assignLeadsToCampaignAuto,
  createCampaign,
  createCampaignFromPlaybook,
  createCampaignPlaybook,
  getCampaignFunnelAnalytics,
  getCampaigns,
  getCampaignPlaybooks,
  getCategories,
  getLocations,
  getPriorityLeads,
  updateCampaignStatus,
} from "@/lib/services/data-service";
import { generateFollowUpDrafts } from "@/lib/services/maintenance-service";
import { campaignCreateSchema, campaignPlaybookCreateSchema } from "@/lib/validations";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedCampaignId = typeof params.campaign === "string" ? params.campaign : "";
  const message = typeof params.message === "string" ? params.message : null;

  const [campaigns, playbooks, categories, locations, funnel, priority] = await Promise.all([
    getCampaigns({ status: "ALL" }),
    getCampaignPlaybooks(),
    getCategories(),
    getLocations(),
    getCampaignFunnelAnalytics(),
    getPriorityLeads({ campaignId: selectedCampaignId || undefined, limit: 20 }),
  ]);

  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const locationMap = new Map(locations.map((location) => [location.id, location.name]));
  const funnelMap = new Map(funnel.map((row) => [row.campaign_id, row]));

  async function createCampaignAction(formData: FormData) {
    "use server";
    const parsed = campaignCreateSchema.parse({
      name: String(formData.get("name") ?? ""),
      category_id: String(formData.get("category_id") ?? "") || null,
      location_id: String(formData.get("location_id") ?? "") || null,
      language: String(formData.get("language") ?? "Taglish"),
      tone: String(formData.get("tone") ?? "Soft"),
      angle: String(formData.get("angle") ?? "booking"),
      min_quality_score: Number(formData.get("min_quality_score") ?? 45),
      daily_send_target: Number(formData.get("daily_send_target") ?? 20),
      follow_up_days: Number(formData.get("follow_up_days") ?? 3),
      status: String(formData.get("status") ?? "ACTIVE"),
      notes: String(formData.get("notes") ?? ""),
    });
    await createCampaign({
      ...parsed,
      category_id: parsed.category_id ?? null,
      location_id: parsed.location_id ?? null,
      notes: parsed.notes ?? "",
    });
    revalidatePath("/dashboard/campaigns");
    redirect("/dashboard/campaigns?message=Campaign%20created.");
  }

  async function createPlaybookAction(formData: FormData) {
    "use server";
    const parsed = campaignPlaybookCreateSchema.parse({
      name: String(formData.get("name") ?? ""),
      category_id: String(formData.get("category_id") ?? "") || null,
      location_id: String(formData.get("location_id") ?? "") || null,
      language: String(formData.get("language") ?? "Taglish"),
      tone: String(formData.get("tone") ?? "Soft"),
      angle: String(formData.get("angle") ?? "booking"),
      min_quality_score: Number(formData.get("min_quality_score") ?? 45),
      daily_send_target: Number(formData.get("daily_send_target") ?? 20),
      follow_up_days: Number(formData.get("follow_up_days") ?? 3),
      notes: String(formData.get("notes") ?? ""),
    });
    await createCampaignPlaybook({
      ...parsed,
      category_id: parsed.category_id ?? null,
      location_id: parsed.location_id ?? null,
      notes: parsed.notes ?? "",
    });
    revalidatePath("/dashboard/campaigns");
    redirect("/dashboard/campaigns?message=Campaign%20playbook%20saved.");
  }

  async function launchPlaybookAction(formData: FormData) {
    "use server";
    const playbookId = String(formData.get("playbook_id") ?? "");
    const campaignName = String(formData.get("campaign_name") ?? "");
    const campaign = await createCampaignFromPlaybook(playbookId, campaignName || undefined);
    revalidatePath("/dashboard/campaigns");
    redirect(`/dashboard/campaigns?campaign=${campaign.id}&message=${encodeURIComponent(`Campaign launched from playbook: ${campaign.name}.`)}`);
  }

  async function assignLeadsAction(formData: FormData) {
    "use server";
    const campaignId = String(formData.get("campaign_id") ?? "");
    const limit = Number(formData.get("limit") ?? 120);
    const autoOnly = String(formData.get("auto_only") ?? "true") !== "false";
    const result = await assignLeadsToCampaignAuto({
      campaignId,
      autoOnly,
      includeStatuses: ["NEW", "DRAFTED"],
      limit,
    });
    revalidatePath("/dashboard/campaigns");
    redirect(
      `/dashboard/campaigns?campaign=${campaignId}&message=${encodeURIComponent(
        `Assigned ${result.assigned} leads. Skipped ${result.skipped}.`,
      )}`,
    );
  }

  async function runFollowUpAction(formData: FormData) {
    "use server";
    const campaignId = String(formData.get("campaign_id") ?? "");
    const days = Number(formData.get("days_since_sent") ?? 3);
    const limit = Number(formData.get("limit") ?? 60);
    const result = await generateFollowUpDrafts({
      campaignId,
      daysSinceSent: days,
      limit,
    });
    revalidatePath("/dashboard/campaigns");
    redirect(
      `/dashboard/campaigns?campaign=${campaignId}&message=${encodeURIComponent(
        `Follow-up run: ${result.drafted} drafted out of ${result.processed}.`,
      )}`,
    );
  }

  async function updateStatusAction(formData: FormData) {
    "use server";
    const campaignId = String(formData.get("campaign_id") ?? "");
    const status = String(formData.get("status") ?? "ACTIVE") as "ACTIVE" | "PAUSED" | "ARCHIVED";
    await updateCampaignStatus(campaignId, status);
    revalidatePath("/dashboard/campaigns");
    redirect(`/dashboard/campaigns?campaign=${campaignId}&message=${encodeURIComponent(`Campaign set to ${status}.`)}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaign Workbench</h1>
          <p className="text-sm text-slate-600">Build campaigns, auto-assign leads, and generate manual follow-up drafts.</p>
        </div>
        <Link href="/dashboard/leads" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
          Open Lead Queue
        </Link>
      </div>

      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Campaign</CardTitle>
          <CardDescription>Define targeting, outreach defaults, and daily workload.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createCampaignAction} className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-3">
              <Label>Campaign Name</Label>
              <Input name="name" placeholder="Tacloban Dental Reactivation - March" required />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select name="category_id">
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Select name="location_id">
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Language</Label>
              <Select name="language" defaultValue="Taglish">
                <option value="Taglish">Taglish</option>
                <option value="English">English</option>
                <option value="Tagalog">Tagalog</option>
                <option value="Waray">Waray</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tone</Label>
              <Select name="tone" defaultValue="Soft">
                <option value="Soft">Soft</option>
                <option value="Direct">Direct</option>
                <option value="Value-Focused">Value-Focused</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Angle</Label>
              <Select name="angle" defaultValue="booking">
                <option value="booking">booking</option>
                <option value="low_volume">low_volume</option>
                <option value="organization">organization</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Min Quality</Label>
              <Input name="min_quality_score" type="number" defaultValue={45} min={0} max={100} step="1" required />
            </div>
            <div className="space-y-1">
              <Label>Daily Send Target</Label>
              <Input name="daily_send_target" type="number" defaultValue={20} min={1} max={500} required />
            </div>
            <div className="space-y-1">
              <Label>Follow-up Days</Label>
              <Input name="follow_up_days" type="number" defaultValue={3} min={1} max={30} required />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Notes (optional)</Label>
              <Input name="notes" placeholder="Goals, offer, audience nuance..." />
            </div>
            <div className="md:col-span-3">
              <Button type="submit">Save Campaign</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign Playbooks</CardTitle>
          <CardDescription>Reusable campaign presets so you can launch winning setups in seconds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createPlaybookAction} className="grid gap-3 md:grid-cols-3 rounded-lg border border-slate-200 p-3">
            <div className="space-y-1 md:col-span-3">
              <Label>Playbook Name</Label>
              <Input name="name" placeholder="Hotel Soft Follow-up Playbook" required />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select name="category_id">
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Select name="location_id">
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Language</Label>
              <Select name="language" defaultValue="Taglish">
                <option value="Taglish">Taglish</option>
                <option value="English">English</option>
                <option value="Tagalog">Tagalog</option>
                <option value="Waray">Waray</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tone</Label>
              <Select name="tone" defaultValue="Soft">
                <option value="Soft">Soft</option>
                <option value="Direct">Direct</option>
                <option value="Value-Focused">Value-Focused</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Angle</Label>
              <Select name="angle" defaultValue="booking">
                <option value="booking">booking</option>
                <option value="low_volume">low_volume</option>
                <option value="organization">organization</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Min Quality</Label>
              <Input name="min_quality_score" type="number" defaultValue={45} min={0} max={100} step="1" required />
            </div>
            <div className="space-y-1">
              <Label>Daily Send Target</Label>
              <Input name="daily_send_target" type="number" defaultValue={20} min={1} max={500} required />
            </div>
            <div className="space-y-1">
              <Label>Follow-up Days</Label>
              <Input name="follow_up_days" type="number" defaultValue={3} min={1} max={30} required />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Notes</Label>
              <Input name="notes" placeholder="Use for hotel category in city centers." />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" variant="outline">
                Save Playbook
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {playbooks.map((playbook) => (
              <form key={playbook.id} action={launchPlaybookAction} className="rounded-lg border border-slate-200 p-3">
                <input type="hidden" name="playbook_id" value={playbook.id} />
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{playbook.name}</p>
                    <p className="text-xs text-slate-600">
                      {playbook.category_id ? categoryMap.get(playbook.category_id) ?? "Unknown category" : "All categories"} |{" "}
                      {playbook.location_id ? locationMap.get(playbook.location_id) ?? "Unknown location" : "All locations"} | Min quality{" "}
                      {playbook.min_quality_score} | Daily target {playbook.daily_send_target}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input name="campaign_name" placeholder="Optional campaign name override" className="h-9 w-[300px]" />
                    <Button size="sm" type="submit">
                      Launch
                    </Button>
                  </div>
                </div>
              </form>
            ))}
            {playbooks.length === 0 ? <p className="text-sm text-slate-600">No playbooks yet.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>{campaigns.length} campaigns configured.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {campaigns.map((campaign) => {
            const stats = funnelMap.get(campaign.id);
            return (
              <div key={campaign.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{campaign.name}</p>
                    <p className="text-xs text-slate-600">
                      {campaign.category_id ? categoryMap.get(campaign.category_id) ?? "Unknown category" : "All categories"} |{" "}
                      {campaign.location_id ? locationMap.get(campaign.location_id) ?? "Unknown location" : "All locations"} | Min quality{" "}
                      {campaign.min_quality_score} | Daily target {campaign.daily_send_target}
                    </p>
                    <p className="text-xs text-slate-600">
                      Sent {stats?.sent ?? 0} | Replied {stats?.replied ?? 0} | Won {stats?.won ?? 0} | Reply rate{" "}
                      {((stats?.reply_rate ?? 0) * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={assignLeadsAction} className="flex items-center gap-2">
                      <input type="hidden" name="campaign_id" value={campaign.id} />
                      <input type="hidden" name="auto_only" value="true" />
                      <Input name="limit" type="number" min={1} max={500} defaultValue={campaign.daily_send_target} className="h-9 w-24" />
                      <Button size="sm" type="submit">
                        Auto Assign
                      </Button>
                    </form>
                    <form action={runFollowUpAction} className="flex items-center gap-2">
                      <input type="hidden" name="campaign_id" value={campaign.id} />
                      <Input name="days_since_sent" type="number" min={1} max={30} defaultValue={campaign.follow_up_days} className="h-9 w-20" />
                      <Input name="limit" type="number" min={1} max={300} defaultValue={campaign.daily_send_target} className="h-9 w-24" />
                      <Button size="sm" variant="secondary" type="submit">
                        Run Follow-up
                      </Button>
                    </form>
                    <form action={updateStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="campaign_id" value={campaign.id} />
                      <Select name="status" defaultValue={campaign.status} className="h-9 w-[120px]">
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="PAUSED">PAUSED</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </Select>
                      <Button size="sm" variant="outline" type="submit">
                        Update
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
          {campaigns.length === 0 ? <p className="text-sm text-slate-600">Create your first campaign to start structured outreach.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 20 Priority Leads</CardTitle>
          <CardDescription>Best next leads to contact based on quality, score, and readiness.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <form className="flex flex-wrap gap-2">
              <Select name="campaign" defaultValue={selectedCampaignId || ""} className="w-[320px]">
                <option value="">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="outline">
                Apply
              </Button>
            </form>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {priority.map((item) => (
                <TableRow key={item.lead.id}>
                  <TableCell>{item.lead.business_name ?? "Unnamed"}</TableCell>
                  <TableCell>{item.lead.status}</TableCell>
                  <TableCell>
                    {item.lead.quality_tier} ({item.lead.quality_score})
                  </TableCell>
                  <TableCell>{item.lead.score_total ?? "-"}</TableCell>
                  <TableCell>{item.priority_score}</TableCell>
                  <TableCell className="max-w-[280px]">{item.priority_reason}</TableCell>
                  <TableCell>
                    <Link href={`/dashboard/leads/${item.lead.id}`} className="text-blue-700 hover:underline">
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
