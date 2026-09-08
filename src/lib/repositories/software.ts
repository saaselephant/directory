import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import softwareLogoManifest from "@/generated/software-logo-manifest.json";
import type { Database } from "@/types/database";
import type { SoftwareCatalogItem, SoftwareId } from "@/types/models";

const SOFTWARE_LOGOS = softwareLogoManifest.logos as Record<
  string,
  { src: string; alt: string | null }
>;

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
  | { status: "success"; items: SoftwareCatalogItem[]; total?: number }
  | { status: "empty"; items: []; total?: number }
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

export interface PublishedSoftwareIndexItem {
  id: SoftwareId;
  slug: string;
  name: string;
}

export type PublishedSoftwareIndexResult =
  | { status: "success"; items: PublishedSoftwareIndexItem[]; total: number }
  | { status: "empty"; items: []; total: number }
  | { status: "error"; error: PublishedSoftwareError };

export type PublishedSoftwareInitialsResult =
  | { status: "success"; letters: string[] }
  | { status: "error"; error: PublishedSoftwareError };

interface PublishedSoftwareQuery {
  query?: string;
  softwareIds?: string[];
  page?: number;
  pageSize?: number;
}

const SEARCH_COLUMNS = ["software_name", "short_description", "vendor", "best_for"] as const;
const SOFTWARE_INITIALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

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
  const logo = SOFTWARE_LOGOS[row.slug];
  return {
    id: row.software_id as SoftwareId,
    slug: row.slug,
    name: row.software_name,
    logo: logo ?? null,
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
    return { status: "empty", items: [], total: 0 };
  }

  const paginated = filters.page !== undefined && filters.pageSize !== undefined;
  let query = client
    .from("software")
    .select(SOFTWARE_CATALOG_SELECT, paginated ? { count: "exact" } : undefined)
    .eq("publication_status", "published");

  if (filters.softwareIds) {
    query = query.in("software_id", filters.softwareIds);
  }

  if (filters.query) {
    const pattern = `"%${escapePostgrestFilterValue(filters.query)}%"`;
    query = query.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(","));
  }

  let orderedQuery = query.order("software_name", { ascending: true });
  if (paginated) {
    const from = (filters.page! - 1) * filters.pageSize!;
    orderedQuery = orderedQuery.range(from, from + filters.pageSize! - 1);
  }

  const { data, error, count } = await orderedQuery.overrideTypes<
    SoftwareCatalogQueryRow[],
    { merge: false }
  >();

  if (error) {
    return { status: "error", error: toRepositoryError(error) };
  }

  if (!data || data.length === 0) {
    return { status: "empty", items: [], total: count ?? 0 };
  }

  const items = data.map(mapSoftwareCatalogItem);

  return { status: "success", items, ...(paginated ? { total: count ?? items.length } : {}) };
}

export async function listPublishedSoftwareByIds(
  softwareIds: string[],
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareResult> {
  return listPublishedSoftwareMatching({ softwareIds }, client);
}

export async function listPublishedSoftwareIndex(
  {
    letter,
    page,
    pageSize,
  }: {
    letter?: string;
    page: number;
    pageSize: number;
  },
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareIndexResult> {
  let query = client
    .from("software")
    .select("software_id, slug, software_name", { count: "exact" })
    .eq("publication_status", "published");

  if (letter) {
    query = query.ilike("software_name", `${letter}%`);
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("software_name", { ascending: true })
    .range(from, from + pageSize - 1)
    .overrideTypes<
      { software_id: string; slug: string; software_name: string }[],
      { merge: false }
    >();

  if (error) {
    return { status: "error", error: toRepositoryError(error) };
  }

  if (!data || data.length === 0) {
    return { status: "empty", items: [], total: count ?? 0 };
  }

  return {
    status: "success",
    items: data.map((item) => ({
      id: item.software_id as SoftwareId,
      slug: item.slug,
      name: item.software_name,
    })),
    total: count ?? data.length,
  };
}

export async function listPublishedSoftwareInitials(
  client: SupabaseClient<Database> = createServerSupabaseClient(),
): Promise<PublishedSoftwareInitialsResult> {
  const results = await Promise.all(
    SOFTWARE_INITIALS.map(async (letter) => {
      const { count, error } = await client
        .from("software")
        .select("software_id", { count: "exact", head: true })
        .eq("publication_status", "published")
        .ilike("software_name", `${letter}%`);

      return { letter, count: count ?? 0, error };
    }),
  );
  const failed = results.find(({ error }) => error);
  if (failed?.error) {
    return { status: "error", error: toRepositoryError(failed.error) };
  }

  return {
    status: "success",
    letters: results.filter(({ count }) => count > 0).map(({ letter }) => letter),
  };
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
