import { ProspectingClient } from "@/components/dashboard/prospecting-client";
import {
  getCategories,
  getKeywordPacks,
  getLocations,
  getRecommendedMessageStrategiesByCategory,
  getNicheRecommendations,
  getProspectingConfigs,
} from "@/lib/services/data-service";

export default async function ProspectingPage() {
  const [categories, locations, keywordPacks, configs, recommendations, messageRecommendations] = await Promise.all([
    getCategories(),
    getLocations(),
    getKeywordPacks(),
    getProspectingConfigs(),
    getNicheRecommendations(),
    getRecommendedMessageStrategiesByCategory(),
  ]);
  return (
    <ProspectingClient
      categories={categories}
      locations={locations}
      keywordPacks={keywordPacks}
      savedConfigs={configs}
      recommendations={recommendations}
      messageRecommendations={messageRecommendations}
    />
  );
}
