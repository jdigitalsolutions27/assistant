import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddLocationForm } from "@/components/dashboard/add-location-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import {
  addCategory,
  addLocation,
  createUserAccount,
  deleteLocation,
  deleteUserAccount,
  getCategories,
  getKeywordPacks,
  getLocations,
  mergeDuplicateLeads,
  getUserAccounts,
  getScoreWeights,
  getUserOwnedLocationsForAdmin,
  setKeywordPack,
  setScoreWeights,
  updateUserAccess,
  updateUserPasswordHash,
} from "@/lib/services/data-service";
import { requireAdminPage } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { generateFollowUpDrafts, refreshStaleLeadContacts, runNightlyMaintenance } from "@/lib/services/maintenance-service";
import { settingsWeightSchema, userAccessUpdateSchema, userCreateSchema, userDeleteSchema, userPasswordResetSchema } from "@/lib/validations";
import { z } from "zod";

const locationDeleteSchema = z.object({
  location_id: z.string().uuid(),
});

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUser = await requireAdminPage("/dashboard/settings");
  const params = await searchParams;
  const maintenanceMessage = typeof params.maintenance === "string" ? params.maintenance : null;
  const accountMessage = typeof params.account === "string" ? params.account : null;
  const [categories, locations, userOwnedLocations, keywordPacks, weights, users] = await Promise.all([
    getCategories(),
    getLocations(),
    getUserOwnedLocationsForAdmin(),
    getKeywordPacks(),
    getScoreWeights(),
    getUserAccounts(),
  ]);
  const keywordMap = new Map(keywordPacks.map((pack) => [pack.category_id, pack.keywords]));
  const categoryMap = new Map(categories.map((item) => [item.id, item.name]));
  const activeUsers = users.filter((item) => item.is_active).length;
  const adminUsers = users.filter((item) => item.role === "ADMIN").length;
  const agentUsers = users.filter((item) => item.role === "AGENT").length;

  async function addCategoryAction(formData: FormData) {
    "use server";
    await addCategory(String(formData.get("name") ?? ""), String(formData.get("default_angle") ?? "booking"));
    revalidatePath("/dashboard/settings");
  }

  async function addLocationAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const region = String(formData.get("region") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim();
    if (!name) {
      throw new Error("Target location name is required.");
    }
    if (!region) {
      throw new Error("Region is required.");
    }
    if (!country) {
      throw new Error("Country is required.");
    }
    await addLocation({
      name,
      city: String(formData.get("city") ?? "").trim(),
      region,
      country,
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

  async function createUserAction(formData: FormData) {
    "use server";
    try {
      const parsed = userCreateSchema.parse({
        username: String(formData.get("username") ?? ""),
        display_name: String(formData.get("display_name") ?? ""),
        password: String(formData.get("password") ?? ""),
        role: String(formData.get("role") ?? "AGENT"),
        assigned_category_id: String(formData.get("assigned_category_id") ?? "") || null,
        is_active: String(formData.get("is_active") ?? "") === "on",
        must_change_password: String(formData.get("must_change_password") ?? "") === "on",
      });

      const password_hash = await hashPassword(parsed.password);
      await createUserAccount({
        username: parsed.username,
        display_name: parsed.display_name,
        password_hash,
        role: parsed.role,
        assigned_category_id: parsed.assigned_category_id ?? null,
        is_active: parsed.is_active,
        must_change_password: parsed.must_change_password,
      });

      revalidatePath("/dashboard/settings");
      redirect("/dashboard/settings?account=User%20account%20created.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user account.";
      redirect(`/dashboard/settings?account=${encodeURIComponent(message)}`);
    }
  }

  async function updateUserAccessAction(formData: FormData) {
    "use server";
    try {
      const parsed = userAccessUpdateSchema.parse({
        user_id: String(formData.get("user_id") ?? ""),
        role: String(formData.get("role") ?? "AGENT"),
        assigned_category_id: String(formData.get("assigned_category_id") ?? "") || null,
        is_active: String(formData.get("is_active") ?? "") === "on",
      });

      if (parsed.user_id === adminUser.id && !parsed.is_active) {
        throw new Error("You cannot deactivate your own account.");
      }

      await updateUserAccess({
        userId: parsed.user_id,
        role: parsed.role,
        assigned_category_id: parsed.assigned_category_id ?? null,
        is_active: parsed.is_active,
      });

      revalidatePath("/dashboard/settings");
      redirect("/dashboard/settings?account=User%20access%20updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update user access.";
      redirect(`/dashboard/settings?account=${encodeURIComponent(message)}`);
    }
  }

  async function resetPasswordAction(formData: FormData) {
    "use server";
    try {
      const parsed = userPasswordResetSchema.parse({
        user_id: String(formData.get("user_id") ?? ""),
        password: String(formData.get("password") ?? ""),
        must_change_password: String(formData.get("must_change_password") ?? "") === "on",
      });

      const hash = await hashPassword(parsed.password);
      await updateUserPasswordHash(parsed.user_id, hash, parsed.must_change_password);

      revalidatePath("/dashboard/settings");
      redirect("/dashboard/settings?account=Password%20updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset password.";
      redirect(`/dashboard/settings?account=${encodeURIComponent(message)}`);
    }
  }

  async function deleteUserAction(formData: FormData) {
    "use server";
    try {
      const parsed = userDeleteSchema.parse({
        user_id: String(formData.get("user_id") ?? ""),
      });

      if (parsed.user_id === adminUser.id) {
        throw new Error("You cannot delete your own account.");
      }

      await deleteUserAccount(parsed.user_id);
      revalidatePath("/dashboard/settings");
      redirect("/dashboard/settings?account=User%20account%20deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete user account.";
      redirect(`/dashboard/settings?account=${encodeURIComponent(message)}`);
    }
  }

  async function deleteLocationAction(formData: FormData) {
    "use server";
    try {
      const parsed = locationDeleteSchema.parse({
        location_id: String(formData.get("location_id") ?? ""),
      });

      await deleteLocation(parsed.location_id);
      revalidatePath("/dashboard/settings");
      redirect("/dashboard/settings?maintenance=Location%20deleted%20successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete location.";
      redirect(`/dashboard/settings?maintenance=${encodeURIComponent(message)}`);
    }
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Manage categories, locations, keyword packs, scoring weights, and user access.</p>
        {maintenanceMessage ? (
          <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            {maintenanceMessage}
          </p>
        ) : null}
        {accountMessage ? (
          <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
            {accountMessage}
          </p>
        ) : null}
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
            <CardDescription>
              Use Region VIII quick add for local targeting, or switch to International / Manual Add for global locations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddLocationForm action={addLocationAction} allowInternational />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>User Accounts</CardTitle>
          <CardDescription>Create agent/admin accounts and control category access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs text-slate-600 dark:text-slate-300">Total users</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{users.length}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs text-slate-600 dark:text-slate-300">Active</p>
              <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">{activeUsers}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs text-slate-600 dark:text-slate-300">Admins</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{adminUsers}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-xs text-slate-600 dark:text-slate-300">Agents</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{agentUsers}</p>
            </div>
          </div>

          <form action={createUserAction} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1">
                <Label>Username</Label>
                <Input name="username" placeholder="agent.spa.01" required />
              </div>
              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input name="display_name" placeholder="Spa Agent 01" required />
              </div>
              <div className="space-y-1">
                <Label>Initial Password</Label>
                <PasswordInput name="password" minLength={8} required />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select name="role" defaultValue="AGENT">
                  <option value="AGENT">AGENT</option>
                  <option value="ADMIN">ADMIN</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Assigned Category (for agents)</Label>
                <Select name="assigned_category_id" defaultValue={categories[0]?.id ?? ""}>
                  <option value="">None</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Options</Label>
                <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" name="is_active" defaultChecked />
                    Active
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" name="must_change_password" />
                    Must change password
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Button type="submit">Create User Account</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Accounts</CardTitle>
          <CardDescription>{users.length} user accounts currently configured.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.map((user) => (
            <details key={user.id} className="group rounded-lg border border-slate-200 bg-white/70 transition-colors open:bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50 dark:open:bg-slate-800/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {user.display_name} <span className="font-normal text-slate-600 dark:text-slate-300">({user.username})</span>
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Assigned: {user.assigned_category_id ? categoryMap.get(user.assigned_category_id) ?? "Unknown category" : "None"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-slate-300 px-2 py-1 font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">
                    {user.role}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 font-medium ${
                      user.is_active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                  {user.id === adminUser.id ? (
                    <span className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-700 dark:bg-sky-900/40 dark:text-sky-300">You</span>
                  ) : null}
                </div>
              </summary>

              <div className="grid gap-3 border-t border-slate-200 px-4 py-4 dark:border-slate-700 lg:grid-cols-2">
                <form action={updateUserAccessAction} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <input type="hidden" name="user_id" value={user.id} />
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Access</p>
                  <div className="grid gap-2">
                    <div className="space-y-1">
                      <Label>Role</Label>
                      <Select name="role" defaultValue={user.role}>
                        <option value="AGENT">AGENT</option>
                        <option value="ADMIN">ADMIN</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Assigned Category</Label>
                      <Select name="assigned_category_id" defaultValue={user.assigned_category_id ?? ""}>
                        <option value="">None</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" name="is_active" defaultChecked={user.is_active} />
                      Active
                    </label>
                    <Button type="submit" variant="outline">
                      Save Access
                    </Button>
                  </div>
                </form>

                <form action={resetPasswordAction} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <input type="hidden" name="user_id" value={user.id} />
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Password</p>
                  <div className="grid gap-2">
                    <div className="space-y-1">
                      <Label>New Password</Label>
                      <PasswordInput name="password" minLength={8} required />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input type="checkbox" name="must_change_password" defaultChecked={user.must_change_password} />
                      Force password change on next login
                    </label>
                    <Button type="submit" variant="secondary">
                      Reset Password
                    </Button>
                  </div>
                </form>

                <div className="rounded-md border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/50 dark:bg-rose-950/20 lg:col-span-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Danger Zone</p>
                  {user.id !== adminUser.id ? (
                    <ConfirmActionForm
                      action={deleteUserAction}
                      fields={{ user_id: user.id }}
                      buttonLabel="Delete User"
                      confirmTitle="Delete User Account?"
                      confirmDescription={`This will permanently delete ${user.display_name} (${user.username}) and all active sessions.`}
                      buttonVariant="destructive"
                      buttonSize="sm"
                    />
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Current session account cannot be deleted.</p>
                  )}
                </div>
              </div>
            </details>
          ))}
          {users.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-300">No user accounts yet.</p> : null}
        </CardContent>
      </Card>

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
          <CardDescription>Available categories and locations currently in use (global + user-owned).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 text-sm text-slate-700">
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
            <ul className="space-y-2">
              {locations.map((location) => (
                <li key={location.id} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{location.name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {location.city || "No city"}, {location.region || "No region"}, {location.country || "No country"}
                      </p>
                    </div>
                    <ConfirmActionForm
                      action={deleteLocationAction}
                      fields={{ location_id: location.id }}
                      buttonLabel="Delete"
                      confirmTitle="Delete Location?"
                      confirmDescription={`This will remove "${location.name}" from your location list. Existing leads will keep working, but location links may be unset.`}
                      buttonVariant="destructive"
                      buttonSize="sm"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold text-slate-900">User-Owned Locations</p>
            <ul className="space-y-2">
              {userOwnedLocations.map((location) => (
                <li key={location.id} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{location.name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Owner: {location.owner_display_name} ({location.owner_username})
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {location.city || "No city"}, {location.region || "No region"}, {location.country || "No country"}
                      </p>
                    </div>
                    <ConfirmActionForm
                      action={deleteLocationAction}
                      fields={{ location_id: location.id }}
                      buttonLabel="Delete"
                      confirmTitle="Delete User Location?"
                      confirmDescription={`This will remove "${location.name}" from ${location.owner_display_name}'s private list.`}
                      buttonVariant="destructive"
                      buttonSize="sm"
                    />
                  </div>
                </li>
              ))}
              {userOwnedLocations.length === 0 ? <li className="text-xs text-slate-500 dark:text-slate-300">No user-owned locations yet.</li> : null}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
