export type ContactReadinessInput = {
  facebook_url: string | null;
  website_url: string | null;
  email: string | null;
  phone: string | null;
};

export type ContactReadiness = {
  has_facebook: boolean;
  has_website: boolean;
  has_email: boolean;
  has_phone: boolean;
  available_channels: number;
  tier: "Ready" | "Partial" | "Needs Work";
};

function hasValidEmail(email: string | null): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function hasValidPhone(phone: string | null): boolean {
  if (!phone) return false;
  return phone.replace(/\D/g, "").length >= 7;
}

export function getContactReadiness(input: ContactReadinessInput): ContactReadiness {
  const has_facebook = Boolean(input.facebook_url?.trim());
  const has_website = Boolean(input.website_url?.trim());
  const has_email = hasValidEmail(input.email);
  const has_phone = hasValidPhone(input.phone);

  const available_channels = [has_facebook, has_website, has_email, has_phone].filter(Boolean).length;

  let tier: ContactReadiness["tier"] = "Needs Work";
  if (available_channels >= 3) tier = "Ready";
  else if (available_channels >= 2) tier = "Partial";

  return {
    has_facebook,
    has_website,
    has_email,
    has_phone,
    available_channels,
    tier,
  };
}
