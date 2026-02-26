import { revalidatePath } from "next/cache";
import { ProspectingClient } from "@/components/dashboard/prospecting-client";
import { requireAuthenticatedPage } from "@/lib/auth";
import {
  addLocation,
  getCategories,
  getKeywordPacks,
  getLocations,
  getLocationsForUser,
  getRecommendedMessageStrategiesByCategory,
  getNicheRecommendations,
  getProspectingConfigs,
} from "@/lib/services/data-service";

export default async function ProspectingPage() {
  const user = await requireAuthenticatedPage("/dashboard/prospecting");
  const [allCategories, locations, allKeywordPacks, messageRecommendations] = await Promise.all([
    getCategories(),
    user.role === "AGENT" ? getLocationsForUser({ userId: user.id, role: user.role }) : getLocations(),
    getKeywordPacks(),
    getRecommendedMessageStrategiesByCategory(),
  ]);

  const categories =
    user.role === "AGENT"
      ? allCategories.filter((item) => item.id === user.assigned_category_id)
      : allCategories;
  const keywordPacks = allKeywordPacks.filter((pack) => categories.some((category) => category.id === pack.category_id));

  const [configs, recommendations] =
    user.role === "ADMIN"
      ? await Promise.all([getProspectingConfigs(), getNicheRecommendations()])
      : [[], []];

  async function addUserLocationAction(formData: FormData) {
    "use server";
    const sessionUser = await requireAuthenticatedPage("/dashboard/prospecting");
    if (sessionUser.role !== "AGENT") {
      return;
    }

    const name = String(formData.get("name") ?? "").trim();
    const region = String(formData.get("region") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim();
    if (!name || !region || !country) {
      throw new Error("Location name, region, and country are required.");
    }

    await addLocation({
      name,
      city: String(formData.get("city") ?? "").trim(),
      region,
      country,
      owner_user_id: sessionUser.id,
    });
    revalidatePath("/dashboard/prospecting");
  }

  return (
    <ProspectingClient
      categories={categories}
      locations={locations}
      keywordPacks={keywordPacks}
      savedConfigs={configs}
      recommendations={recommendations}
      messageRecommendations={messageRecommendations}
      agentMode={user.role === "AGENT"}
      lockedCategoryId={user.role === "AGENT" ? user.assigned_category_id : null}
      currentUserId={user.id}
      addLocationAction={user.role === "AGENT" ? addUserLocationAction : undefined}
    />
  );
}
