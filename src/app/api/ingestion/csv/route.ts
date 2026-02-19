import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { bulkCreateLeads } from "@/lib/services/data-service";
import { csvImportSchema, leadUpsertSchema } from "@/lib/validations";
import { normalizeUrl } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 20, windowMs: 60_000, bucket: "csv-import" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = csvImportSchema.parse(body);

    const errors: Array<{ row: number; message: string }> = [];
    const insertRows = payload.rows.flatMap((row, idx) => {
      const data = {
        business_name: payload.mapping.business_name ? String(row[payload.mapping.business_name] ?? "").trim() : "",
        facebook_url: payload.mapping.facebook_url ? normalizeUrl(String(row[payload.mapping.facebook_url] ?? "")) : "",
        website_url: payload.mapping.website_url ? normalizeUrl(String(row[payload.mapping.website_url] ?? "")) : "",
        phone: payload.mapping.phone ? String(row[payload.mapping.phone] ?? "").trim() : "",
        email: payload.mapping.email ? String(row[payload.mapping.email] ?? "").trim() : "",
        address: payload.mapping.address ? String(row[payload.mapping.address] ?? "").trim() : "",
        category_id: payload.category_id ?? null,
        location_id: payload.location_id ?? null,
        source: "csv",
      };

      const validated = leadUpsertSchema.safeParse(data);
      if (!validated.success) {
        errors.push({
          row: idx + 1,
          message: validated.error.issues.map((issue) => issue.message).join(", "),
        });
        return [];
      }

      return [
        {
          ...validated.data,
          status: "NEW" as const,
        },
      ];
    });

    const inserted = await bulkCreateLeads(insertRows);

    return NextResponse.json({
      imported: inserted.length,
      rejected: errors.length,
      errors,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
