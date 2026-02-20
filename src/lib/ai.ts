import "server-only";

import OpenAI from "openai";
import { env, requireEnv } from "@/lib/env";
import { aiScoreSchema, conversationReplySchema, messageVariantsSchema } from "@/lib/validations";
import type { Lead, MessageAngle, MessageLanguage, MessageTone } from "@/lib/types";
import { clampScore } from "@/lib/utils";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return client;
}

function parseJsonObject<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const TAGALOG_WORDS = new Set([
  "po",
  "lang",
  "kayo",
  "kami",
  "namin",
  "ninyo",
  "kung",
  "paano",
  "puwede",
  "pwede",
  "maaari",
  "salamat",
  "kamusta",
  "mabilis",
  "tanong",
  "nakita",
  "gusto",
  "inyo",
  "asikaso",
  "maayos",
  "mga",
  "kapag",
  "abala",
  "bukas",
  "ngayon",
]);

const WARAY_WORDS = new Set([
  "maupay",
  "kumusta",
  "akon",
  "imo",
  "iyo",
  "gud",
  "la",
  "basi",
  "madasig",
  "pakiana",
  "karuyag",
  "nabulig",
  "negosyo",
  "sanglit",
  "yana",
  "kamo",
  "ha",
  "han",
  "nga",
  "hin",
  "kon",
]);

const ENGLISH_WORDS = new Set([
  "the",
  "and",
  "with",
  "for",
  "your",
  "you",
  "we",
  "can",
  "will",
  "if",
  "how",
  "business",
  "bookings",
  "messages",
  "inquiries",
  "quick",
  "help",
  "share",
  "sample",
  "workflow",
  "response",
  "follow",
  "up",
  "team",
  "local",
]);

