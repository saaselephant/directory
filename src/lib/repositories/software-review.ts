import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PublicationStatus, VerificationStatus } from "@/types/database";
import type { SoftwareReview, SoftwareReviewEvent } from "@/types/models";

// Match the explicit schema contract at the RPC boundary. The hand-maintained
// Database type currently makes Supabase's inferred RPC arguments resolve to never.
type ReviewRpcClient = {
  rpc(
    name: "saaselephant_get_software_review",
    args: Database["public"]["Functions"]["saaselephant_get_software_review"]["Args"],
  ): PromiseLike<{
    data: Database["public"]["Functions"]["saaselephant_get_software_review"]["Returns"] | null;
    error: unknown;
  }>;
  rpc(
    name: "saaselephant_get_software_verification_history",
    args: Database["public"]["Functions"]["saaselephant_get_software_verification_history"]["Args"],
  ): PromiseLike<{
    data:
      | Database["public"]["Functions"]["saaselephant_get_software_verification_history"]["Returns"]
      | null;
    error: unknown;
  }>;
};

export const SOFTWARE_REVIEW_HISTORY_LIMIT = 50;
export type SoftwareReviewResult =
  | { status: "success"; review: SoftwareReview }
  | { status: "not_found" }
  | { status: "error" };
export type SoftwareReviewHistoryResult =
  | { status: "success"; events: SoftwareReviewEvent[] }
  | { status: "error" };

const publicationStates: readonly string[] = ["draft", "in_review", "published", "archived"];
const verificationStates: readonly string[] = [
  "needs_verification",
  "pending",
  "verified",
  "failed",
  "stale",
];
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function timestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}
function publication(value: unknown): PublicationStatus | null {
  return typeof value === "string" && publicationStates.includes(value)
    ? (value as PublicationStatus)
    : null;
}
function verification(value: unknown): VerificationStatus | null {
  return typeof value === "string" && verificationStates.includes(value)
    ? (value as VerificationStatus)
    : null;
}
function validId(value: string) {
  return value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
}

// No public-client fallback: callers must supply the authenticated user-scoped client.
// Each database function independently enforces active administrator authorization.
export async function getSoftwareReview(
  recordId: string,
  client: SupabaseClient<Database>,
): Promise<SoftwareReviewResult> {
  if (!validId(recordId)) return { status: "not_found" };
  try {
    const { data, error } = await (client as unknown as ReviewRpcClient).rpc(
      "saaselephant_get_software_review",
      {
        p_software_id: recordId.trim(),
      },
    );
    if (error || !Array.isArray(data)) return { status: "error" };
    if (data.length === 0) return { status: "not_found" };
    const rows: unknown[] = data;
    const first = rows[0];
    if (!record(first) || !text(first.software_name) || first.software_id !== recordId.trim()) {
      return { status: "error" };
    }
    const categories: SoftwareReview["categories"] = [];
    for (const row of rows) {
      if (!record(row) || row.software_id !== first.software_id) return { status: "error" };
      if (row.category_id !== null) {
        if (!text(row.category_id) || !text(row.category_name)) return { status: "error" };
        categories.push({
          id: row.category_id as string,
          name: row.category_name as string,
          slug: text(row.category_slug),
          publicationStatus: publication(row.category_publication_status),
        });
      }
    }
    return {
      status: "success",
      review: {
        id: first.software_id as string,
        name: first.software_name as string,
        slug: text(first.slug),
        vendorName: text(first.vendor_name),
        legacyVendor: text(first.legacy_vendor),
        websiteUrl: text(first.website_url),
        shortDescription: text(first.short_description),
        fullDescription: text(first.full_description),
        bestFor: text(first.best_for),
        pricing: text(first.pricing),
        freePlan: typeof first.free_plan === "boolean" ? first.free_plan : null,
        freeTrial: typeof first.free_trial === "boolean" ? first.free_trial : null,
        publicationStatus: publication(first.publication_status),
        verificationStatus: verification(first.verification_status),
        verifiedAt: timestamp(first.verified_at),
        categories,
      },
    };
  } catch {
    return { status: "error" };
  }
}

export async function getSoftwareVerificationHistory(
  recordId: string,
  client: SupabaseClient<Database>,
): Promise<SoftwareReviewHistoryResult> {
  if (!validId(recordId)) return { status: "error" };
  try {
    const { data, error } = await (client as unknown as ReviewRpcClient).rpc(
      "saaselephant_get_software_verification_history",
      {
        p_software_id: recordId.trim(),
      },
    );
    if (error || !Array.isArray(data) || data.length > SOFTWARE_REVIEW_HISTORY_LIMIT)
      return { status: "error" };
    const events: SoftwareReviewEvent[] = [];
    for (const row of data as unknown[]) {
      if (!record(row)) return { status: "error" };
      const result = verification(row.result);
      const verifiedAt = timestamp(row.verified_at);
      if (!result || !verifiedAt) return { status: "error" };
      events.push({
        result,
        verifiedAt,
        sourceUrl: text(row.source_url),
        sourceReference: text(row.source_reference),
        notes: text(row.notes),
        reason: text(row.reason),
      });
    }
    return { status: "success", events };
  } catch {
    return { status: "error" };
  }
}
