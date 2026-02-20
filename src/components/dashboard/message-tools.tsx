"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/client-http";
import type { Category, MessageAngle } from "@/lib/types";

type Variant = {
  variant_label: "A" | "B" | "C";
  message_text: string;
};

type ConversationReply = {
  primary_reply: string;
  alternatives: string[];
  detected_intent: string;
  notes: string[];
};

const angleOptions: MessageAngle[] = ["booking", "low_volume", "organization"];

export function MessageTools({
  categories,
  showQuickGenerator = true,
  showConversationAssistant = true,
}: {
  categories: Category[];
  showQuickGenerator?: boolean;
  showConversationAssistant?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [language, setLanguage] = useState<"Taglish" | "English" | "Tagalog" | "Waray">("Taglish");
  const [tone, setTone] = useState<"Soft" | "Direct" | "Value-Focused">("Soft");
  const [angle, setAngle] = useState<MessageAngle>("booking");
  const [businessName, setBusinessName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [quickMessage, setQuickMessage] = useState<string | null>(null);

  const [conversationText, setConversationText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyMessage, setReplyMessage] = useState<string | null>(null);
  const [reply, setReply] = useState<ConversationReply | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<"image/png" | "image/jpeg" | "image/webp" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === categoryId)?.name ?? "Business",
    [categories, categoryId],
  );

  async function handleGenerateQuickMessage() {
    if (!categoryId) return;
    setGenerating(true);
    setVariants([]);
    setQuickMessage(null);
    try {
      const payload = await requestJson<{ variants?: Variant[]; error?: string }>("/api/messages/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          language,
          tone,
          angle,
          business_name: businessName || undefined,
          location_name: locationName || undefined,
          context: context || undefined,
        }),
        timeoutMs: 45_000,
      });
      setVariants(payload.variants ?? []);
      setQuickMessage("Generated 3 variants.");
    } catch (error) {
      setQuickMessage(error instanceof Error ? error.message : "Failed to generate message.");
    } finally {
      setGenerating(false);
    }
  }

  async function onUploadImage(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setReplyMessage("Use PNG, JPEG, or WEBP screenshot.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setReplyMessage("Image too large. Please upload a file under 4MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const base64 = value.includes(",") ? value.split(",")[1] : value;
      setImageBase64(base64 || null);
      setImageMimeType(file.type as "image/png" | "image/jpeg" | "image/webp");
      setFileName(file.name);
      setReplyMessage(`Loaded ${file.name}`);
    };
    reader.onerror = () => {
      setReplyMessage("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  }

  function clearUploadedImage() {
    setImageBase64(null);
    setImageMimeType(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleGenerateReply() {
    setReplyLoading(true);
    setReplyMessage(null);
    setReply(null);
    try {
      const payload = await requestJson<ConversationReply & { error?: string }>("/api/messages/conversation-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId || undefined,
          language,
          tone,
          conversation_text: conversationText || undefined,
          image_base64: imageBase64 || undefined,
          image_mime_type: imageMimeType || undefined,
        }),
        timeoutMs: 45_000,
      });
      setReply(payload);
      setReplyMessage("Reply suggestions generated.");
    } catch (error) {
      setReplyMessage(error instanceof Error ? error.message : "Failed to generate reply.");
    } finally {
      setReplyLoading(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setQuickMessage("Copied to clipboard.");
    setReplyMessage("Copied to clipboard.");
  }

  return (
    <div className="space-y-6">
      {showQuickGenerator ? (
        <Card>
          <CardHeader>
            <CardTitle>Quick Message Generator</CardTitle>
            <CardDescription>
              Select category, language, and tone then generate ready-to-send manual outreach drafts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Language</Label>
                <Select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
                  <option value="Taglish">Taglish</option>
                  <option value="English">English</option>
                  <option value="Tagalog">Tagalog</option>
                  <option value="Waray">Waray</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tone</Label>
                <Select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)}>
                  <option value="Soft">Soft</option>
                  <option value="Direct">Direct</option>
                  <option value="Value-Focused">Value-Focused</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Angle</Label>
                <Select value={angle} onChange={(event) => setAngle(event.target.value as MessageAngle)}>
                  {angleOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Business Name (optional)</Label>
                <Input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="ABC Spa" />
              </div>
              <div className="space-y-1">
                <Label>Location (optional)</Label>
                <Input value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder="Tacloban City" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Extra Context (optional)</Label>
              <Textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Any offer details, campaign angle, or specific note you want included."
              />
            </div>

            <Button type="button" onClick={handleGenerateQuickMessage} disabled={generating}>
              {generating ? "Generating..." : "Generate Message"}
            </Button>
            {quickMessage ? <p className="text-sm text-slate-700 dark:text-slate-200">{quickMessage}</p> : null}

            {variants.length > 0 ? (
              <div className="space-y-3">
                {variants.map((variant) => (
                  <div key={variant.variant_label} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {selectedCategory} Variant {variant.variant_label}
                    </p>
                    <p className="text-sm text-slate-800 dark:text-slate-100">{variant.message_text}</p>
                    <div className="mt-3">
                      <Button type="button" variant="secondary" size="sm" onClick={() => copyText(variant.message_text)}>
                        Copy Variant {variant.variant_label}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showConversationAssistant ? (
        <Card>
          <CardHeader>
            <CardTitle>Conversation Reply Assistant (Image + Text)</CardTitle>
            <CardDescription>
              Upload a screenshot of the conversation and/or paste conversation text to generate a best reply suggestion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Conversation Text (optional if image uploaded)</Label>
              <Textarea
                value={conversationText}
                onChange={(event) => setConversationText(event.target.value)}
                placeholder="Paste the customer message or chat snippet..."
              />
            </div>

            <div className="space-y-1">
              <Label>Upload Screenshot (PNG, JPG, WEBP)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onUploadImage(file);
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Upload Image
                </Button>
                {fileName ? (
                  <Button type="button" variant="ghost" onClick={clearUploadedImage}>
                    Remove Image
                  </Button>
                ) : null}
              </div>
              {fileName ? (
                <p className="text-xs text-slate-600 dark:text-slate-300">Loaded file: {fileName}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-300">No image uploaded yet.</p>
              )}
            </div>

            <Button type="button" onClick={handleGenerateReply} disabled={replyLoading}>
              {replyLoading ? "Generating..." : "Generate Best Reply"}
            </Button>
            {replyMessage ? <p className="text-sm text-slate-700 dark:text-slate-200">{replyMessage}</p> : null}

            {reply ? (
              <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Detected Intent: {reply.detected_intent}</p>
                <div>
                  <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Best Reply</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{reply.primary_reply}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => copyText(reply.primary_reply)}
                  >
                    Copy Best Reply
                  </Button>
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Alternatives</p>
                  {reply.alternatives.map((alt, index) => (
                    <div key={`${alt}-${index}`} className="mb-2 rounded-md border border-slate-200 p-2 text-sm text-slate-800 dark:border-slate-700 dark:text-slate-100">
                      <p>{alt}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => copyText(alt)}
                      >
                        Copy Alternative {index + 1}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
