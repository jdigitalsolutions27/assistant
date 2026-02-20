import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { LeadDetailActions } from "@/components/dashboard/lead-detail-actions";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCampaigns, getCategories, getLeadById, getLocations } from "@/lib/services/data-service";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [bundle, categories, locations, campaigns] = await Promise.all([
    getLeadById(id),
    getCategories(),
    getLocations(),
    getCampaigns({ status: "ALL" }),
  ]);
  if (!bundle.lead) notFound();
  const lead = bundle.lead;

  const categoryName = categories.find((item) => item.id === lead.category_id)?.name ?? "Unassigned";
  const locationName = locations.find((item) => item.id === lead.location_id)?.name ?? "Unassigned";
  const campaignName = campaigns.find((item) => item.id === lead.campaign_id)?.name ?? "Unassigned";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{lead.business_name ?? "Unnamed Lead"}</h1>
          <p className="text-sm text-slate-600">Lead profile, scoring, messages, and manual outreach queue.</p>
        </div>
        <Link href="/dashboard/leads" className="text-sm font-medium text-blue-700 hover:underline">
          Back to Leads
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead Profile</CardTitle>
              <CardDescription>Core details from ingestion and enrichment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-medium text-slate-900">Status:</span> <StatusBadge status={lead.status} />
              </p>
              <p>
                <span className="font-medium text-slate-900">Category:</span> {categoryName}
              </p>
              <p>
                <span className="font-medium text-slate-900">Location:</span> {locationName}
              </p>
              <p>
                <span className="font-medium text-slate-900">Campaign:</span> {campaignName}
              </p>
              <p>
                <span className="font-medium text-slate-900">Address:</span> {lead.address ?? "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Phone:</span> {lead.phone ?? "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Website:</span> {lead.website_url ?? "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Facebook:</span> {lead.facebook_url ?? "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Score:</span> {lead.score_total ?? "-"} (H:{lead.score_heuristic ?? "-"} / AI:
                {lead.score_ai ?? "-"})
              </p>
              <p>
                <span className="font-medium text-slate-900">Lead Quality:</span> {lead.quality_tier} ({lead.quality_score}/100)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event Timeline</CardTitle>
              <CardDescription>Outreach actions and status transitions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Metadata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundle.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.event_type}</TableCell>
                      <TableCell>{format(new Date(event.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-slate-600">
                        {JSON.stringify(event.metadata_json)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <LeadDetailActions lead={lead} initialMessages={bundle.messages} />
      </section>
    </div>
  );
}
