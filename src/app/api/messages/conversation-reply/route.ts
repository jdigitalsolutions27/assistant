import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { generateConversationReply } from "@/lib/ai";
import { conversationReplyRequestSchema } from "@/lib/validations";
import { getCategories } from "@/lib/services/data-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 20, windowMs: 60_000, bucket: "conversation-reply" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = conversationReplyRequestSchema.parse(body);
    const categories = await getCategories();
    const categoryName = payload.category_id
      ? categories.find((item) => item.id === payload.category_id)?.name
      : undefined;

    if (payload.image_base64 && payload.image_base64.length > 7_000_000) {
      return NextResponse.json({ error: "Image is too large. Use a smaller screenshot." }, { status: 400 });
    }

    const reply = await generateConversationReply({
      language: payload.language,
      tone: payload.tone,
      categoryName,
      conversationText: payload.conversation_text,
      imageBase64: payload.image_base64,
      imageMimeType: payload.image_mime_type,
    });

    return NextResponse.json(reply);
  } catch (error) {
    return jsonError(error, 400);
  }
}
