export type ContactConfidence = "high" | "medium" | "low" | "none";

export type ContactVerification = {
  email_confidence: ContactConfidence;
  phone_confidence: ContactConfidence;
  facebook_confidence: ContactConfidence;
  overall_score: number;
  notes: string[];
};

type ContactVerificationInput = {
  email?: string | null;
  phone?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const FB_BLOCKED_PATHS = ["sharer.php", "/dialog/", "/plugins/", "/share.php", "/hashtag/"];
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
]);

function confidenceWeight(value: ContactConfidence): number {
  if (value === "high") return 100;
  if (value === "medium") return 65;
  if (value === "low") return 30;
  return 0;
}

function normalizedHost(urlValue: string | null | undefined): string | null {
  if (!urlValue) return null;
  try {
    return new URL(urlValue).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function evaluateEmail(email: string | null | undefined, websiteUrl: string | null | undefined): {
  confidence: ContactConfidence;
  note: string | null;
} {
  if (!email) return { confidence: "none", note: "No email found." };
  const value = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(value)) return { confidence: "low", note: "Email format looks invalid." };

  const [, domain = ""] = value.split("@");
  if (!domain) return { confidence: "low", note: "Email domain missing." };
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return { confidence: "low", note: "Disposable email domain detected." };
  if (/noreply|no-reply|donotreply/i.test(value)) return { confidence: "low", note: "No-reply email detected." };

  const websiteHost = normalizedHost(websiteUrl);
  if (websiteHost && (domain === websiteHost || websiteHost.endsWith(`.${domain}`) || domain.endsWith(`.${websiteHost}`))) {
    return { confidence: "high", note: "Email domain matches website domain." };
  }

  return { confidence: "medium", note: "Email format is valid." };
}

function evaluatePhone(phone: string | null | undefined): {
  confidence: ContactConfidence;
  note: string | null;
} {
  if (!phone) return { confidence: "none", note: "No phone found." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return { confidence: "low", note: "Phone has too few digits." };

  if (digits.startsWith("63") && digits.length >= 11 && digits.length <= 13) {
    return { confidence: "high", note: "Phone appears valid for Philippines format." };
  }
  if (digits.startsWith("09") && digits.length === 11) {
    return { confidence: "high", note: "Mobile number appears valid for Philippines format." };
  }
  if (digits.length >= 9 && digits.length <= 13) {
    return { confidence: "medium", note: "Phone length looks valid." };
  }
  return { confidence: "low", note: "Phone format is uncertain." };
}

function evaluateFacebook(urlValue: string | null | undefined): {
  confidence: ContactConfidence;
  note: string | null;
} {
  if (!urlValue) return { confidence: "none", note: "No Facebook URL found." };
  try {
    const parsed = new URL(urlValue);
    const host = parsed.hostname.toLowerCase();
    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (!host.includes("facebook.com")) return { confidence: "low", note: "Facebook URL host is invalid." };
    if (FB_BLOCKED_PATHS.some((item) => path.includes(item))) return { confidence: "low", note: "Facebook URL points to a share/plugin path." };

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return { confidence: "low", note: "Facebook path is incomplete." };
    if (parts.length === 1) return { confidence: "high", note: "Facebook page/profile path looks valid." };
    if (parts.length === 2 && ["pages", "profile.php"].includes(parts[0])) {
      return { confidence: "medium", note: "Facebook page path may be valid." };
    }
    return { confidence: "medium", note: "Facebook URL appears reachable." };
  } catch {
    return { confidence: "low", note: "Facebook URL format is invalid." };
  }
}

export function evaluateContactVerification(input: ContactVerificationInput): ContactVerification {
  const email = evaluateEmail(input.email, input.website_url);
  const phone = evaluatePhone(input.phone);
  const facebook = evaluateFacebook(input.facebook_url);

  const overall_score = Math.round(
    confidenceWeight(email.confidence) * 0.34 +
      confidenceWeight(phone.confidence) * 0.28 +
      confidenceWeight(facebook.confidence) * 0.38,
  );

  const notes = [email.note, phone.note, facebook.note].filter((item): item is string => Boolean(item));

  return {
    email_confidence: email.confidence,
    phone_confidence: phone.confidence,
    facebook_confidence: facebook.confidence,
    overall_score,
    notes,
  };
}
