import { ProspectingClient } from "@/components/dashboard/prospecting-client";
import { requireAuthenticatedPage } from "@/lib/auth";
import {
  getCategories,
  getKeywordPacks,
  getLocations,
  getRecommendedMessageStrategiesByCategory,
  getNicheRecommendations,
  getProspectingConfigs,
} from "@/lib/services/data-service";

export default async function ProspectingPage() {
  const user = await requireAuthenticatedPage("/dashboard/prospecting");
  const [allCategories, locations, allKeywordPacks, messageRecommendations] = await Promise.all([
    getCategories(),
    getLocations(),
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
    />
  );
}