function countWordHits(text: string, dictionary: Set<string>): number {
  const sanitized = text
    .toLowerCase()
    .replace(/j-digital solutions/g, " ")
    .replace(/[^a-zA-Z\s'-]/g, " ");
  const tokens = sanitized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let count = 0;
  for (const token of tokens) {
    if (dictionary.has(token)) count += 1;
  }
  return count;
}

function getLanguageRule(language: MessageLanguage): string {
  switch (language) {
    case "Taglish":
      return "Language must be true Taglish: every variant should naturally mix Tagalog + English.";
    case "English":
      return "Language must be pure English only. Do not use Tagalog or Waray words.";
    case "Tagalog":
      return "Language must be pure Tagalog only. Do not use English or Waray words, except proper names like J-Digital Solutions.";
    case "Waray":
      return "Language must be pure Waray only. Do not use English or Tagalog words, except proper names like J-Digital Solutions.";
    default:
      return "Use the requested language strictly.";
  }
}

function isLanguageCompliant(language: MessageLanguage, text: string): boolean {
  const tagalogHits = countWordHits(text, TAGALOG_WORDS);
  const warayHits = countWordHits(text, WARAY_WORDS);
  const englishHits = countWordHits(text, ENGLISH_WORDS);

  if (language === "English") {
    return tagalogHits === 0 && warayHits === 0;
  }
  if (language === "Tagalog") {
    return tagalogHits >= 2 && warayHits === 0 && englishHits === 0;
  }
  if (language === "Waray") {
    return warayHits >= 2 && englishHits === 0;
  }
  if (language === "Taglish") {
    return tagalogHits >= 1 && englishHits >= 1 && warayHits === 0;
  }
  return true;
}

function buildInitialFallbackVariants(args: {
  language: MessageLanguage;
  categoryName: string;
  businessName: string;
  locationName: string;
}): Array<{ variant_label: "A" | "B" | "C"; message_text: string }> {
  if (args.language === "English") {
    return [
      {
        variant_label: "A",
        message_text: `Hi, Jay here from J-Digital Solutions. I came across ${args.businessName} in ${args.locationName}. Quick question: how do you currently handle incoming inquiries during peak hours? We help ${args.categoryName.toLowerCase()} teams improve response flow and follow-up consistency. If you are open, I can share one practical idea for your page.`,
      },
      {
        variant_label: "B",
        message_text: `Hello, this is Jay from J-Digital Solutions. I noticed ${args.businessName} and wanted to ask if your inquiries are consistently turning into bookings. We help local ${args.categoryName.toLowerCase()} businesses organize lead handling and avoid missed opportunities. Would you like a short tailored suggestion?`,
      },
      {
        variant_label: "C",
        message_text: `Hi, Jay from J-Digital Solutions here. I saw your ${args.categoryName.toLowerCase()} presence in ${args.locationName}. Who handles your customer messages when your team gets busy? We support businesses with a simple system that keeps responses timely and organized. I can send a quick sample if helpful.`,
      },
    ];
  }

  if (args.language === "Tagalog") {
    return [
      {
        variant_label: "A",
        message_text: `Hi po, si Jay ito mula sa J-Digital Solutions. Napansin ko ang ${args.businessName} sa ${args.locationName}. Mabilis na tanong lang po: paano ninyo inaasikaso ang mga tanong ng kliyente kapag abala ang oras? Tumutulong kami sa mga negosyong ${args.categoryName.toLowerCase()} para mas maayos ang pagtugon at tuloy-tuloy ang pag-asikaso sa mga interesadong kliyente. Kung bukas po kayo, puwede akong magbahagi ng isang praktikal na mungkahi.`,
      },
      {
        variant_label: "B",
        message_text: `Magandang araw po, Jay mula sa J-Digital Solutions. Nakita ko ang ${args.businessName} at gusto ko lang itanong kung tuloy-tuloy ba ang pagpasok ng mga pagpapa-iskedyul mula sa mga tanong ng kliyente. Tinutulungan namin ang mga lokal na negosyong ${args.categoryName.toLowerCase()} na ayusin ang daloy ng pakikipag-usap para iwas sa napapabayaang mensahe. Gusto ninyo po ba ng maikling mungkahi na akma sa inyo?`,
      },
      {
        variant_label: "C",
        message_text: `Hi po, Jay ng J-Digital Solutions. Nakita ko ang inyong negosyong ${args.categoryName.toLowerCase()} sa ${args.locationName}. Sino po ang nag-aasikaso ng mga mensahe ng kliyente kapag abala ang grupo ninyo? May simple kaming paraan para mas malinaw ang proseso at mas mabilis ang pagsagot. Kung nais ninyo, magpapadala ako ng maikling halimbawa.`,
      },
    ];
  }

  if (args.language === "Waray") {
    return [
      {
        variant_label: "A",
        message_text: `Hi, ako hi Jay han J-Digital Solutions. Nakita ko an ${args.businessName} ha ${args.locationName}. Mayda la ako madasig nga pakiana: paonan-o niyo gin hahandle an inquiries kon busy an oras? Nabulig kami ha mga ${args.categoryName.toLowerCase()} negosyo basi mas maopay an response ngan follow-up. Kon okay ha imo, makakapaangbit ako hin usa nga praktikal nga ideya.`,
      },
      {
        variant_label: "B",
        message_text: `Hello, Jay ini tikang ha J-Digital Solutions. Nakita ko an ${args.businessName} ngan karuyag ko magpakiana kon an mga inquiry nagigin bookings ba hin regular. Nabulig kami ha local nga ${args.categoryName.toLowerCase()} negosyo basi maorganisa an lead handling ngan malikyan an naiiwan nga mensahe. Karuyag mo ba hin halipot nga suggestion para ha imo page?`,
      },
      {
        variant_label: "C",
        message_text: `Hi, Jay han J-Digital Solutions ini. Nakita ko an presence han imo ${args.categoryName.toLowerCase()} business ha ${args.locationName}. Hin-o an nag-aasikaso han customer chats kon busy an team? Mayda kami simple nga workflow basi mas madasig ngan mas organisado an replies. Kon karuyag mo, magpapadara ako hin usa nga sample.`,
      },
    ];
  }

  return [
    {
      variant_label: "A",
      message_text: `Hi! Jay here from J-Digital Solutions. Napansin ko ang ${args.businessName} sa ${args.locationName}. Quick question lang, paano niyo currently hina-handle ang inquiries kapag peak hours? We help ${args.categoryName.toLowerCase()} teams improve follow-ups and reduce missed opportunities. If open ka, I can share one quick idea for your page.`,
    },
    {
      variant_label: "B",
      message_text: `Hello, this is Jay from J-Digital Solutions. Nakita ko ang ${args.businessName} and I wanted to ask if incoming messages are consistently converted into bookings. We help local businesses organize response flow para less manual and less missed leads. If helpful, I can send a short tailored suggestion.`,
    },
    {
      variant_label: "C",
      message_text: `Hi po, Jay from J-Digital Solutions. We work with ${args.categoryName.toLowerCase()} businesses na gustong mas maayos ang inquiry-to-booking flow. Curious lang, who handles customer chats kapag busy ang team? If you'd like, I can share a simple workflow na puwedeng i-test.`,
    },
  ];
}

function buildFollowUpFallbackVariants(args: {
  language: MessageLanguage;
  categoryName: string;
  businessName: string;
  locationName: string;
}): Array<{ variant_label: "A" | "B" | "C"; message_text: string }> {
  if (args.language === "English") {
    return [
      {
        variant_label: "A",
        message_text: `Hi, Jay from J-Digital Solutions again. Quick follow-up for ${args.businessName} in ${args.locationName}. Would it help if I share one practical recommendation to improve inquiry handling and booking consistency?`,
      },
      {
        variant_label: "B",
        message_text: `Hello, this is Jay following up from J-Digital Solutions. In case my previous message got buried, would you be open to a short idea for your ${args.categoryName.toLowerCase()} workflow?`,
      },
      {
        variant_label: "C",
        message_text: `Hi, Jay here from J-Digital Solutions. Just checking in respectfully. Are you currently exploring ways to respond faster and follow up better with leads? I can send a short sample plan if useful.`,
      },
    ];
  }

  if (args.language === "Tagalog") {
    return [
      {
        variant_label: "A",
        message_text: `Hi po, follow-up lang po ito mula kay Jay ng J-Digital Solutions para sa ${args.businessName} sa ${args.locationName}. Bukas po ba kayo sa isang maikling rekomendasyon para mas maayos ang pag-asikaso ng mga tanong at mas tuloy-tuloy ang pagpapa-iskedyul?`,
      },
      {
        variant_label: "B",
        message_text: `Hello po, si Jay ito ng J-Digital Solutions. Baka natabunan lang ang nauna kong mensahe, kaya mag-follow-up lang po ako. Gusto ninyo po ba ng isang maikling mungkahi para sa daloy ng inyong negosyong ${args.categoryName.toLowerCase()}?`,
      },
      {
        variant_label: "C",
        message_text: `Hi po, Jay mula sa J-Digital Solutions. Magalang na follow-up lang po: naghahanap ba kayo ngayon ng paraan para mas mabilis ang pagsagot at mas maayos ang pagbalik sa mga interesadong kliyente? Kung oo, puwede akong magpadala ng maikling halimbawa.`,
      },
    ];
  }

  if (args.language === "Waray") {
    return [
      {
        variant_label: "A",
        message_text: `Hi, follow-up la ini tikang kan Jay han J-Digital Solutions para ha ${args.businessName} ha ${args.locationName}. Bukas ba kamo ha usa nga halipot nga rekomendasyon basi mas maopay an inquiry handling ngan booking consistency?`,
      },
      {
        variant_label: "B",
        message_text: `Hello, ako hi Jay han J-Digital Solutions. Basin natabunan la an akon nauna nga mensahe, sanglit nagfo-follow up la ako. Karuyag niyo ba hin usa nga madasig nga ideya para ha iyo ${args.categoryName.toLowerCase()} workflow?`,
      },
      {
        variant_label: "C",
        message_text: `Hi, Jay ini tikang ha J-Digital Solutions. Magalang la nga follow-up: nagbibiling ba kamo yana hin paagi basi mas madasig an responses ngan mas organisado an follow-up ha leads? Kon oo, makakapaangbit ako hin halipot nga sample plan.`,
      },
    ];
  }

  return [
    {
      variant_label: "A",
      message_text: `Hi! Jay from J-Digital Solutions again. Quick follow-up lang for ${args.businessName} sa ${args.locationName}. Open ba kayo sa one practical recommendation para mas maayos ang inquiry handling and booking consistency?`,
    },
    {
      variant_label: "B",
      message_text: `Hello, Jay here from J-Digital Solutions. Baka natabunan lang yung previous message ko, so quick follow-up lang. Would it help if I share a short idea for your ${args.categoryName.toLowerCase()} workflow?`,
    },
    {
      variant_label: "C",
      message_text: `Hi po, Jay from J-Digital Solutions. Gentle follow-up lang: are you currently looking for ways na mas mapabilis ang response at follow-up sa leads? If yes, I can send a quick sample plan.`,
    },
  ];
}

function enforceLanguageOrFallback(
  language: MessageLanguage,
  variants: Array<{ variant_label: "A" | "B" | "C"; message_text: string }>,
  fallback: Array<{ variant_label: "A" | "B" | "C"; message_text: string }>,
) {
  const ok = variants.every((variant) => isLanguageCompliant(language, variant.message_text));
  return ok ? variants : fallback;
}

export async function generateAiLeadScore(args: {
  lead: Lead;
  categoryName?: string;
  locationName?: string;
  heuristicReasons: string[];
}): Promise<{
  score: number;
  reasons: string[];
  opportunity_summary: string;
  suggested_angle: MessageAngle;
}> {
  if (!env.OPENAI_API_KEY) {
    return {
      score: 50,
      reasons: ["OPENAI_API_KEY is not configured, using fallback score."],
      opportunity_summary: "Configure OpenAI for richer lead intent analysis.",
      suggested_angle: "organization",
    };
  }

  const systemPrompt = [
    "You score lead quality for a local digital agency.",
    "Return strict JSON only. No markdown.",
    'Schema: {"score": number 0-100, "reasons": string[], "opportunity_summary": string, "suggested_angle": "booking"|"low_volume"|"organization"}',
    "Avoid guarantees or unrealistic claims.",
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      lead: args.lead,
      category: args.categoryName ?? "Unknown",
      location: args.locationName ?? "Unknown",
      heuristic_reasons: args.heuristicReasons,
    },
    null,
    2,
  );

  const response = await getClient().responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    temperature: 0.2,
  });

  const text = response.output_text;
  const parsed = parseJsonObject<unknown>(text);
  const validated = aiScoreSchema.safeParse(parsed);

  if (!validated.success) {
    return {
      score: 55,
      reasons: ["AI returned non-conforming response; fallback score applied."],
      opportunity_summary: "Lead likely has potential but needs manual review.",
      suggested_angle: "organization",
    };
  }

  return {
    ...validated.data,
    score: clampScore(validated.data.score),
  };
}

