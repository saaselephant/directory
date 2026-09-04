import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getPublicCategoryBySlug,
  listPublicCategorySoftwareIds,
} from "@/lib/repositories/categories";
import {
  listPublishedSoftwareMatching,
  type PublishedSoftwareError,
} from "@/lib/repositories/software";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { SoftwareCatalogItem } from "@/types/models";

export const SOFTWARE_SEARCH_QUERY_MAX_LENGTH = 100;
const CATEGORY_SLUG_MAX_LENGTH = 200;

export interface SoftwareSearchParams {
  query?: string | null;
  categorySlug?: string | null;
}

export interface NormalizedSoftwareSearchParams {
  query: string;
  categorySlug: string;
}

export type SoftwareSearchResult =
  | { status: "success"; items: SoftwareCatalogItem[]; filters: NormalizedSoftwareSearchParams }
  | {
      status: "empty";
      items: [];
      reason: "no_matches" | "category_unavailable";
      filters: NormalizedSoftwareSearchParams;
    }
  | { status: "error"; error: PublishedSoftwareError; filters: NormalizedSoftwareSearchParams };

export function normalizeSoftwareSearchParams(
  params: SoftwareSearchParams,
): NormalizedSoftwareSearchParams {
  return {
    query: (params.query ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, SOFTWARE_SEARCH_QUERY_MAX_LENGTH),
    categorySlug: (params.categorySlug ?? "").trim().slice(0, CATEGORY_SLUG_MAX_LENGTH),
  };
}

export async function searchPublishedSoftware(
  params: SoftwareSearchParams,
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<SoftwareSearchResult> {
  const filters = normalizeSoftwareSearchParams(params);
  let softwareIds: string[] | undefined;

  if (filters.categorySlug) {
    const category = await getPublicCategoryBySlug(filters.categorySlug, client);
    if (category.status === "error") return { status: "error", error: category.error, filters };
    if (category.status === "not_found") {
      return { status: "empty", items: [], reason: "category_unavailable", filters };
    }

    const relationships = await listPublicCategorySoftwareIds(category.categoryId, client);
    if (relationships.status === "error") {
      return { status: "error", error: relationships.error, filters };
    }
    softwareIds = relationships.softwareIds;
  }

  const result = await listPublishedSoftwareMatching(
    { query: filters.query || undefined, softwareIds },
    client,
  );
  if (result.status === "error") return { ...result, filters };
  if (result.status === "empty") {
    return { ...result, reason: "no_matches", filters };
  }
  return { ...result, filters };
}
