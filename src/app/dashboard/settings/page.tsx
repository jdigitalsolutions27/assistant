import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addCategory,
  addLocation,
  getCategories,
  getKeywordPacks,
  getLocations,
  mergeDuplicateLeads,
  getScoreWeights,
  setKeywordPack,
  setScoreWeights,
} from "@/lib/services/data-service";
import { generateFollowUpDrafts, refreshStaleLeadContacts, runNightlyMaintenance } from "@/lib/services/maintenance-service";
import { settingsWeightSchema } from "@/lib/validations";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const maintenanceMessage = typeof params.maintenance === "string" ? params.maintenance : null;
  const [categories, locations, keywordPacks, weights] = await Promise.all([
    getCategories(),
    getLocations(),
    getKeywordPacks(),
    getScoreWeights(),
  ]);
  const keywordMap = new Map(keywordPacks.map((pack) => [pack.category_id, pack.keywords]));

  async function addCategoryAction(formData: FormData) {
    "use server";
    await addCategory(String(formData.get("name") ?? ""), String(formData.get("default_angle") ?? "booking"));
    revalidatePath("/dashboard/settings");
  }

  async function addLocationAction(formData: FormData) {
    "use server";
    await addLocation({
      name: String(formData.get("name") ?? ""),
      city: String(formData.get("city") ?? ""),
      region: String(formData.get("region") ?? ""),
      country: String(formData.get("country") ?? ""),
    });
    revalidatePath("/dashboard/settings");
  }

  async function saveKeywordsAction(formData: FormData) {
    "use server";
    const categoryId = String(formData.get("category_id") ?? "");
    const raw = String(formData.get("keywords") ?? "");
    const keywords = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    await setKeywordPack(categoryId, keywords);
    revalidatePath("/dashboard/settings");
  }

  async function saveWeightsAction(formData: FormData) {
    "use server";
    const parsed = settingsWeightSchema.parse({
      heuristic: Number(formData.get("heuristic")),
      ai: Number(formData.get("ai")),
    });
    const total = parsed.heuristic + parsed.ai;
    if (Math.abs(total - 1) > 0.001) {
      throw new Error("Heuristic + AI weights must equal 1.");
    }
    await setScoreWeights(parsed);
    revalidatePath("/dashboard/settings");
  }

  async function refreshContactsAction(formData: FormData) {
    "use server";
    const daysStale = Number(formData.get("days_stale") ?? 21);
    const limit = Number(formData.get("limit") ?? 60);
    const result = await refreshStaleLeadContacts({ daysStale, limit });
    revalidatePath("/dashboard/settings");
    redirect(
      `/dashboard/settings?maintenance=${encodeURIComponent(
        `Recheck complete: ${result.processed} processed, ${result.updated} updated, ${result.unchanged} unchanged.`,
      )}`,
    );
  }

  async function generateFollowUpAction(formData: FormData) {
    "use server";
    const daysSinceSent = Number(formData.get("days_since_sent") ?? 3);
    const limit = Number(formData.get("limit") ?? 60);
    const result = await generateFollowUpDrafts({ daysSinceSent, limit });
    revalidatePath("/dashboard/settings");
    redirect(
      `/dashboard/settings?maintenance=${encodeURIComponent(
        `Follow-up drafts: ${result.drafted} created out of ${result.processed} candidates.`,
      )}`,
    );
  }

  async function mergeDuplicatesAction(formData: FormData) {
    "use server";
    const limit = Number(formData.get("limit") ?? 200);
    const result = await mergeDuplicateLeads({ limit });
    revalidatePath("/dashboard/settings");
    redirect(`/dashboard/settings?maintenance=${encodeURIComponent(`Duplicate merge: ${result.merged} merged (${result.checked} checked).`)}`);
  }

  async function runNightlyAction() {
    "use server";
    const result = await runNightlyMaintenance();
    revalidatePath("/dashboard/settings");
    const assigned = result.campaignAssignments.reduce((sum, item) => sum + item.assigned, 0);
    const followups = result.followUpDrafts.reduce((sum, item) => sum + item.drafted, 0);
    redirect(
      `/dashboard/settings?maintenance=${encodeURIComponent(
        `Nightly run complete. Assigned ${assigned}, follow-ups ${followups}, contacts updated ${result.contactRefresh.updated}, duplicates merged ${result.duplicateMerge.merged}.`,
      )}`,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600">Manage categories, locations, keyword packs, and scoring weights.</p>
        {maintenanceMessage ? <p className="mt-2 text-sm text-emerald-700">{maintenanceMessage}</p> : null}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add Category</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addCategoryAction} className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input name="name" placeholder="Spa" required />
              </div>
              <div className="space-y-1">
                <Label>Default Angle</Label>
                <Select name="default_angle" defaultValue="booking">
                  <option value="booking">booking</option>
                  <option value="low_volume">low_volume</option>
                  <option value="organization">organization</option>
                </Select>
              </div>
              <Button type="submit">Save Category</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Location</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addLocationAction} className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input name="name" placeholder="Tacloban City" required />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input name="city" />
                </div>
                <div className="space-y-1">
                  <Label>Region</Label>
                  <Input name="region" />
                </div>
                <div className="space-y-1">
                  <Label>Country</Label>
                  <Input name="country" defaultValue="Philippines" />
                </div>
              </div>
              <Button type="submit">Save Location</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Keyword Packs</CardTitle>
          <CardDescription>Editable search packs per category.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((category) => (
            <form key={category.id} action={saveKeywordsAction} className="rounded-md border border-slate-200 p-3">
              <input type="hidden" name="category_id" value={category.id} />
              <Label>{category.name}</Label>
              <Textarea
                className="mt-2"
                name="keywords"
                defaultValue={(keywordMap.get(category.id) ?? []).join(", ")}
                placeholder="keyword1, keyword2, keyword3"
              />
              <Button type="submit" size="sm" className="mt-2">
                Save {category.name} Keywords
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scoring Weights</CardTitle>
          <CardDescription>Final score = heuristic * weight + ai * weight (sum must be 1).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveWeightsAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label>Heuristic Weight</Label>
              <Input name="heuristic" type="number" step="0.01" min="0" max="1" defaultValue={weights.heuristic} required />
            </div>
            <div className="space-y-1">
              <Label>AI Weight</Label>
              <Input name="ai" type="number" step="0.01" min="0" max="1" defaultValue={weights.ai} required />
            </div>
            <div className="self-end">
              <Button type="submit">Save Weights</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Freshness</CardTitle>
          <CardDescription>Recheck lead websites and refresh Facebook/email when stale.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={refreshContactsAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label>Days Stale</Label>
              <Input name="days_stale" type="number" min={1} max={180} defaultValue={21} required />
            </div>
            <div className="space-y-1">
              <Label>Max Leads Per Run</Label>
              <Input name="limit" type="number" min={1} max={200} defaultValue={60} required />
            </div>
            <div className="self-end">
              <Button type="submit">Run Recheck</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up Draft Engine</CardTitle>
          <CardDescription>Create follow-up message drafts for stale SENT leads (manual send only).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={generateFollowUpAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label>Days Since Sent</Label>
              <Input name="days_since_sent" type="number" min={1} max={30} defaultValue={3} required />
            </div>
            <div className="space-y-1">
              <Label>Max Leads</Label>
              <Input name="limit" type="number" min={1} max={300} defaultValue={60} required />
            </div>
            <div className="self-end">
              <Button type="submit">Generate Follow-ups</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Merge</CardTitle>
          <CardDescription>Consolidate duplicate leads and move messages/events into one master profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={mergeDuplicatesAction} className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label>Max Duplicates To Merge</Label>
              <Input name="limit" type="number" min={1} max={1000} defaultValue={200} required />
            </div>
            <div className="self-end">
              <Button type="submit" variant="secondary">
                Run Merge
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nightly Maintenance</CardTitle>
          <CardDescription>Run assignment, follow-up generation, contact refresh, and duplicate merge in one batch.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={runNightlyAction}>
            <Button type="submit" variant="outline">
              Run Full Nightly Now
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reference Lists</CardTitle>
          <CardDescription>Available categories and locations currently in use.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 text-sm text-slate-700">
          <div>
            <p className="mb-2 font-semibold text-slate-900">Categories</p>
            <ul className="space-y-1">
              {categories.map((category) => (
                <li key={category.id}>{category.name}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold text-slate-900">Locations</p>
            <ul className="space-y-1">
              {locations.map((location) => (
                <li key={location.id}>{location.name}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
