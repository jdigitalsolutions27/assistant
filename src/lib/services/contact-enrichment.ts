import "server-only";

import { normalizeUrl } from "@/lib/utils";

type ContactEnrichment = {
  facebook_url: string | null;
  email: string | null;
  checked_at: string;
};

type CacheItem = {
  value: ContactEnrichment;
  expiresAt: number;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const cache = new Map<string, CacheItem>();

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const EMAIL_VALID_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeHtmlValue(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&#x2F;", "/").trim();
}

function isBlockedFacebookPath(url: URL): boolean {
  const blocked = ["sharer.php", "/dialog/", "/plugins/", "/share.php", "/hashtag/"];
  const path = `${url.pathname}${url.search}`.toLowerCase();
  return blocked.some((item) => path.includes(item));
}

function scoreFacebookUrl(url: URL): number {
  let score = 0;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const pathParts = path.split("/").filter(Boolean);

  if (host.includes("facebook.com")) score += 25;
  if (host.startsWith("www.")) score += 5;
  if (pathParts.length === 1) score += 10;
  if (pathParts.length === 2 && ["pages", "profile.php"].includes(pathParts[0])) score += 8;
  if (!url.search) score += 5;
  if (isBlockedFacebookPath(url)) score -= 100;
  return score;
}

function extractFacebookUrl(html: string, baseUrl: string): string | null {
  const hrefMatches = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)];
  const candidates: Array<{ url: string; score: number }> = [];

  for (const match of hrefMatches) {
    const raw = normalizeHtmlValue(match[1] ?? "");
    if (!raw.toLowerCase().includes("facebook.com")) continue;
    try {
      const resolved = new URL(raw, baseUrl);
      if (!resolved.hostname.toLowerCase().includes("facebook.com")) continue;
      if (isBlockedFacebookPath(resolved)) continue;
      candidates.push({ url: resolved.toString(), score: scoreFacebookUrl(resolved) });
    } catch {
      continue;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url ?? null;
}

function extractEmailCandidates(html: string): string[] {
  const candidates = new Set<string>();
  const mailtoMatches = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)];
  for (const match of mailtoMatches) {
    if (match[1]) candidates.add(match[1].trim().toLowerCase());
  }

  const regexMatches = html.match(EMAIL_PATTERN) ?? [];
  for (const value of regexMatches) {
    candidates.add(value.trim().toLowerCase());
  }
  return Array.from(candidates);
}

function scoreEmail(email: string, siteHost: string): number {
  const sanitized = email.replace(/[),;.]$/, "");
  if (!EMAIL_VALID_PATTERN.test(sanitized)) return -100;
  if (sanitized.endsWith(".png") || sanitized.endsWith(".jpg") || sanitized.endsWith(".webp")) return -100;

  let score = 0;
  const domain = sanitized.split("@")[1]?.toLowerCase() ?? "";
  if (domain && siteHost.endsWith(domain)) score += 20;
  if (domain && domain.endsWith(siteHost.replace(/^www\./i, ""))) score += 15;
  if (/^info@|^contact@|^admin@|^sales@|^hello@/i.test(sanitized)) score += 5;
  if (/noreply|no-reply|donotreply/i.test(sanitized)) score -= 20;
  return score;
}

function extractBestEmail(html: string, siteHost: string): string | null {
  const candidates = extractEmailCandidates(html)
    .map((value) => ({
      email: value.replace(/[),;.]$/, ""),
      score: scoreEmail(value, siteHost),
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.email ?? null;
}

function extractContactLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const hrefMatches = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)];
  const base = new URL(baseUrl);

  for (const match of hrefMatches) {
    const raw = normalizeHtmlValue(match[1] ?? "");
    if (!raw) continue;
    if (!/contact|about|inquiry|support|reach/i.test(raw)) continue;
    try {
      const url = new URL(raw, baseUrl);
      if (url.origin !== base.origin) continue;
      links.add(url.toString());
      if (links.size >= 3) break;
    } catch {
      continue;
    }
  }

  return Array.from(links);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5500),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JALA/1.0; +https://j-digital.local)",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    return html.slice(0, 500_000);
  } catch {
    return null;
  }
}

function getCached(url: string): ContactEnrichment | null {
  const item = cache.get(url);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    cache.delete(url);
    return null;
  }
  return item.value;
}

function setCached(url: string, value: ContactEnrichment): void {
  cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function enrichWebsiteContactData(websiteUrl: string): Promise<ContactEnrichment> {
  const normalized = normalizeUrl(websiteUrl);
  if (!normalized) {
    return {
      facebook_url: null,
      email: null,
      checked_at: new Date().toISOString(),
    };
  }

  const cached = getCached(normalized);
  if (cached) return cached;

  let facebookUrl: string | null = null;
  let email: string | null = null;

  const homeHtml = await fetchHtml(normalized);
  if (homeHtml) {
    const host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
    facebookUrl = extractFacebookUrl(homeHtml, normalized);
    email = extractBestEmail(homeHtml, host);

    if (!facebookUrl || !email) {
      const contactPages = extractContactLinks(homeHtml, normalized);
      for (const pageUrl of contactPages) {
        const pageHtml = await fetchHtml(pageUrl);
        if (!pageHtml) continue;
        if (!facebookUrl) {
          facebookUrl = extractFacebookUrl(pageHtml, pageUrl);
        }
        if (!email) {
          email = extractBestEmail(pageHtml, host);
        }
        if (facebookUrl && email) break;
      }
    }
  }

  const result = {
    facebook_url: facebookUrl,
    email,
    checked_at: new Date().toISOString(),
  };
  setCached(normalized, result);
  return result;
}