export async function generateOutreachVariants(args: {
  lead: Lead;
  categoryName: string;
  locationName: string;
  language: MessageLanguage;
  tone: MessageTone;
  angle: MessageAngle;
  templateHint?: string | null;
}): Promise<
  Array<{
    variant_label: "A" | "B" | "C";
    message_text: string;
  }>
> {
  const fallback = buildInitialFallbackVariants({
    language: args.language,
    categoryName: args.categoryName,
    businessName: args.lead.business_name ?? "your business",
    locationName: args.locationName,
  });

  if (!env.OPENAI_API_KEY) return fallback;

  const systemPrompt = [
    "You write compliant outreach messages for manual Facebook Page messaging.",
    "Never claim guaranteed results. Avoid spam phrasing.",
    "Each message must include: friendly intro as Jay from J-Digital Solutions, business context, one qualifying question, clear value, soft CTA.",
    getLanguageRule(args.language),
    "Keep each variant concise (about 70-120 words) for fast reading.",
    "Return strict JSON only with 3 variants A/B/C.",
    'Schema: {"variants":[{"variant_label":"A|B|C","message_text":"..."}]}',
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      lead: args.lead,
      category: args.categoryName,
      location: args.locationName,
      language: args.language,
      tone: args.tone,
      angle: args.angle,
      template_hint: args.templateHint ?? null,
    },
    null,
    2,
  );

  try {
    const response = await getClient().responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      temperature: 0.45,
      max_output_tokens: 900,
    });

    const parsed = parseJsonObject<unknown>(response.output_text);
    const validated = messageVariantsSchema.safeParse(parsed);
    if (validated.success) {
      return enforceLanguageOrFallback(args.language, validated.data.variants, fallback);
    }
  } catch {
    // fall through to fallback.
  }

  return fallback;
}

