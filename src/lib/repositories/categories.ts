import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { listPublishedSoftwareByIds } from "@/lib/repositories/software";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { PublicCategory, SoftwareCatalogItem } from "@/types/models";

const PUBLIC_CATEGORY_SELECT = "category_id, slug, category_name, description" as const;

interface PublicCategoryQueryRow {
  category_id: string;
  slug: string;
  category_name: string;
  description: string | null;
}

export interface PublicCategoryError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

export type PublicCategoriesResult =
  | { status: "success"; categories: PublicCategory[] }
  | { status: "empty"; categories: [] }
  | { status: "error"; error: PublicCategoryError };

export type PublicCategoryResult =
  | { status: "success"; category: PublicCategory; categoryId: string }
  | { status: "not_found" }
  | { status: "error"; error: PublicCategoryError };

export type PublishedSoftwareByCategoryResult =
  | { status: "success"; category: PublicCategory; items: SoftwareCatalogItem[] }
  | { status: "not_found" }
  | { status: "error"; error: PublicCategoryError };

function toCategoryError(error: PostgrestError): PublicCategoryError {
  return { code: error.code, message: error.message, details: error.details, hint: error.hint };
}

function mapCategory(row: PublicCategoryQueryRow): PublicCategory {
  return { slug: row.slug, name: row.category_name, description: row.description };
}

export async function listPublicCategories(
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublicCategoriesResult> {
  const { data, error } = await client
    .from("categories")
    .select(PUBLIC_CATEGORY_SELECT)
    .eq("publication_status", "published")
    .order("category_name", { ascending: true })
    .overrideTypes<PublicCategoryQueryRow[], { merge: false }>();

  if (error) return { status: "error", error: toCategoryError(error) };
  if (!data || data.length === 0) return { status: "empty", categories: [] };
  return { status: "success", categories: data.map(mapCategory) };
}

export async function getPublicCategoryBySlug(
  slug: string,
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublicCategoryResult> {
  const { data, error } = await client
    .from("categories")
    .select(PUBLIC_CATEGORY_SELECT)
    .eq("slug", slug)
    .eq("publication_status", "published")
    .maybeSingle()
    .overrideTypes<PublicCategoryQueryRow | null, { merge: false }>();

  if (error) return { status: "error", error: toCategoryError(error) };
  if (!data) return { status: "not_found" };
  return { status: "success", category: mapCategory(data), categoryId: data.category_id };
}

export async function listPublishedSoftwareByCategorySlug(
  slug: string,
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareByCategoryResult> {
  const categoryResult = await getPublicCategoryBySlug(slug, client);
  if (categoryResult.status !== "success") return categoryResult;

  const { data, error } = await client
    .from("software_categories")
    .select("software_id")
    .eq("category_id", categoryResult.categoryId)
    .overrideTypes<Array<{ software_id: string }>, { merge: false }>();

  if (error) return { status: "error", error: toCategoryError(error) };

  const softwareResult = await listPublishedSoftwareByIds(
    (data ?? []).map((row) => row.software_id),
    client,
  );

  if (softwareResult.status === "error") return softwareResult;

  return {
    status: "success",
    category: categoryResult.category,
    items: softwareResult.status === "success" ? softwareResult.items : [],
  };
}

export async function listPublicCategorySoftwareIds(
  categoryId: string,
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<
  { status: "success"; softwareIds: string[] } | { status: "error"; error: PublicCategoryError }
> {
  const { data, error } = await client
    .from("software_categories")
    .select("software_id")
    .eq("category_id", categoryId)
    .overrideTypes<Array<{ software_id: string }>, { merge: false }>();

  if (error) return { status: "error", error: toCategoryError(error) };
  return { status: "success", softwareIds: (data ?? []).map((row) => row.software_id) };
}

/** Reads only public category relationships; existing RLS also requires published software. */
export async function listPublicCategoriesForSoftware(
  softwareId: string,
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublicCategoriesResult> {
  const { data: relationships, error: relationshipError } = await client
    .from("software_categories")
    .select("category_id")
    .eq("software_id", softwareId)
    .overrideTypes<Array<{ category_id: string }>, { merge: false }>();
  if (relationshipError) return { status: "error", error: toCategoryError(relationshipError) };
  if (!relationships?.length) return { status: "empty", categories: [] };
  const { data, error } = await client
    .from("categories")
    .select(PUBLIC_CATEGORY_SELECT)
    .in("category_id", [...new Set(relationships.map((row) => row.category_id))])
    .eq("publication_status", "published")
    .order("category_name", { ascending: true })
    .overrideTypes<PublicCategoryQueryRow[], { merge: false }>();
  if (error) return { status: "error", error: toCategoryError(error) };
  if (!data?.length) return { status: "empty", categories: [] };
  return { status: "success", categories: data.map(mapCategory) };
}
