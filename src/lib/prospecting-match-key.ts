type MatchKeyInput = {
  place_id?: string | null;
  business_name?: string | null;
  address?: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  phone?: string | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function buildProspectingMatchKey(input: MatchKeyInput): string {
  const placeId = normalize(input.place_id);
  if (placeId) return `place:${placeId}`;

  return [
    "fallback",
    normalize(input.business_name),
    normalize(input.address),
    normalize(input.website_url),
    normalize(input.facebook_url),
    normalizePhone(input.phone),
  ].join("|");
}