export async function generateQuickMessageVariants(args: {
  categoryName: string;
  language: MessageLanguage;
  tone: MessageTone;
  angle: MessageAngle;
  businessName?: string;
  locationName?: string;
  context?: string;
  templateHint?: string | null;
}): Promise<
  Array<{
    variant_label: "A" | "B" | "C";
    message_text: string;
  }>
> {
  const fallback = buildInitialFallbackVariants({
    language: args.language,
    categoryName: args.categoryName,
    businessName: args.businessName ?? "your business",
    locationName: args.locationName ?? "your area",
  });

  if (!env.OPENAI_API_KEY) return fallback;

  const systemPrompt = [
    "You generate compliant outreach messages for manual Facebook Page messaging.",
    "Never claim guaranteed results. Avoid spam phrases.",
    getLanguageRule(args.language),
    "Keep each variant concise (about 70-120 words) for faster generation and easy reading.",
    "Return strict JSON only with variants A/B/C.",
    "Each message must include: intro as Jay from J-Digital Solutions, context, qualifying question, clear value, soft CTA.",
    'Schema: {"variants":[{"variant_label":"A|B|C","message_text":"..."}]}',
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      category: args.categoryName,
      language: args.language,
      tone: args.tone,
      angle: args.angle,
      business_name: args.businessName ?? null,
      location: args.locationName ?? null,
      context: args.context ?? null,
      template_hint: args.templateHint ?? null,
    },
    null,
    2,
  );

  try {
    const response = await getClient().responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      temperature: 0.42,
      max_output_tokens: 900,
    });

    const parsed = parseJsonObject<unknown>(response.output_text);
    const validated = messageVariantsSchema.safeParse(parsed);
    if (validated.success) return enforceLanguageOrFallback(args.language, validated.data.variants, fallback);
  } catch {
    // fall through
  }

  return fallback;
}

