import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MessageTools } from "@/components/dashboard/message-tools";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { lintOutreachText, sanitizeOutreachText } from "@/lib/compliance";
import {
  deleteMessageTemplate,
  getCategories,
  getMessageTemplates,
  upsertMessageTemplate,
} from "@/lib/services/data-service";
import { languageSchema, toneSchema } from "@/lib/validations";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const noticeTone = typeof params.notice_tone === "string" ? params.notice_tone : "neutral";
  const [categories, templates] = await Promise.all([getCategories(), getMessageTemplates()]);
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  async function saveTemplateAction(formData: FormData) {
    "use server";
    const categoryId = String(formData.get("category_id") ?? "");
    const language = languageSchema.parse(String(formData.get("language") ?? ""));
    const tone = toneSchema.parse(String(formData.get("tone") ?? ""));
    const templateText = String(formData.get("template_text") ?? "").trim();
    if (!templateText) throw new Error("Template text is required.");
    const issues = lintOutreachText(templateText);
    const sanitized = sanitizeOutreachText(templateText);
    const highIssues = issues.filter((issue) => issue.severity === "high");

    await upsertMessageTemplate({
      category_id: categoryId,
      language,
      tone,
      template_text: sanitized,
    });
    revalidatePath("/dashboard/templates");
    if (issues.length > 0) {
      redirect(
        `/dashboard/templates?notice=${encodeURIComponent(
          `Template saved with compliance cleanup (${highIssues.length} high, ${issues.length - highIssues.length} medium).`,
        )}&notice_tone=warn`,
      );
    }
    redirect("/dashboard/templates?notice=Template%20saved.&notice_tone=success");
  }

  async function deleteTemplateAction(formData: FormData) {
    "use server";
    const templateId = String(formData.get("template_id") ?? "");
    if (!templateId) return;
    await deleteMessageTemplate(templateId);
    revalidatePath("/dashboard/templates");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Message Templates</h1>
        <p className="text-sm text-slate-600">Seed and edit base templates per category, language, and tone.</p>
        {notice ? (
          <p
            className={`mt-2 rounded-md border px-3 py-2 text-sm ${
              noticeTone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : noticeTone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {notice}
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add or Update Template</CardTitle>
          <CardDescription>Templates are used as guidance during AI message generation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveTemplateAction} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select name="category_id" required>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Language</Label>
                <Select name="language" required>
                  <option value="Taglish">Taglish</option>
                  <option value="English">English</option>
                  <option value="Tagalog">Tagalog</option>
                  <option value="Waray">Waray</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tone</Label>
                <Select name="tone" required>
                  <option value="Soft">Soft</option>
                  <option value="Direct">Direct</option>
                  <option value="Value-Focused">Value-Focused</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Template Text</Label>
              <Textarea name="template_text" required placeholder="Hi, this is Jay from J-Digital Solutions..." />
            </div>
            <Button type="submit">Save Template</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Tone</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead className="w-[120px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>{categoryMap.get(template.category_id) ?? "Unknown"}</TableCell>
                    <TableCell>{template.language}</TableCell>
                    <TableCell>{template.tone}</TableCell>
                    <TableCell className="max-w-[620px] text-xs text-slate-700">{template.template_text}</TableCell>
                    <TableCell className="text-right">
                      <ConfirmActionForm
                        action={deleteTemplateAction}
                        fields={{ template_id: template.id }}
                        buttonLabel="Delete"
                        confirmTitle="Delete Template?"
                        confirmDescription="This template will be permanently deleted."
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <MessageTools categories={categories} />
    </div>
  );
}
