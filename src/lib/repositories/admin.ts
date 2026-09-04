import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database, PublicationStatus, VerificationStatus } from "@/types/database";
import type {
  AdminCategoryReviewItem,
  AdminDashboardModel,
  AdminSoftwareReviewItem,
  CategoryId,
  SoftwareId,
} from "@/types/models";

export interface AdminRepositoryError {
  code: string;
  message: string;
}

export type AdminDashboardResult =
  | { status: "success"; dashboard: AdminDashboardModel }
  | { status: "error"; error: AdminRepositoryError };

interface SoftwareQueueRow {
  software_id: string;
  slug: string;
  software_name: string;
  vendor: string;
  publication_status: PublicationStatus;
  verification_status: VerificationStatus | null;
}

interface CategoryQueueRow {
  category_id: string;
  slug: string;
  category_name: string;
  publication_status: PublicationStatus;
}

function repositoryError(error: PostgrestError): AdminRepositoryError {
  return { code: error.code, message: error.message };
}

async function countRows(
  client: SupabaseClient<Database>,
  table: "software" | "categories",
  column: "publication_status" | "verification_status",
  value: string,
) {
  const idColumn = table === "software" ? "software_id" : "category_id";
  return client.from(table).select(idColumn, { count: "exact", head: true }).eq(column, value);
}

export async function getAdminDashboard(
  client: SupabaseClient<Database>,
): Promise<AdminDashboardResult> {
  const [
    softwareInReview,
    softwarePublished,
    softwareNeedsVerification,
    categoriesInReview,
    categoriesPublished,
    softwareQueue,
    categoryQueue,
  ] = await Promise.all([
    countRows(client, "software", "publication_status", "in_review"),
    countRows(client, "software", "publication_status", "published"),
    countRows(client, "software", "verification_status", "needs_verification"),
    countRows(client, "categories", "publication_status", "in_review"),
    countRows(client, "categories", "publication_status", "published"),
    client
      .from("software")
      .select("software_id, slug, software_name, vendor, publication_status, verification_status")
      .eq("publication_status", "in_review")
      .order("software_name")
      .overrideTypes<SoftwareQueueRow[], { merge: false }>(),
    client
      .from("categories")
      .select("category_id, slug, category_name, publication_status")
      .eq("publication_status", "in_review")
      .order("category_name")
      .overrideTypes<CategoryQueueRow[], { merge: false }>(),
  ]);

  const firstError = [
    softwareInReview.error,
    softwarePublished.error,
    softwareNeedsVerification.error,
    categoriesInReview.error,
    categoriesPublished.error,
    softwareQueue.error,
    categoryQueue.error,
  ].find((error): error is PostgrestError => Boolean(error));
  if (firstError) return { status: "error", error: repositoryError(firstError) };

  const softwareItems: AdminSoftwareReviewItem[] = (softwareQueue.data ?? []).map((row) => ({
    id: row.software_id as SoftwareId,
    slug: row.slug,
    name: row.software_name,
    vendorName: row.vendor,
    publicationStatus: row.publication_status,
    verificationStatus: row.verification_status,
  }));
  const categoryItems: AdminCategoryReviewItem[] = (categoryQueue.data ?? []).map((row) => ({
    id: row.category_id as CategoryId,
    slug: row.slug,
    name: row.category_name,
    publicationStatus: row.publication_status,
  }));

  return {
    status: "success",
    dashboard: {
      summary: {
        softwareInReview: softwareInReview.count ?? 0,
        softwarePublished: softwarePublished.count ?? 0,
        softwareNeedsVerification: softwareNeedsVerification.count ?? 0,
        categoriesInReview: categoriesInReview.count ?? 0,
        categoriesPublished: categoriesPublished.count ?? 0,
      },
      softwareQueue: softwareItems,
      categoryQueue: categoryItems,
    },
  };
}