export async function generateConversationReply(args: {
  language: MessageLanguage;
  tone: MessageTone;
  categoryName?: string;
  conversationText?: string;
  imageBase64?: string;
  imageMimeType?: "image/png" | "image/jpeg" | "image/webp";
}): Promise<{
  primary_reply: string;
  alternatives: string[];
  detected_intent: string;
  notes: string[];
}> {
  const fallback = {
    primary_reply:
      "Hi! Jay here from J-Digital Solutions. Thanks for the message. Happy to help clarify this for you. Can I ask one quick detail so I can give the most useful suggestion for your setup?",
    alternatives: [
      "Thank you for reaching out. We can work around your schedule. Would you be open to a short chat so I can understand your current process first?",
      "Appreciate your message. We usually start with a quick review of your current inquiry flow, then suggest practical next steps. Would that be okay?",
    ],
    detected_intent: "General inquiry",
    notes: ["Fallback response used because AI parsing was unavailable."],
  };

  if (!env.OPENAI_API_KEY) return fallback;

  const systemPrompt = [
    "You are helping craft a human reply for Facebook Page conversations.",
    "Style: conversational, respectful, non-spammy, no guaranteed claims.",
    "Return strict JSON only.",
    'Schema: {"primary_reply": string, "alternatives": [string, string], "detected_intent": string, "notes": string[]}',
  ].join("\n");

  const userPayload = {
    category: args.categoryName ?? "Business",
    language: args.language,
    tone: args.tone,
    conversation_text: args.conversationText ?? null,
    instruction: "Summarize intent and produce best reply + 2 alternatives.",
  };

  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" | "low" | "high" }
  > = [{ type: "input_text", text: JSON.stringify(userPayload, null, 2) }];

  if (args.imageBase64 && args.imageMimeType) {
    content.push({
      type: "input_image",
      image_url: `data:${args.imageMimeType};base64,${args.imageBase64}`,
      detail: "auto",
    });
  }

  try {
    const response = await getClient().responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.4,
    });

    const parsed = parseJsonObject<unknown>(response.output_text);
    const validated = conversationReplySchema.safeParse(parsed);
    if (validated.success) return validated.data;
  } catch {
    // fall through
  }

  return fallback;
}

export async function generateFollowUpVariants(args: {
  lead: Lead;
  categoryName: string;
  locationName: string;
  language: MessageLanguage;
  tone: MessageTone;
  angle: MessageAngle;
  context?: string;
}): Promise<
  Array<{
    variant_label: "A" | "B" | "C";
    message_text: string;
  }>
> {
  const fallback = buildFollowUpFallbackVariants({
    language: args.language,
    categoryName: args.categoryName,
    businessName: args.lead.business_name ?? "your business",
    locationName: args.locationName,
  });

  if (!env.OPENAI_API_KEY) return fallback;

  const systemPrompt = [
    "You generate respectful follow-up outreach messages for manual Facebook Page messaging.",
    "No spam, no pressure language, no guaranteed claims.",
    getLanguageRule(args.language),
    "Keep each variant concise (about 50-95 words).",
    "Message should acknowledge this is a follow-up and ask one qualifying question.",
    "Return strict JSON only with 3 variants A/B/C.",
    'Schema: {"variants":[{"variant_label":"A|B|C","message_text":"..."}]}',
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      lead: args.lead,
      category: args.categoryName,
      location: args.locationName,
      language: args.language,
      tone: args.tone,
      angle: args.angle,
      context: args.context ?? null,
    },
    null,
    2,
  );

  try {
    const response = await getClient().responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      temperature: 0.4,
      max_output_tokens: 800,
    });

    const parsed = parseJsonObject<unknown>(response.output_text);
    const validated = messageVariantsSchema.safeParse(parsed);
    if (validated.success) return enforceLanguageOrFallback(args.language, validated.data.variants, fallback);
  } catch {
    // fall through
  }

  return fallback;
}
