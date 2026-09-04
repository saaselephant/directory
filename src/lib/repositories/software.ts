import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { SoftwareCatalogItem, SoftwareId } from "@/types/models";

const SOFTWARE_CATALOG_SELECT = `
  software_id,
  slug,
  software_name,
  short_description,
  best_for,
  pricing,
  free_plan,
  free_trial,
  website_url,
  vendor,
  vendor_id,
  vendors (
    vendor_id,
    vendor_name,
    slug,
    website_url
  )
` as const;

interface SoftwareCatalogQueryRow {
  software_id: string;
  slug: string;
  software_name: string;
  short_description: string;
  best_for: string | null;
  pricing: string | null;
  free_plan: boolean | null;
  free_trial: boolean | null;
  website_url: string;
  vendor: string;
  vendor_id: string | null;
  vendors: {
    vendor_id: string;
    vendor_name: string;
    slug: string;
    website_url: string | null;
  } | null;
}

export type PublishedSoftwareResult =
  | { status: "success"; items: SoftwareCatalogItem[] }
  | { status: "empty"; items: [] }
  | { status: "error"; error: PublishedSoftwareError };

export type PublishedSoftwareDetailResult =
  | { status: "success"; item: SoftwareCatalogItem }
  | { status: "not_found" }
  | { status: "error"; error: PublishedSoftwareError };

export interface PublishedSoftwareError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

interface PublishedSoftwareQuery {
  query?: string;
  softwareIds?: string[];
}

const SEARCH_COLUMNS = ["software_name", "short_description", "vendor", "best_for"] as const;

function escapePostgrestFilterValue(value: string): string {
  return value.replace(/[\\%_"]/g, "\\$&");
}

function toRepositoryError(error: PostgrestError): PublishedSoftwareError {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

function mapSoftwareCatalogItem(row: SoftwareCatalogQueryRow): SoftwareCatalogItem {
  return {
    id: row.software_id as SoftwareId,
    slug: row.slug,
    name: row.software_name,
    description: row.short_description,
    bestFor: row.best_for,
    pricing: row.pricing,
    hasFreePlan: row.free_plan ?? false,
    hasFreeTrial: row.free_trial ?? false,
    websiteUrl: row.website_url,
    vendor: {
      id: row.vendors?.vendor_id ?? null,
      name: row.vendors?.vendor_name ?? row.vendor,
      slug: row.vendors?.slug ?? null,
      websiteUrl: row.vendors?.website_url ?? null,
    },
  };
}

export async function listPublishedSoftware(
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareResult> {
  return listPublishedSoftwareMatching({}, client);
}

export async function listPublishedSoftwareMatching(
  filters: PublishedSoftwareQuery,
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareResult> {
  if (filters.softwareIds?.length === 0) {
    return { status: "empty", items: [] };
  }

  let query = client
    .from("software")
    .select(SOFTWARE_CATALOG_SELECT)
    .eq("publication_status", "published");

  if (filters.softwareIds) {
    query = query.in("software_id", filters.softwareIds);
  }

  if (filters.query) {
    const pattern = `"%${escapePostgrestFilterValue(filters.query)}%"`;
    query = query.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(","));
  }

  const { data, error } = await query
    .order("software_name", { ascending: true })
    .overrideTypes<SoftwareCatalogQueryRow[], { merge: false }>();

  if (error) {
    return { status: "error", error: toRepositoryError(error) };
  }

  if (!data || data.length === 0) {
    return { status: "empty", items: [] };
  }

  const items = data.map(mapSoftwareCatalogItem);

  return { status: "success", items };
}

export async function listPublishedSoftwareByIds(
  softwareIds: string[],
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareResult> {
  return listPublishedSoftwareMatching({ softwareIds }, client);
}

export async function getPublishedSoftwareBySlug(
  slug: string,
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareDetailResult> {
  const { data, error } = await client
    .from("software")
    .select(SOFTWARE_CATALOG_SELECT)
    .eq("slug", slug)
    .eq("publication_status", "published")
    .maybeSingle()
    .overrideTypes<SoftwareCatalogQueryRow | null, { merge: false }>();

  if (error) {
    return { status: "error", error: toRepositoryError(error) };
  }

  if (!data) {
    return { status: "not_found" };
  }

  return { status: "success", item: mapSoftwareCatalogItem(data) };
}
