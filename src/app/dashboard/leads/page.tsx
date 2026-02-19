import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CsvImportCard } from "@/components/dashboard/csv-import-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createLead, getCategories, getLocations, listLeads } from "@/lib/services/data-service";
import { leadUpsertSchema } from "@/lib/validations";
import { normalizeUrl } from "@/lib/utils";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
  const leads = await listLeads({
    status: typeof params.status === "string" && params.status !== "ALL" ? (params.status as never) : undefined,
    categoryId: typeof params.category === "string" && params.category ? params.category : undefined,
    locationId: typeof params.location === "string" && params.location ? params.location : undefined,
    query: typeof params.query === "string" ? params.query : undefined,
  });

  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const locationMap = new Map(locations.map((item) => [item.id, item.name]));

  async function addLeadAction(formData: FormData) {
    "use server";
    const parsed = leadUpsertSchema.parse({
      business_name: String(formData.get("business_name") ?? ""),
      category_id: String(formData.get("category_id") ?? "") || null,
      location_id: String(formData.get("location_id") ?? "") || null,
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
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
        <p className="text-sm text-slate-600">Ingestion, qualification, and outreach queue management.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5">
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
            <div className="md:col-span-2">
              <Button type="submit">Add Lead</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <CsvImportCard categories={categories} locations={locations} />

      <Card>
        <CardHeader>
          <CardTitle>Lead Queue</CardTitle>
          <CardDescription>{leads.length} records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{lead.business_name ?? "Unnamed"}</p>
                        <p className="text-xs text-slate-600">{lead.address ?? "-"}</p>
                      </div>
                    </TableCell>
                    <TableCell>{lead.category_id ? categoryMap.get(lead.category_id) ?? "-" : "-"}</TableCell>
                    <TableCell>{lead.location_id ? locationMap.get(lead.location_id) ?? "-" : "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell>{lead.score_total ?? "-"}</TableCell>
                    <TableCell>{lead.source}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/leads/${lead.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
