import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CsvImportCard } from "@/components/dashboard/csv-import-card";
import { DuplicateCheckCard } from "@/components/dashboard/duplicate-check-card";
import { MessageTools } from "@/components/dashboard/message-tools";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createLead, getCampaigns, getCategories, getLocations, listLeads } from "@/lib/services/data-service";
import { leadUpsertSchema } from "@/lib/validations";
import { normalizeUrl } from "@/lib/utils";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pageParam = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const noticeTone = typeof params.notice_tone === "string" ? params.notice_tone : "neutral";
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize = 30;
  const commonFilters = {
    status: typeof params.status === "string" && params.status !== "ALL" ? (params.status as never) : undefined,
    categoryId: typeof params.category === "string" && params.category ? params.category : undefined,
    locationId: typeof params.location === "string" && params.location ? params.location : undefined,
    campaignId: typeof params.campaign === "string" && params.campaign ? params.campaign : undefined,
    query: typeof params.query === "string" ? params.query : undefined,
    qualityTier: typeof params.quality === "string" && params.quality ? (params.quality as "High" | "Medium" | "Low") : undefined,
    minScore: typeof params.min_score === "string" && params.min_score ? Number(params.min_score) : undefined,
    sort:
      typeof params.sort === "string" &&
      ["newest", "oldest", "highest_score", "highest_quality", "recently_contacted"].includes(params.sort)
        ? (params.sort as "newest" | "oldest" | "highest_score" | "highest_quality" | "recently_contacted")
        : "newest" as const,
  };
  const [categories, locations, campaigns] = await Promise.all([
    getCategories(),
    getLocations(),
    getCampaigns({ status: "ALL" }),
  ]);
  const [leads, nextRowProbe] = await Promise.all([
    listLeads({
      ...commonFilters,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    listLeads({
      ...commonFilters,
      limit: 1,
      offset: page * pageSize,
    }),
  ]);
  const hasPrevPage = page > 1;
  const hasNextPage = nextRowProbe.length > 0;

  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const locationMap = new Map(locations.map((item) => [item.id, item.name]));
  const campaignMap = new Map(campaigns.map((item) => [item.id, item.name]));

  function pageHref(nextPage: number): string {
    const search = new URLSearchParams();
    if (typeof params.query === "string" && params.query) search.set("query", params.query);
    if (typeof params.status === "string" && params.status && params.status !== "ALL") search.set("status", params.status);
    if (typeof params.category === "string" && params.category) search.set("category", params.category);
    if (typeof params.location === "string" && params.location) search.set("location", params.location);
    if (typeof params.campaign === "string" && params.campaign) search.set("campaign", params.campaign);
    if (typeof params.quality === "string" && params.quality) search.set("quality", params.quality);
    if (typeof params.sort === "string" && params.sort) search.set("sort", params.sort);
    if (typeof params.min_score === "string" && params.min_score) search.set("min_score", params.min_score);
    if (nextPage > 1) search.set("page", String(nextPage));
    const query = search.toString();
    return query ? `/dashboard/leads?${query}` : "/dashboard/leads";
  }

  async function addLeadAction(formData: FormData) {
    "use server";
    try {
      const parsed = leadUpsertSchema.parse({
        business_name: String(formData.get("business_name") ?? ""),
        category_id: String(formData.get("category_id") ?? "") || null,
        location_id: String(formData.get("location_id") ?? "") || null,
        campaign_id: String(formData.get("campaign_id") ?? "") || null,
        facebook_url: normalizeUrl(String(formData.get("facebook_url") ?? "")) ?? "",
        website_url: normalizeUrl(String(formData.get("website_url") ?? "")) ?? "",
        phone: String(formData.get("phone") ?? ""),
        email: String(formData.get("email") ?? ""),
        address: String(formData.get("address") ?? ""),
        source: "manual",
      });

      await createLead({
        ...parsed,
        facebook_url: parsed.facebook_url || null,
        website_url: parsed.website_url || null,
        phone: parsed.phone || null,
        email: parsed.email || null,
        address: parsed.address || null,
        status: "NEW",
      });
      revalidatePath("/dashboard/leads");
      redirect("/dashboard/leads?notice=Lead%20added%20successfully.&notice_tone=success");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Failed to add lead.";
      redirect(`/dashboard/leads?notice=${encodeURIComponent(detail)}&notice_tone=error`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Leads</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Ingestion, qualification, and outreach queue management.</p>
        {notice ? (
          <p
            className={`mt-2 rounded-md border px-3 py-2 text-sm ${
              noticeTone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                : noticeTone === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                  : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200"
            }`}
          >
            {notice}
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
            <input type="hidden" name="page" value="1" />
            <Input name="query" defaultValue={typeof params.query === "string" ? params.query : ""} placeholder="Business name..." />
            <Select name="status" defaultValue={typeof params.status === "string" ? params.status : "ALL"}>
              <option value="ALL">All statuses</option>
              <option value="NEW">NEW</option>
              <option value="DRAFTED">DRAFTED</option>
              <option value="SENT">SENT</option>
              <option value="REPLIED">REPLIED</option>
              <option value="QUALIFIED">QUALIFIED</option>
              <option value="WON">WON</option>
              <option value="LOST">LOST</option>
            </Select>
            <Select name="category" defaultValue={typeof params.category === "string" ? params.category : ""}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select name="location" defaultValue={typeof params.location === "string" ? params.location : ""}>
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
            <Select name="campaign" defaultValue={typeof params.campaign === "string" ? params.campaign : ""}>
              <option value="">All campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
            <Select name="quality" defaultValue={typeof params.quality === "string" ? params.quality : ""}>
              <option value="">Any quality</option>
              <option value="High">High quality</option>
              <option value="Medium">Medium quality</option>
              <option value="Low">Low quality</option>
            </Select>
            <Select name="sort" defaultValue={typeof params.sort === "string" ? params.sort : "newest"}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest_score">Highest score</option>
              <option value="highest_quality">Highest quality</option>
              <option value="recently_contacted">Recently contacted</option>
            </Select>
            <Input
              name="min_score"
              type="number"
              min="0"
              max="100"
              defaultValue={typeof params.min_score === "string" ? params.min_score : ""}
              placeholder="Min score"
            />
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Add</CardTitle>
          <CardDescription>Add one lead manually with validation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addLeadAction} className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Business Name</Label>
              <Input name="business_name" placeholder="Business name" />
            </div>
            <div className="space-y-1">
              <Label>Facebook URL</Label>
              <Input name="facebook_url" placeholder="https://facebook.com/page" />
            </div>
            <div className="space-y-1">
              <Label>Website URL</Label>
              <Input name="website_url" placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input name="phone" placeholder="+63..." />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input name="email" placeholder="owner@domain.com" />
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Input name="address" placeholder="Tacloban City" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select name="category_id">
                <option value="">None</option>
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
                <option value="">None</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Campaign</Label>
              <Select name="campaign_id">
                <option value="">None</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Add Lead</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DuplicateCheckCard locations={locations} />

      <CsvImportCard categories={categories} locations={locations} />

      <MessageTools categories={categories} showQuickGenerator showConversationAssistant={false} />

      <Card>
        <CardHeader>
          <CardTitle>Lead Queue</CardTitle>
          <CardDescription>
            Showing {leads.length} records on page {page}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              No leads matched your current filters.
            </p>
          ) : null}
          <div className={leads.length > 0 ? "space-y-3 md:hidden" : "hidden"}>
            {leads.map((lead) => (
              <div key={lead.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{lead.business_name ?? "Unnamed"}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{lead.address ?? "-"}</p>
                  </div>
                  <StatusBadge status={lead.status} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <p>Category: {lead.category_id ? categoryMap.get(lead.category_id) ?? "-" : "-"}</p>
                  <p>Location: {lead.location_id ? locationMap.get(lead.location_id) ?? "-" : "-"}</p>
                  <p>Campaign: {lead.campaign_id ? campaignMap.get(lead.campaign_id) ?? "-" : "-"}</p>
                  <p>Score: {lead.score_total ?? "-"}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge
                    className={
                      lead.quality_tier === "High"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : lead.quality_tier === "Medium"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                    }
                  >
                    {lead.quality_tier} ({lead.quality_score})
                  </Badge>
                  <Link href={`/dashboard/leads/${lead.id}`} prefetch className="text-sm font-medium text-blue-700 hover:underline dark:text-sky-300">
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className={leads.length > 0 ? "hidden overflow-auto md:block" : "hidden"}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{lead.business_name ?? "Unnamed"}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{lead.address ?? "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell>{lead.category_id ? categoryMap.get(lead.category_id) ?? "-" : "-"}</TableCell>
                    <TableCell>{lead.location_id ? locationMap.get(lead.location_id) ?? "-" : "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell>{lead.score_total ?? "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          lead.quality_tier === "High"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : lead.quality_tier === "Medium"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                        }
                      >
                        {lead.quality_tier} ({lead.quality_score})
                      </Badge>
                    </TableCell>
                    <TableCell>{lead.campaign_id ? campaignMap.get(lead.campaign_id) ?? "-" : "-"}</TableCell>
                    <TableCell>{lead.source}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/leads/${lead.id}`} prefetch className="text-sm font-medium text-blue-700 hover:underline dark:text-sky-300">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">Page {page}</p>
            <div className="flex gap-2">
              <Button asChild variant="outline" disabled={!hasPrevPage}>
                <Link href={pageHref(page - 1)} prefetch={hasPrevPage}>
                  Prev
                </Link>
              </Button>
              <Button asChild variant="outline" disabled={!hasNextPage}>
                <Link href={pageHref(page + 1)} prefetch={hasNextPage}>
                  Next
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
